const User = require("../models/user.model");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const validator = require("../utils/validator");
const logger = require("../utils/logger");
const config = require("../config");
const NotificationService = require("../services/notification.service");

exports.register = async (req, res) => {
  const session = await User.startSession();
  session.startTransaction();

  try {
    const { error } = validator.validateUser(req.body);
    if (error) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, firstName, lastName } = req.body;

    if (!isValidEmail(email)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Invalid email address" });
    }

    let existingUser = await User.findOne({ email });
    if (existingUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "User already exists" });
    }

    const emailVerificationToken = crypto.randomBytes(20).toString('hex');
    const emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    const newUser = new User({
      email,
      password,
      firstName,
      lastName,
      emailVerificationToken,
      emailVerificationExpires
    });

    const verificationURL = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${emailVerificationToken}`;

    // Save the user first
    await newUser.save({ session });

    // Attempt to send verification email
    try {
      await NotificationService.notifyEmailVerification(newUser, verificationURL);
      logger.info(`Verification email sent successfully to ${newUser.email}`);
    } catch (emailError) {
      logger.error("Error sending verification email:", emailError);
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "User registered successfully. Please check your email to verify your account.",
      user: {
        id: newUser._id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    logger.error("Error in user registration:", error);
    res.status(500).json({
      error: "We encountered an unexpected error during registration. Please try again or contact support if the problem persists.",
    });
  }
};

function isValidEmail(email) {
  const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return emailRegex.test(email);
}

exports.verifyEmail = async (req, res) => {
  try {
    const user = await User.findOne({
      emailVerificationToken: req.params.token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification token" });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    const token = jwt.sign({ id: user._id }, config.jwtSecret, {
      expiresIn: "1d",
    });

    res.json({
      message: "Email verified successfully",
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Error in email verification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { error } = validator.validateLogin(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: "Invalid email or password" });

    if (!user.isEmailVerified)
      return res.status(400).json({ error: "Please verify your email before logging in. Check your inbox for the verification link." });

    const isMatch = await user.checkPassword(password);
    if (!isMatch)
      return res.status(400).json({ error: "Invalid email or password" });

    const token = jwt.sign({ id: user._id }, config.jwtSecret, {
      expiresIn: "1d",
    });

    // Send login notification
    try {
      const loginTime = new Date().toISOString();
      const loginLocation = req.ip; // This is a simple way to get location, you might want to use a more sophisticated method
      await NotificationService.notifyLogin(user, loginTime, loginLocation);
    } catch (notificationError) {
      logger.warn("Failed to send login notification:", notificationError);
      // We don't need to block the login process if notification fails
    }

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Error in user login:", error);
    res.status(500).json({
      error: "We're having trouble logging you in right now. Please try again later.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const { error } = validator.validateUser(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password, firstName, lastName } = req.body;

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ error: "User already exists" });

    user = new User({ email, password, firstName, lastName, role: "admin" });
    await user.save();

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Error in admin creation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.makeAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { role: "admin" },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Error in making user admin:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.removeAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { role: "user" },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Error in removing admin privileges:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.setupAdmin = async (req, res) => {
  try {
    // Check if admin setup is allowed
    if (process.env.ALLOW_ADMIN_SETUP !== "true") {
      return res.status(403).json({ error: "Admin setup is not allowed" });
    }

    // Validate setup key
    const setupKey = req.headers["x-setup-key"];
    if (setupKey !== process.env.SETUP_KEY) {
      return res.status(403).json({ error: "Invalid setup key" });
    }

    // Validate input
    const { error } = validator.validateUser(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password, firstName, lastName } = req.body;

    // Check if an admin already exists
    const adminExists = await User.findOne({ role: "admin" });
    if (adminExists) {
      return res.status(400).json({ error: "An admin user already exists" });
    }

    // Create admin user
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      role: "admin",
    });
    await user.save();

    // Generate token
    const token = jwt.sign({ id: user._id }, config.jwtSecret, {
      expiresIn: "1d",
    });

    // Disable further admin setup
    process.env.ALLOW_ADMIN_SETUP = "false";

    res.status(201).json({
      message: "Admin user created successfully",
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Error in admin setup:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
