const WalletService = require('../services/wallet.service');
const logger = require('../utils/logger');

exports.createWallet = async (req, res) => {
  try {
    const { initialBalance } = req.body;
    const userId = req.user.id;
    const email = req.user.email;
    const result = await WalletService.createWallet(userId, email, initialBalance);
    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating wallet:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.deposit = async (req, res) => {
    try {
        const { amount, paymentMethodId } = req.body;
        const userId = req.user.id; // Assuming you have user info in the request after authentication

        const result = await WalletService.deposit(userId, amount, paymentMethodId);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


exports.transfer = async (req, res) => {
  try {
    const { amount, toUserId } = req.body;
    const fromUserId = req.user.id;
    const result = await WalletService.transfer(fromUserId, toUserId, amount);
    res.json(result);
  } catch (error) {
    logger.error('Error transferring funds:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.withdraw = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;
    const result = await WalletService.withdraw(userId, amount);
    res.json(result);
  } catch (error) {
    logger.error('Error withdrawing funds:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await WalletService.getBalance(userId);
    res.json(result);
  } catch (error) {
    logger.error('Error getting balance:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await WalletService.getTransactionHistory(userId);
    res.json(result);
  } catch (error) {
    logger.error('Error getting transaction history:', error);
    res.status(500).json({ error: error.message });
  }
};
