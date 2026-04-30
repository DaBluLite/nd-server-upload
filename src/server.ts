import crypto from "crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import multer from "multer";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PASSWORD_ENV = "UPLOAD_PASSWORD";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(PROJECT_ROOT, "config");
const DESTINATION_PATH_FILE = path.join(CONFIG_DIR, "destination-path.txt");
const CLIENT_DIST_DIR = path.join(PROJECT_ROOT, "client", "dist");
const UPLOAD_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const UPLOAD_RATE_LIMIT_MAX_REQUESTS = 30;
const CLIENT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const CLIENT_RATE_LIMIT_MAX_REQUESTS = 120;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;
const TRAILING_DOTS_SPACES = /[. ]+$/;

let destinationReadErrorLogged = false;

const ensureDestinationPathFile = () => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(DESTINATION_PATH_FILE)) {
    fs.writeFileSync(
      DESTINATION_PATH_FILE,
      "# Set the absolute destination path for uploads (one path per line).\n",
    );
  }
};

const readDestinationPath = () => {
  try {
    const content = fs.readFileSync(DESTINATION_PATH_FILE, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        return trimmed;
      }
    }
  } catch (error) {
    if (!destinationReadErrorLogged) {
      console.error("Failed to read destination path file:", error);
      destinationReadErrorLogged = true;
    }
    return null;
  }
  return null;
};

const ensureDirectory = (directoryPath: string) => {
  if (fs.existsSync(directoryPath)) {
    const stats = fs.statSync(directoryPath);
    if (!stats.isDirectory()) {
      throw new Error(`Destination path is not a directory: ${directoryPath}`);
    }
    return;
  }
  fs.mkdirSync(directoryPath, { recursive: true });
};

const sanitizeSubdir = (subdir: string) => {
  const cleaned = (subdir || "").replace(/\\/g, "/").trim();
  if (!cleaned) {
    return "";
  }
  if (path.isAbsolute(cleaned)) {
    throw new Error("Subdirectory must be a relative path.");
  }
  if (cleaned.includes("\0")) {
    throw new Error("Subdirectory contains invalid characters.");
  }
  const segments = cleaned.split("/").filter(Boolean);
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error("Subdirectory must not use . or .. segments.");
    }
  }
  return segments.join(path.sep);
};

const resolveUploadDirectory = (basePath: string, subdir: string) => {
  const normalizedBase = path.resolve(basePath);
  const cleanedSubdir = sanitizeSubdir(subdir);
  const targetDir = cleanedSubdir
    ? path.join(normalizedBase, cleanedSubdir)
    : normalizedBase;
  const relativeTarget = path.relative(normalizedBase, targetDir);
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    throw new Error(
      "Subdirectory must stay within the configured destination path.",
    );
  }
  return targetDir;
};

const getPasswordFromRequest = (req: Request): string =>
  req.header("x-upload-password") ?? "";

const getSubdirFromRequest = (req: Request): string => {
  const headerValue = req.header("x-upload-subdir");
  if (headerValue) {
    return headerValue;
  }
  const queryValue = req.query.subdir;
  if (Array.isArray(queryValue)) {
    throw new Error("Subdirectory must be a single value, not an array.");
  }
  return typeof queryValue === "string" ? queryValue : "";
};

const requirePassword = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env[PASSWORD_ENV];
  if (!expected) {
    return res.status(500).json({
      error: `${PASSWORD_ENV} is not set. Configure it before uploading.`,
    });
  }
  const provided = getPasswordFromRequest(req);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (
    !provided ||
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  return next();
};

const loadUploadDir = (req: Request, res: Response, next: NextFunction) => {
  const basePath = readDestinationPath();
  if (!basePath) {
    return res.status(500).json({
      error: `Destination path not configured. Update ${DESTINATION_PATH_FILE}.`,
    });
  }
  if (!path.isAbsolute(basePath)) {
    return res.status(500).json({
      error: "Destination path must be an absolute path.",
    });
  }
  try {
    ensureDirectory(basePath);
    const resolvedBasePath = fs.realpathSync(basePath);
    const targetDir = resolveUploadDirectory(
      resolvedBasePath,
      getSubdirFromRequest(req),
    );
    ensureDirectory(targetDir);
    const resolvedTargetDir = fs.realpathSync(targetDir);
    const relativeTarget = path.relative(resolvedBasePath, resolvedTargetDir);
    if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
      throw new Error(
        "Subdirectory must stay within the configured destination path.",
      );
    }
    req.uploadBasePath = resolvedBasePath;
    req.uploadDir = resolvedTargetDir;
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
  return next();
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    if (!req.uploadDir) {
      return cb(new Error("Upload destination not configured."), "");
    }
    return cb(null, req.uploadDir);
  },
  filename: (req, file, cb) => {
    try {
      const safeName = getSafeFilename(file.originalname);
      return cb(null, safeName);
    } catch (error) {
      return cb(error as Error, "");
    }
  },
});

const upload = multer({ storage });

const uploadRateLimiter = rateLimit({
  windowMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
  max: UPLOAD_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: "Too many upload requests. Please try again later." });
  },
});

const clientRateLimiter = rateLimit({
  windowMs: CLIENT_RATE_LIMIT_WINDOW_MS,
  max: CLIENT_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .type("text")
      .send("Too many requests. Please try again later.");
  },
});

const getSafeFilename = (originalName: string) => {
  const safeName = path.basename(originalName || "upload");
  if (
    !safeName ||
    safeName === "." ||
    safeName === ".." ||
    safeName !== originalName
  ) {
    throw new Error("Invalid file name.");
  }
  if (
    INVALID_FILENAME_CHARS.test(safeName) ||
    TRAILING_DOTS_SPACES.test(safeName)
  ) {
    throw new Error("Invalid file name.");
  }
  const parsedName = path.parse(safeName).name;
  if (WINDOWS_RESERVED_NAMES.test(parsedName)) {
    throw new Error("Invalid file name.");
  }
  return safeName;
};

app.post(
  "/upload",
  uploadRateLimiter,
  requirePassword,
  loadUploadDir,
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }
    const relativePath = req.uploadBasePath
      ? path.relative(req.uploadBasePath, req.file.path)
      : req.file.filename;
    return res.json({
      message: `Uploaded ${req.file.originalname}.`,
      storedAs: relativePath,
    });
  },
);

if (fs.existsSync(CLIENT_DIST_DIR)) {
  app.use(clientRateLimiter, express.static(CLIENT_DIST_DIR));
  app.get("/{*splat}", clientRateLimiter, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST_DIR, "index.html"));
  });
} else {
  app.get("/", clientRateLimiter, (_req, res) => {
    res
      .type("text")
      .send('Client build not found. Run "npm --prefix client run build".');
  });
}

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (!error) {
    return next();
  }
  console.error("Unhandled server error:", error);
  return res.status(500).json({ error: "Unexpected server error." });
});

ensureDestinationPathFile();

app.listen(PORT, () => {
  console.log(`nd-server-upload listening on http://localhost:${PORT}`);
});
