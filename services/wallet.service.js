const Wallet = require('../models/wallet.model');
const PaymentMethod = require('../models/payment-method.model');
const Transaction = require('../models/transaction.model');
const StripeService = require('./stripe.service');
const KYCVerification = require("../models/kyc-verification.model");
const NotificationService = require("./notification.service");
const crypto = require("crypto");
const qrcode = require("qrcode");
const logger = require("../utils/logger");
// const util = require('util');
// const setTimeoutPromise = util.promisify(setTimeout);

const STRIPE_TEST_PAYMENT_METHODS = new Set([
  'pm_card_visa', 'pm_card_mastercard', 'pm_card_amex', 'pm_card_discover',
  'pm_card_diners', 'pm_card_jcb', 'pm_card_unionpay', 'pm_card_visa_debit',
  'pm_card_mastercard_prepaid', 'pm_card_threeDSecure2Required', 'pm_usBankAccount',
  'pm_sepaDebit', 'pm_bacsDebit', 'pm_alipay', 'pm_wechat'
]);

class WalletService {
  static async createWallet(userId, email, initialBalance) {
    try {
      // Check KYC status first
      const kycVerification = await KYCVerification.findOne({ user: userId });
      if (!kycVerification || kycVerification.status !== "approved") {
        throw new Error(
          "KYC verification is not approved. Cannot create wallet."
        );
      }

      // Check if user already has a wallet
      const existingWallet = await Wallet.findOne({ user: userId });
      if (existingWallet) {
        throw new Error("User already has a wallet");
      }

      const stripeCustomer = await StripeService.createCustomer(email);

      const wallet = new Wallet({
        user: userId,
        balance: initialBalance,
        stripeCustomerId: stripeCustomer.id,
      });

      await wallet.save();

      if (initialBalance > 0) {
        const transaction = await this.createTransaction("deposit", initialBalance, null, wallet._id);
        // Send notification for initial balance as a deposit
        await NotificationService.notifyDeposit(userId, initialBalance, transaction._id);
      }

      logger.info(`Wallet created for user ${userId} with initial balance ${initialBalance}`);

      return wallet;
    } catch (error) {
      logger.error("Error in createWallet:", error);
      throw new Error(`Failed to create wallet: ${error.message}`);
    }
  }

  static async deposit(userId, amount, paymentMethodId) {
    try {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      const paymentMethod = await PaymentMethod.findOne({
        user: userId,
        stripePaymentMethodId: paymentMethodId
      });

      if (!paymentMethod) {
        throw new Error("Payment method not found or does not belong to this user");
      }

      let paymentIntent;
      // if (STRIPE_TEST_PAYMENT_METHODS.has(paymentMethodId)) {
      //   // For test payment methods, we'll simulate a successful payment
      //   paymentIntent = {
      //     id: `pi_simulated_${crypto.randomBytes(16).toString("hex")}`,
      //     status: "succeeded",
      //     amount: amount * 100 // Convert to cents for consistency with Stripe
      //   };
      //   logger.info(`Simulated payment intent for test payment method: ${JSON.stringify(paymentIntent)}`);
      // } else {
        // For real payment methods, proceed with Stripe
        paymentIntent = await StripeService.createPaymentIntent(
          amount * 100, // Convert to cents for Stripe
          "usd",
          wallet.stripeCustomerId
        );

        paymentIntent = await StripeService.confirmPaymentIntent(
          paymentIntent.id,
          paymentMethodId
        );
        //}

      if (paymentIntent.status === "succeeded") {
        const depositAmount = paymentIntent.amount / 100; // Convert back to dollars
        wallet.balance += depositAmount;
        await wallet.save();

        const transaction = await this.createTransaction(
          "deposit",
          depositAmount,
          null,
          wallet._id,
          paymentIntent.id
        );

        // Send notification
        await NotificationService.notifyDeposit(wallet.user, depositAmount, transaction._id);

        return {
          balance: wallet.balance,
          transactionId: paymentIntent.id,
        };
      } else {
        throw new Error("Deposit failed");
      }
    } catch (error) {
      logger.error("Error in deposit:", error);
      throw new Error(`Deposit failed: ${error.message}`);
    }
  }

