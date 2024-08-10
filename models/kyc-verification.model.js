const mongoose = require("mongoose");

const kycVerificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    documents: [
      {
        type: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    approvedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

const KYCVerification = mongoose.model(
  "KYCVerification",
  kycVerificationSchema
);

module.exports = KYCVerification;
