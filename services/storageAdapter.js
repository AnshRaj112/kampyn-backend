const fs = require("fs");
const path = require("path");
const logger = require("../utils/pinoLogger");

// Storage Adapter Interface
class LocalStorageAdapter {
  constructor() {
    this.uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async getPresignedUploadUrl(filePath, contentType) {
    // For local dev/air-gapped deployment, return a direct local api upload endpoint
    const filename = path.basename(filePath);
    return {
      uploadUrl: `/api/tenant/upload-local?file=${encodeURIComponent(filename)}`,
      method: "POST",
      fields: {}
    };
  }

  getPublicUrl(filePath) {
    const filename = path.basename(filePath);
    return `/uploads/${filename}`;
  }
}

class CloudStorageAdapter {
  constructor() {
    // Initialize Cloud S3 or GCP adapter configurations
    this.bucketName = process.env.STORAGE_BUCKET_NAME;
  }

  async getPresignedUploadUrl(filePath, contentType) {
    // Generate S3/GCS presigned link
    return {
      uploadUrl: `https://${this.bucketName}.s3.amazonaws.com/${filePath}`,
      method: "PUT",
      fields: { "Content-Type": contentType }
    };
  }

  getPublicUrl(filePath) {
    return `https://cdn.exsolvia.com/${filePath}`;
  }
}

// Factory instantiation
const adapter = process.env.STORAGE_PROVIDER === "cloud" ? new CloudStorageAdapter() : new LocalStorageAdapter();

module.exports = adapter;
