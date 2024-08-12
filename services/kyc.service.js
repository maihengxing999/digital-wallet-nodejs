const User = require("../models/user.model");
const KYCVerification = require("../models/kyc-verification.model");
const Minio = require("minio");
const config = require("../config");
const fs = require("fs");
const path = require("path");

// Configure MinIO client
const minioClient = new Minio.Client({
  endPoint: config.minioEndpoint || process.env.MINIO_ENDPOINT,
  useSSL: config.minioUseSSL === "true" || process.env.MINIO_USE_SSL === "true",
  accessKey: config.minioAccessKey || process.env.MINIO_ACCESS_KEY,
  secretKey: config.minioSecretKey || process.env.MINIO_SECRET_KEY,
});
const MINIO_BUCKET_NAME = config.minioBucket || process.env.MINIO_BUCKET_NAME;

if (!MINIO_BUCKET_NAME) {
  throw new Error("MINIO_BUCKET_NAME environment variable is not set");
}

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
      status: "pending",
    });

    await kycVerification.save();
    return kycVerification;
  }

  static async uploadDocument(userId, documentType, file) {
    let kycVerification = await KYCVerification.findOne({ user: userId });
    if (!kycVerification) {
      // Auto-initiate KYC if not already initiated
      kycVerification = await this.initiateKYC(userId);
    }

    if (kycVerification.status !== "pending") {
      throw new Error("KYC verification is not in pending state");
    }

    const fileName = `${userId}_${documentType}_${Date.now()}${path.extname(
      file.originalname,
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
        fileSize,
      );

      const fileUrl = await minioClient.presignedGetObject(
        MINIO_BUCKET_NAME,
        fileName,
        24 * 60 * 60,
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

      return kycVerification;
    } catch (error) {
      console.error("Error uploading document to MinIO:", error);
      throw new Error("Failed to upload document: " + error.message);
    }
  }

  static async updateKYCStatus(userId, newStatus) {
    const kycVerification = await KYCVerification.findOne({ user: userId });
    if (!kycVerification) {
      throw new Error("KYC verification not found");
    }

    kycVerification.status = newStatus;
    if (newStatus === "approved") {
      kycVerification.approvedAt = Date.now();
    }

    await kycVerification.save();
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
    };
  }

  static async isKYCApproved(userId) {
    const kycVerification = await KYCVerification.findOne({ user: userId });
    return kycVerification && kycVerification.status === "approved";
  }
}

module.exports = KYCService;
