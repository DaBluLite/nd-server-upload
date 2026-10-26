import "express";

declare global {
  namespace Express {
    interface Request {
      uploadBasePath?: string;
      uploadDir?: string;
      uploadFolderMode?: "fixed" | "pattern";
      uploadFolderPattern?: string;
    }
  }
}
