const express = require("express");
const AuthController = require("../controllers/auth.controller");
const {
  authenticateAdmin,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/register", AuthController.register);
router.post("/login", AuthController.login);

// Admin routes
router.post("/create-admin", authenticateAdmin, AuthController.createAdmin);
router.put("/make-admin/:userId", authenticateAdmin, AuthController.makeAdmin);
router.put(
  "/remove-admin/:userId",
  authenticateAdmin,
  AuthController.removeAdmin
);
router.post("/setup-admin", AuthController.setupAdmin);


module.exports = router;
