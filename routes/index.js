const express = require('express');
const authRoutes = require('./auth.routes');
const walletRoutes = require('./wallet.routes');
const stripeRoutes = require('./stripe.routes');
const kycRoutes = require("./kyc.routes");

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/wallet', walletRoutes);
router.use('/stripe', stripeRoutes);
router.use("/kyc", kycRoutes);

module.exports = router;
