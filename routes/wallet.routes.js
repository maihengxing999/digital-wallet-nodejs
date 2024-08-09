const express = require('express');
const WalletService = require('../services/wallet.service');
const authenticateJWT = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/create', authenticateJWT, async (req, res) => {
  try {
    const wallet = await WalletService.createWallet(req.user.id, req.user.email, req.body.initialBalance);
    res.status(201).json(wallet);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/create-payment-intent', authenticateJWT, async (req, res) => {
  try {
    const { amount } = req.body;
    const paymentIntent = await WalletService.createPaymentIntent(req.user.id, amount);
    res.json(paymentIntent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/confirm-payment-intent', authenticateJWT, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const result = await WalletService.confirmPaymentIntent(req.user.id, paymentIntentId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/balance', authenticateJWT, async (req, res) => {
  try {
    const balance = await WalletService.getBalance(req.user.id);
    res.json(balance);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/add-payment-method', authenticateJWT, async (req, res) => {
    try {
      const { paymentMethodId } = req.body;
      const result = await WalletService.addPaymentMethod(req.user.id, paymentMethodId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/withdraw', authenticateJWT, async (req, res) => {
    try {
      const { amount } = req.body;
      const result = await WalletService.withdraw(req.user.id, amount);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/transfer', authenticateJWT, async (req, res) => {
    try {
      const { toUserId, amount } = req.body;
      const result = await WalletService.transfer(req.user.id, toUserId, amount);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/transactions', authenticateJWT, async (req, res) => {
    try {
      const transactions = await WalletService.getTransactions(req.user.id);
      res.json(transactions);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/deposit', authenticateJWT, async (req, res) => {
    try {
      const { amount, paymentMethodId } = req.body;
      const result = await WalletService.deposit(req.user.id, amount, paymentMethodId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

module.exports = router;