  static async createPaymentIntent(userId, amount) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const paymentIntent = await StripeService.createPaymentIntent(
      amount * 100,
      "usd",
      wallet.stripeCustomerId
    );

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  static async confirmPaymentIntent(userId, paymentIntentId, paymentMethodId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const paymentMethod = await PaymentMethod.findOne({
      user: userId,
      stripePaymentMethodId: paymentMethodId
    });

    if (!paymentMethod) {
      throw new Error("Payment method not found or does not belong to this user");
    }

    let paymentIntent;
    // if (STRIPE_TEST_PAYMENT_METHODS.has(paymentMethodId)) {
    //   // For test payment methods, we'll simulate a successful confirmation
    //   paymentIntent = {
    //     id: paymentIntentId,
    //     status: "succeeded",
    //     amount: 5000 // Simulated amount in cents
    //   };
    //   logger.info(`Simulated payment intent confirmation for test payment method: ${JSON.stringify(paymentIntent)}`);
    // } else {
      // For real payment methods, proceed with Stripe
      paymentIntent = await StripeService.confirmPaymentIntent(
        paymentIntentId,
        paymentMethodId
      );
      //}

    if (paymentIntent.status === "succeeded") {
      const amount = paymentIntent.amount / 100; // Convert from cents to dollars
      wallet.balance += amount;
      await wallet.save();

      const transaction = await this.createTransaction(
        "deposit",
        amount,
        null,
        wallet._id,
        paymentIntent.id
      );

      // Send notification
      await NotificationService.notifyDeposit(userId, amount, transaction._id);

      return { balance: wallet.balance, transactionId: paymentIntent.id };
    } else {
      throw new Error("Payment failed");
    }
  }

  static async getPaymentStatus(userId, paymentIntentId) {
    // Verify that the payment intent belongs to this user
    const transaction = await Transaction.findOne({
      stripePaymentIntentId: paymentIntentId,
    }).populate('fromWallet').populate('toWallet');

    if (!transaction) {
      throw new Error("Payment not found");
    }

    // Check both fromWallet and toWallet
    const isUserTransaction = (transaction.fromWallet && transaction.fromWallet.user.toString() === userId) ||
                              (transaction.toWallet && transaction.toWallet.user.toString() === userId);

    if (!isUserTransaction) {
      throw new Error("Payment does not belong to this user");
    }

    return {
      status: transaction.status,
      amount: transaction.amount,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      type: transaction.type,
      fromWallet: transaction.fromWallet ? transaction.fromWallet._id : null,
      toWallet: transaction.toWallet ? transaction.toWallet._id : null,
      // Add any other relevant fields
    };
  }

