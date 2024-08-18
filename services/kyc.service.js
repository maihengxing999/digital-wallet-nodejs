const User = require("../models/user.model");
const KYCVerification = require("../models/kyc-verification.model");
const Minio = require("minio");
const config = require("../config");
const fs = require("fs");
const path = require("path");
const NotificationService = require("./notification.service");
const logger = require("../utils/logger");

// Configure MinIO client
const minioClient = new Minio.Client({
  endPoint: config.minioEndpoint,
  useSSL: config.minioUseSSL === "true",
  accessKey: config.minioAccessKey,
  secretKey: config.minioSecretKey,
});
const MINIO_BUCKET_NAME = config.minioBucket;

if (!MINIO_BUCKET_NAME) {
  throw new Error("MINIO_BUCKET_NAME is not set in the configuration");
}

// Auto-approve KYC setting
const AUTO_APPROVE_KYC = process.env.AUTO_APPROVE_KYC === "true";

class KYCService {
  static async initiateKYC(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    let kycVerification = await KYCVerification.findOne({ user: userId });
    if (kycVerification) {
      throw new Error("KYC verification already initiated");
    }

    kycVerification = new KYCVerification({
      user: userId,
      status: AUTO_APPROVE_KYC ? "approved" : "pending",
    });

    if (AUTO_APPROVE_KYC) {
      kycVerification.approvedAt = Date.now();
    }

    await kycVerification.save();

    // Notify user about KYC initiation or auto-approval
    await NotificationService.notifyKYCUpdate(userId, kycVerification.status);

    logger.info(`KYC initiated for user ${userId}. Auto-approve: ${AUTO_APPROVE_KYC}`);

    return kycVerification;
  }

  static async uploadDocument(userId, documentType, file) {
    let kycVerification = await KYCVerification.findOne({ user: userId });
    if (!kycVerification) {
      // Auto-initiate KYC if not already initiated
      kycVerification = await this.initiateKYC(userId);
    }

    if (AUTO_APPROVE_KYC) {
      logger.info(`Document upload skipped for user ${userId} due to auto-approval`);
      return kycVerification;
    }

    if (kycVerification.status !== "pending") {
      throw new Error("KYC verification is not in pending state");
    }

    const fileName = `${userId}_${documentType}_${Date.now()}${path.extname(
      file.originalname
    )}`;

    try {
      let fileStream;
      let fileSize;

      if (file.buffer) {
        // If file.buffer exists, use it (memory storage)
        fileStream = Buffer.from(file.buffer);
        fileSize = file.buffer.length;
      } else if (file.path) {
        // If file.path exists, create a read stream (disk storage)
        fileStream = fs.createReadStream(file.path);
        const stats = fs.statSync(file.path);
        fileSize = stats.size;
      } else {
        throw new Error("Invalid file object");
      }

      await minioClient.putObject(
        MINIO_BUCKET_NAME,
        fileName,
        fileStream,
        fileSize
      );

      const fileUrl = await minioClient.presignedGetObject(
        MINIO_BUCKET_NAME,
        fileName,
        24 * 60 * 60
      );

      kycVerification.documents.push({
        type: documentType,
        url: fileUrl,
      });

      await kycVerification.save();

      // If we created a read stream, close it
      if (fileStream.close) {
        fileStream.close();
      }

      // Remove the temporary file
      if (file.path) {
        fs.unlinkSync(file.path);
      }

      logger.info(`Document uploaded successfully for user ${userId}`);
      return kycVerification;
    } catch (error) {
      logger.error("Error uploading document to MinIO:", error);
      throw new Error("Failed to upload document: " + error.message);
    }
  }

  static async updateKYCStatus(userId, newStatus, rejectionReason = null) {
    if (AUTO_APPROVE_KYC) {
      logger.info(`KYC status update skipped for user ${userId} due to auto-approval`);
      return { status: "approved" };
    }

    const kycVerification = await KYCVerification.findOne({ user: userId });
    if (!kycVerification) {
      throw new Error("KYC verification not found");
    }

    kycVerification.status = newStatus;
    if (newStatus === "approved") {
      kycVerification.approvedAt = Date.now();
    } else if (newStatus === "rejected") {
      kycVerification.rejectionReason = rejectionReason;
    }

    await kycVerification.save();

    // Notify user about KYC status update
    await NotificationService.notifyKYCUpdate(userId, newStatus, rejectionReason);

    return kycVerification;
  }

  static async getKYCStatus(userId) {
    const kycVerification = await KYCVerification.findOne({ user: userId });
    if (!kycVerification) {
      throw new Error("KYC verification not found");
    }

    return {
      status: kycVerification.status,
      documents: kycVerification.documents.map((doc) => ({
        type: doc.type,
        uploadedAt: doc.uploadedAt,
      })),
      initiatedAt: kycVerification.createdAt,
      approvedAt: kycVerification.approvedAt,
      rejectionReason: kycVerification.rejectionReason,
      isAutoApproved: AUTO_APPROVE_KYC,
    };
  }

  static async isKYCApproved(userId) {
    if (AUTO_APPROVE_KYC) {
      return true;
    }
    const kycVerification = await KYCVerification.findOne({ user: userId });
    return kycVerification && kycVerification.status === "approved";
  }

  static async resubmitKYC(userId) {
    if (AUTO_APPROVE_KYC) {
      logger.info(`KYC resubmission skipped for user ${userId} due to auto-approval`);
      return { status: "approved" };
    }

    const kycVerification = await KYCVerification.findOne({ user: userId });
    if (!kycVerification) {
      throw new Error("KYC verification not found");
    }

    if (kycVerification.status !== "rejected") {
      throw new Error("KYC verification is not in rejected state");
    }

    kycVerification.status = "pending";
    kycVerification.rejectionReason = null;
    kycVerification.documents = [];

    await kycVerification.save();

    // Notify user about KYC resubmission
    await NotificationService.notifyKYCUpdate(userId, "pending");

    return kycVerification;
  }
}

module.exports = KYCService;
