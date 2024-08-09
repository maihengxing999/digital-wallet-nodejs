const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const StripeService = require('./stripe.service');

class WalletService {
  static async createWallet(userId, email, initialBalance) {
    const existingWallet = await Wallet.findOne({ user: userId });
    if (existingWallet) {
      throw new Error('User already has a wallet');
    }

    const stripeCustomer = await StripeService.createCustomer(email);

    const wallet = new Wallet({
      user: userId,
      balance: initialBalance,
      stripeCustomerId: stripeCustomer.id
    });

    await wallet.save();

    if (initialBalance > 0) {
      await this.createTransaction('deposit', initialBalance, null, wallet._id);
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
          throw new Error('Wallet not found');
        }

        try {
          // Attach the payment method to the customer if it's not already attached
          await StripeService.attachPaymentMethodToCustomer(paymentMethodId, wallet.stripeCustomerId);

          // Create a PaymentIntent
          const paymentIntent = await StripeService.createPaymentIntent(amount, 'usd', wallet.stripeCustomerId);

          // Confirm the PaymentIntent with the payment method
          const confirmedPaymentIntent = await StripeService.confirmPaymentIntent(paymentIntent.id, paymentMethodId);

          if (confirmedPaymentIntent.status === 'succeeded') {
            const depositAmount = confirmedPaymentIntent.amount / 100; // Convert from cents to dollars
            wallet.balance += depositAmount;
            await wallet.save();

            await this.createTransaction('deposit', depositAmount, null, wallet._id, confirmedPaymentIntent.id);

            return { balance: wallet.balance, transactionId: confirmedPaymentIntent.id };
          } else {
            throw new Error('Deposit failed');
          }
        } catch (error) {
          throw new Error(`Deposit failed: ${error.message}`);
        }
      }

  static async createPaymentIntent(userId, amount) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const paymentIntent = await StripeService.createPaymentIntent(amount, 'usd', wallet.stripeCustomerId);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    };
  }

  static async confirmPaymentIntent(userId, paymentIntentId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const paymentIntent = await StripeService.confirmPaymentIntent(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      const amount = paymentIntent.amount / 100; // Convert from cents to dollars
      wallet.balance += amount;
      await wallet.save();

      await this.createTransaction('deposit', amount, null, wallet._id, paymentIntent.id);

      return { balance: wallet.balance, transactionId: paymentIntent.id };
    } else {
      throw new Error('Payment failed');
    }
  }

  static async getBalance(userId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    return { balance: wallet.balance };
  }

  static async addPaymentMethod(userId, paymentMethodId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    await StripeService.attachPaymentMethodToCustomer(paymentMethodId, wallet.stripeCustomerId);

    return { message: 'Payment method added successfully' };
  }

  static async withdraw(userId, amount) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (wallet.balance < amount) {
      throw new Error('Insufficient funds');
    }

    const payout = await StripeService.createPayout(amount, wallet.stripeCustomerId);

    wallet.balance -= amount;
    await wallet.save();

    await this.createTransaction('withdraw', amount, wallet._id, null, payout.id);

    return { balance: wallet.balance, payoutId: payout.id };
  }

  static async transfer(fromUserId, toUserId, amount) {
    const fromWallet = await Wallet.findOne({ user: fromUserId });
    const toWallet = await Wallet.findOne({ user: toUserId });

    if (!fromWallet || !toWallet) {
      throw new Error('One or both wallets not found');
    }

    if (fromWallet.balance < amount) {
      throw new Error('Insufficient funds');
    }

    fromWallet.balance -= amount;
    toWallet.balance += amount;

    await fromWallet.save();
    await toWallet.save();

    await this.createTransaction('transfer', amount, fromWallet._id, toWallet._id);

    return { fromBalance: fromWallet.balance, toBalance: toWallet.balance };
  }

  static async getTransactions(userId) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const transactions = await Transaction.find({
      $or: [{ fromWallet: wallet._id }, { toWallet: wallet._id }]
    }).sort({ createdAt: -1 });

    return transactions;
  }


  static async createTransaction(type, amount, fromWalletId, toWalletId, stripePaymentIntentId = null) {
    const transaction = new Transaction({
      type,
      amount,
      fromWallet: fromWalletId,
      toWallet: toWalletId,
      status: 'completed',
      stripePaymentIntentId
    });

    await transaction.save();
    return transaction;
  }
}

module.exports = WalletService;