  static async getBalance(userId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error("Wallet not found");
    }
    return { balance: wallet.balance };
  }

  static async addPaymentMethod(userId, paymentMethodId) {
    try {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      // Check if the payment method already exists in the database
      const existingPaymentMethod = await PaymentMethod.findOne({ stripePaymentMethodId: paymentMethodId });
      if (existingPaymentMethod) {
        logger.info(`Payment method ${paymentMethodId} already exists for user ${userId}`);
        return { message: "Payment method already exists for this user" };
      }

      // Retrieve the payment method details from Stripe
      const stripePaymentMethod = await StripeService.retrievePaymentMethod(paymentMethodId);

      // Attach the payment method to the customer in Stripe
      await StripeService.attachPaymentMethodToCustomer(paymentMethodId, wallet.stripeCustomerId);

      // Create a new PaymentMethod document in the database
      const newPaymentMethod = new PaymentMethod({
        user: userId,
        stripePaymentMethodId: paymentMethodId,
        type: stripePaymentMethod.type,
        card: stripePaymentMethod.card ? {
          brand: stripePaymentMethod.card.brand,
          last4: stripePaymentMethod.card.last4,
          expMonth: stripePaymentMethod.card.exp_month,
          expYear: stripePaymentMethod.card.exp_year
        } : null,
        isDefault: false // You might want to set this based on some logic
      });

      await newPaymentMethod.save();

      // Send notification
      try {
        await NotificationService.notifyPaymentMethodAdded(
          userId,
          stripePaymentMethod.card.last4,
          stripePaymentMethod.card.brand
        );
      } catch (notificationError) {
        logger.error(`Error sending notification: ${notificationError.message}`);
      }

      return { message: "Payment method added successfully" };
    } catch (error) {
      logger.error(`Error in addPaymentMethod for user ${userId}: ${error.message}`);
      throw new Error(`Failed to add payment method: ${error.message}`);
    }
  }

  static async listPaymentMethods(userId) {
    try {
      const paymentMethods = await PaymentMethod.find({ user: userId }).sort({ createdAt: -1 });

      return paymentMethods.map(pm => ({
        id: pm.stripePaymentMethodId,
        type: pm.type,
        card: pm.card,
        isDefault: pm.isDefault
      }));
    } catch (error) {
      logger.error(`Error in listPaymentMethods for user ${userId}: ${error.message}`);
      throw new Error(`Failed to list payment methods: ${error.message}`);
    }
  }

  static async deletePaymentMethod(userId, paymentMethodId) {
    try {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      const paymentMethod = await PaymentMethod.findOne({
        user: userId,
        stripePaymentMethodId: paymentMethodId
      });

      if (!paymentMethod) {
        throw new Error("Payment method not found or does not belong to this user");
      }

      // Check if it's a test payment method
      if (STRIPE_TEST_PAYMENT_METHODS.has(paymentMethodId)) {
        logger.info(`Attempted to delete test payment method ${paymentMethodId} for user ${userId}`);
        await PaymentMethod.deleteOne({ _id: paymentMethod._id });
        return { message: "Test payment method removed from user's account" };
      }

      // For real payment methods, attempt to detach from Stripe
      try {
        await StripeService.detachPaymentMethod(paymentMethodId);
      } catch (stripeError) {
        // If Stripe couldn't find the payment method, it might have been deleted on Stripe's end
        if (stripeError.code === 'resource_missing') {
          logger.warn(`Payment method ${paymentMethodId} not found in Stripe, but exists in our database. Proceeding with local deletion.`);
        } else {
          // For other Stripe errors, we should stop the process
          throw stripeError;
        }
      }

      // Remove the payment method from our database
      await PaymentMethod.deleteOne({ _id: paymentMethod._id });

      logger.info(`Payment method ${paymentMethodId} deleted for user ${userId}`);

      return { message: "Payment method successfully deleted" };
    } catch (error) {
      logger.error(`Error in deletePaymentMethod for user ${userId}: ${error.message}`);
      throw new Error(`Failed to delete payment method: ${error.message}`);
    }
  }

  static async withdraw(userId, amount) {
    try {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      if (wallet.balance < amount) {
        throw new Error("Insufficient funds");
      }

      const payout = await StripeService.createPayout(
        amount,
        wallet.stripeCustomerId
      );

      wallet.balance -= amount;
      await wallet.save();

      const transaction = await this.createTransaction(
        "withdraw",
        amount,
        wallet._id,
        null,
        payout.id
      );

      // Send notification
      await NotificationService.notifyWithdrawal(userId, amount, transaction._id, "completed", "bank_transfer");

      return { balance: wallet.balance, payoutId: payout.id };
    } catch (error) {
      logger.error("Error in withdraw:", error);
      throw new Error(`Withdrawal failed: ${error.message}`);
    }
  }

  static async transfer(fromUserId, toUserId, amount) {
    try {
      const fromWallet = await Wallet.findOne({ user: fromUserId });
      const toWallet = await Wallet.findOne({ user: toUserId });

      if (!fromWallet || !toWallet) {
        throw new Error("One or both wallets not found");
      }

      if (fromWallet.balance < amount) {
        throw new Error("Insufficient funds");
      }

      fromWallet.balance -= amount;
      toWallet.balance += amount;

      await fromWallet.save();
      await toWallet.save();

      const transaction = await this.createTransaction(
        "transfer",
        amount,
        fromWallet._id,
        toWallet._id
      );

      // Send notifications with updated balances
      await NotificationService.notifyTransfer(
        fromUserId,
        toUserId,
        amount,
        transaction._id,
        fromWallet.balance,
        toWallet.balance
      );

      return { fromBalance: fromWallet.balance, toBalance: toWallet.balance };
    } catch (error) {
      logger.error("Error in transfer:", error);
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }

  static async getTransactions(userId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const transactions = await Transaction.find({
      $or: [{ fromWallet: wallet._id }, { toWallet: wallet._id }],
    }).sort({ createdAt: -1 });

    return transactions;
  }

  static async generatePaymentQR(userId, amount) {
    try {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      const paymentId = crypto.randomBytes(16).toString("hex");

      const qrData = JSON.stringify({
        paymentId,
        amount,
        recipient: userId,
      });

      const qrCodeDataURL = await qrcode.toDataURL(qrData);

      // Create a pending transaction
      await this.createTransaction(
        "transfer",
        amount,
        null, // fromWallet is null for QR code generation
        wallet._id,
        null,
        "pending",
        { paymentId }
      );

      return { qrCodeDataURL, paymentId };
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  static async initiateQRPayment(paymentId, payerId, paymentMethodId) {
    logger.info(
      `Initiating QR payment: paymentId=${paymentId}, payerId=${payerId}, paymentMethodId=${paymentMethodId}`
    );

    try {
      if (!paymentId || !payerId || !paymentMethodId) {
        throw new Error("Missing required parameters");
      }

      const transaction = await Transaction.findOne({
        "metadata.paymentId": paymentId,
        status: "pending",
      });
      logger.info(`Found transaction: ${JSON.stringify(transaction)}`);

      if (!transaction) {
        throw new Error("Invalid payment ID");
      }

      const payerWallet = await Wallet.findOne({ user: payerId });
      logger.info(`Found payer wallet: ${JSON.stringify(payerWallet)}`);

      if (!payerWallet) {
        throw new Error("Payer wallet not found");
      }

      if (payerWallet.balance < transaction.amount) {
        throw new Error("Insufficient funds");
      }

      const paymentMethod = await PaymentMethod.findOne({
        user: payerId,
        stripePaymentMethodId: paymentMethodId
      });

      if (!paymentMethod) {
        throw new Error("Payment method not found or does not belong to this user");
      }

      // Set the fromWallet
      transaction.fromWallet = payerWallet._id;
      await transaction.save();

      let paymentIntent;
      // if (STRIPE_TEST_PAYMENT_METHODS.has(paymentMethodId)) {
      //   // For test payment methods, we'll simulate a payment intent
      //   paymentIntent = {
      //     id: `pi_simulated_${crypto.randomBytes(16).toString("hex")}`,
      //     client_secret: `seti_simulated_${crypto.randomBytes(16).toString("hex")}`,
      //     status: "requires_confirmation",
      //     amount: transaction.amount * 100 // Convert to cents for consistency
      //   };
      //   logger.info(`Simulated payment intent for test payment method: ${JSON.stringify(paymentIntent)}`);
      // } else {
        // For real payment methods, proceed with Stripe
        paymentIntent = await StripeService.createPaymentIntent(
          transaction.amount * 100, // Convert to cents
          "usd",
          payerWallet.stripeCustomerId,
          paymentMethodId
        );
        //}

      transaction.stripePaymentIntentId = paymentIntent.id;
      await transaction.save();

      return {
        clientSecret: paymentIntent.client_secret,
        amount: transaction.amount,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };
    } catch (error) {
      logger.error(`Error in initiateQRPayment: ${error.message}`);
      logger.error(error.stack);
      throw new Error(`Failed to initiate QR payment: ${error.message}`);
    }
  }

  static async confirmQRPayment(payerId, paymentIntentId, paymentMethodId) {
    try {
      const paymentMethod = await PaymentMethod.findOne({
        user: payerId,
        stripePaymentMethodId: paymentMethodId
      });

      if (!paymentMethod) {
        throw new Error("Payment method not found or does not belong to this user");
      }

      let paymentIntent;
      // if (STRIPE_TEST_PAYMENT_METHODS.has(paymentMethodId)) {
      //   // For test payment methods, we'll simulate a successful confirmation
      //   paymentIntent = {
      //     id: paymentIntentId,
      //     status: "succeeded"
      //   };
      //   logger.info(`Simulated QR payment confirmation for test payment method: ${JSON.stringify(paymentIntent)}`);
      // } else {
        // For real payment methods, proceed with Stripe
        paymentIntent = await StripeService.confirmPaymentIntent(
          paymentIntentId,
          paymentMethodId
        );
        //}

      if (paymentIntent.status === "succeeded") {
        const transaction = await Transaction.findOne({
          stripePaymentIntentId: paymentIntentId,
        }).populate('toWallet');
        if (!transaction) {
          throw new Error("Transaction not found");
        }

        transaction.status = "completed";
        await transaction.save();

        const recipientWallet = await Wallet.findById(transaction.toWallet);
        if (!recipientWallet) {
          throw new Error("Recipient wallet not found");
        }
        recipientWallet.balance += transaction.amount;
        await recipientWallet.save();

        const payerWallet = await Wallet.findOne({ user: payerId });
        if (!payerWallet) {
          throw new Error("Payer wallet not found");
        }
        payerWallet.balance -= transaction.amount;
        await payerWallet.save();

        // Send notifications
        await NotificationService.notifyQRPayment(
          payerId,
          recipientWallet.user.toString(),
          transaction.amount,
          transaction._id,
          "sent"
        );
        await NotificationService.notifyQRPayment(
          recipientWallet.user.toString(),
          payerId,
          transaction.amount,
          transaction._id,
          "received"
        );

        return { message: "Payment processed successfully", paymentIntentId };
      } else {
        throw new Error("Payment failed");
      }
    } catch (error) {
      logger.error("Error in confirmQRPayment:", error);
      throw new Error(`Failed to confirm QR payment: ${error.message}`);
    }
  }

  static async createTransaction(
    type,
    amount,
    fromWalletId,
    toWalletId,
    stripePaymentIntentId = null,
    status = "completed",
    metadata = {}
  ) {
    const transaction = new Transaction({
      type,
      amount,
      fromWallet: fromWalletId,
      toWallet: toWalletId,
      status,
      stripePaymentIntentId,
      metadata,
    });

    await transaction.save();
    return transaction;
  }
}

module.exports = WalletService;
