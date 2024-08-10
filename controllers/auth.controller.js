const User = require("../models/user.model");
const jwt = require("jsonwebtoken");
const validator = require("../utils/validator");
const logger = require("../utils/logger");
const config = require("../config");

exports.register = async (req, res) => {
  try {
    const { error } = validator.validateUser(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password, firstName, lastName } = req.body;

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ error: "User already exists" });

    user = new User({ email, password, firstName, lastName });
    await user.save();

    const token = jwt.sign({ id: user._id }, config.jwtSecret, {
      expiresIn: "1d",
    });

    res.status(201).json({
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
    logger.error("Error in user registration:", error);
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

    const isMatch = await user.checkPassword(password);
    if (!isMatch)
      return res.status(400).json({ error: "Invalid email or password" });

    const token = jwt.sign({ id: user._id }, config.jwtSecret, {
      expiresIn: "1d",
    });

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
    res.status(500).json({ error: "Internal server error" });
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
