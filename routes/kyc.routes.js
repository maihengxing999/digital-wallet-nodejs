const express = require("express");
const KYCService = require("../services/kyc.service");
const { authenticateJWT } = require("../middleware/auth.middleware");
const upload = require("../middleware/file-upload.middleware");

const router = express.Router();

router.post("/initiate", authenticateJWT, async (req, res) => {
  try {
    const kycVerification = await KYCService.initiateKYC(req.user.id);
    res.status(201).json(kycVerification);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post(
  "/upload-document",
  authenticateJWT,
  upload.single("document"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { documentType } = req.body;
      const kycVerification = await KYCService.uploadDocument(
        req.user.id,
        documentType,
        req.file
      );
      res.json(kycVerification);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.get("/status", authenticateJWT, async (req, res) => {
  try {
    const status = await KYCService.getKYCStatus(req.user.id);
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// This route should be protected and only accessible by admin users
router.put("/update-status", authenticateJWT, async (req, res) => {
  try {
    const { userId, newStatus } = req.body;
    const kycVerification = await KYCService.updateKYCStatus(userId, newStatus);
    res.json(kycVerification);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
