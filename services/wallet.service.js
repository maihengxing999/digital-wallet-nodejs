const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const StripeService = require('./stripe.service');
const KYCVerification = require("../models/kyc-verification.model");
const crypto = require("crypto");
const qrcode = require("qrcode");
const logger = require("../utils/logger");

class WalletService {
  static async createWallet(userId, email, initialBalance) {
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
      await this.createTransaction("deposit", initialBalance, null, wallet._id);
    }

    return wallet;
  }

  /*
  static async deposit(userId, amount, paymentMethodId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Create a PaymentIntent
    const paymentIntent = await StripeService.createPaymentIntent(amount, 'usd', wallet.stripeCustomerId, paymentMethodId);

    // Confirm the PaymentIntent
    const confirmedPaymentIntent = await StripeService.confirmPaymentIntent(paymentIntent.id);

    if (confirmedPaymentIntent.status === 'succeeded') {
      const depositAmount = confirmedPaymentIntent.amount / 100; // Convert from cents to dollars
      wallet.balance += depositAmount;
      await wallet.save();

      await this.createTransaction('deposit', depositAmount, null, wallet._id, confirmedPaymentIntent.id);

      return { balance: wallet.balance, transactionId: confirmedPaymentIntent.id };
    } else {
      throw new Error('Deposit failed');
    }
  } */
  static async deposit(userId, amount, paymentMethodId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    try {
      // Attach the payment method to the customer if it's not already attached
      await StripeService.attachPaymentMethodToCustomer(
        paymentMethodId,
        wallet.stripeCustomerId
      );

      // Create a PaymentIntent
      const paymentIntent = await StripeService.createPaymentIntent(
        amount,
        "usd",
        wallet.stripeCustomerId
      );

      // Confirm the PaymentIntent with the payment method
      const confirmedPaymentIntent = await StripeService.confirmPaymentIntent(
        paymentIntent.id,
        paymentMethodId
      );

      if (confirmedPaymentIntent.status === "succeeded") {
        const depositAmount = confirmedPaymentIntent.amount / 100; // Convert from cents to dollars
        wallet.balance += depositAmount;
        await wallet.save();

        await this.createTransaction(
          "deposit",
          depositAmount,
          null,
          wallet._id,
          confirmedPaymentIntent.id
        );

        return {
          balance: wallet.balance,
          transactionId: confirmedPaymentIntent.id,
        };
      } else {
        throw new Error("Deposit failed");
      }
    } catch (error) {
      throw new Error(`Deposit failed: ${error.message}`);
    }
  }

  static async createPaymentIntent(userId, amount) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const paymentIntent = await StripeService.createPaymentIntent(
      amount,
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

    const paymentIntent = await StripeService.confirmPaymentIntent(
      paymentIntentId,
      paymentMethodId
    );

    if (paymentIntent.status === "succeeded") {
      const amount = paymentIntent.amount / 100; // Convert from cents to dollars
      wallet.balance += amount;
      await wallet.save();

      await this.createTransaction(
        "deposit",
        amount,
        null,
        wallet._id,
        paymentIntent.id
      );

      return { balance: wallet.balance, transactionId: paymentIntent.id };
    } else {
      throw new Error("Payment failed");
    }
  }

  static async getBalance(userId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error("Wallet not found");
    }
    return { balance: wallet.balance };
  }

  static async addPaymentMethod(userId, paymentMethodId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    await StripeService.attachPaymentMethodToCustomer(
      paymentMethodId,
      wallet.stripeCustomerId
    );

    return { message: "Payment method added successfully" };
  }

  static async withdraw(userId, amount) {
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

    await this.createTransaction(
      "withdraw",
      amount,
      wallet._id,
      null,
      payout.id
    );

    return { balance: wallet.balance, payoutId: payout.id };
  }

  static async transfer(fromUserId, toUserId, amount) {
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

    await this.createTransaction(
      "transfer",
      amount,
      fromWallet._id,
      toWallet._id
    );

    return { fromBalance: fromWallet.balance, toBalance: toWallet.balance };
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

      // Set the fromWallet
      transaction.fromWallet = payerWallet._id;
      await transaction.save();
      logger.info(
        `Updated transaction with fromWallet: ${JSON.stringify(transaction)}`
      );

      // Attach the payment method to the customer if it's not already attached
      logger.info(
        `Attaching payment method ${paymentMethodId} to customer ${payerWallet.stripeCustomerId}`
      );
      await StripeService.attachPaymentMethodToCustomer(
        paymentMethodId,
        payerWallet.stripeCustomerId
      );

      logger.info(
        `Creating payment intent for amount ${transaction.amount * 100} cents`
      );
      let paymentIntent;
      try {
        paymentIntent = await StripeService.createPaymentIntent(
          transaction.amount * 100, // Convert to cents
          "usd",
          payerWallet.stripeCustomerId,
          paymentMethodId
        );
      } catch (stripeError) {
        logger.error(`Stripe error: ${stripeError.message}`);
        throw new Error(`Stripe error: ${stripeError.message}`);
      }
      logger.info(`Created payment intent: ${JSON.stringify(paymentIntent)}`);

      transaction.stripePaymentIntentId = paymentIntent.id;
      await transaction.save();
      logger.info(
        `Updated transaction with stripePaymentIntentId: ${JSON.stringify(
          transaction
        )}`
      );

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
      const paymentIntent = await StripeService.confirmPaymentIntent(
        paymentIntentId,
        paymentMethodId
      );

      if (paymentIntent.status === "succeeded") {
        const transaction = await Transaction.findOne({
          stripePaymentIntentId: paymentIntentId,
        });
        if (!transaction) {
          throw new Error("Transaction not found");
        }

        transaction.status = "completed";
        await transaction.save();

        const recipientWallet = await Wallet.findById(transaction.toWallet);
        recipientWallet.balance += transaction.amount;
        await recipientWallet.save();

        const payerWallet = await Wallet.findOne({ user: payerId });
        payerWallet.balance -= transaction.amount;
        await payerWallet.save();

        return { message: "Payment processed successfully", paymentIntentId };
      } else {
        throw new Error("Payment failed");
      }
    } catch (error) {
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
