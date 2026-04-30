const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD_ENV = 'UPLOAD_PASSWORD';

const CONFIG_DIR = path.join(__dirname, 'config');
const DESTINATION_PATH_FILE = path.join(CONFIG_DIR, 'destination-path.txt');

let destinationReadErrorLogged = false;

const ensureDestinationPathFile = () => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(DESTINATION_PATH_FILE)) {
    fs.writeFileSync(
      DESTINATION_PATH_FILE,
      '# Set the absolute destination path for uploads (one path per line).\n'
    );
  }
};

const readDestinationPath = () => {
  try {
    const content = fs.readFileSync(DESTINATION_PATH_FILE, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return trimmed;
      }
    }
  } catch (error) {
    if (!destinationReadErrorLogged) {
      console.error('Failed to read destination path file:', error);
      destinationReadErrorLogged = true;
    }
    return null;
  }
  return null;
};

const ensureDirectory = (directoryPath) => {
  if (fs.existsSync(directoryPath)) {
    const stats = fs.statSync(directoryPath);
    if (!stats.isDirectory()) {
      throw new Error(`Destination path is not a directory: ${directoryPath}`);
    }
    return;
  }
  fs.mkdirSync(directoryPath, { recursive: true });
};

const sanitizeSubdir = (subdir) => {
  const cleaned = (subdir || '').replace(/\\/g, '/').trim();
  if (!cleaned) {
    return '';
  }
  if (path.isAbsolute(cleaned)) {
    throw new Error('Subdirectory must be a relative path.');
  }
  if (cleaned.includes('\0')) {
    throw new Error('Subdirectory contains invalid characters.');
  }
  const segments = cleaned.split('/').filter(Boolean);
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new Error('Subdirectory must not use . or .. segments.');
    }
  }
  return segments.join(path.sep);
};

const resolveUploadDirectory = (basePath, subdir) => {
  const normalizedBase = path.resolve(basePath);
  const cleanedSubdir = sanitizeSubdir(subdir);
  const targetDir = cleanedSubdir
    ? path.join(normalizedBase, cleanedSubdir)
    : normalizedBase;
  const relativeTarget = path.relative(normalizedBase, targetDir);
  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    throw new Error('Subdirectory must stay within the configured destination path.');
  }
  return targetDir;
};

const getPasswordFromRequest = (req) =>
  req.header('x-upload-password') || '';

const getSubdirFromRequest = (req) =>
  req.header('x-upload-subdir') || req.query.subdir || '';

const requirePassword = (req, res, next) => {
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
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  return next();
};

const loadUploadDir = (req, res, next) => {
  const basePath = readDestinationPath();
  if (!basePath) {
    return res.status(500).json({
      error: `Destination path not configured. Update ${DESTINATION_PATH_FILE}.`,
    });
  }
  if (!path.isAbsolute(basePath)) {
    return res.status(500).json({
      error: 'Destination path must be an absolute path.',
    });
  }
  try {
    ensureDirectory(basePath);
    const resolvedBasePath = fs.realpathSync(basePath);
    const targetDir = resolveUploadDirectory(resolvedBasePath, getSubdirFromRequest(req));
    ensureDirectory(targetDir);
    const resolvedTargetDir = fs.realpathSync(targetDir);
    const relativeTarget = path.relative(resolvedBasePath, resolvedTargetDir);
    if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
      throw new Error('Subdirectory must stay within the configured destination path.');
    }
    req.uploadBasePath = resolvedBasePath;
    req.uploadDir = resolvedTargetDir;
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  return next();
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.uploadDir) {
      return cb(new Error('Upload destination not configured.'));
    }
    return cb(null, req.uploadDir);
  },
  filename: (req, file, cb) => {
    const originalName = file.originalname || 'upload';
    const safeName = path.basename(originalName);
    if (!safeName || safeName === '.' || safeName === '..' || safeName !== originalName) {
      return cb(new Error('Invalid file name.'));
    }
    return cb(null, safeName);
  },
});

const upload = multer({ storage });

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Navidrome Upload</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; max-width: 720px; }
      form { display: grid; gap: 0.75rem; }
      input, button { padding: 0.5rem; font-size: 1rem; }
      .hint { color: #555; font-size: 0.9rem; }
      .status { margin-top: 1rem; padding: 0.75rem; border-radius: 6px; }
      .status.ok { background: #e6f7e6; color: #205a20; }
      .status.error { background: #fdeaea; color: #8a1c1c; }
    </style>
  </head>
  <body>
    <h1>Navidrome Upload</h1>
    <p class="hint">
      Configure the destination path on the server (see the README).
      Passwords are checked against <code>${PASSWORD_ENV}</code>.
    </p>
    <form id="upload-form">
      <label>
        Password
        <input type="password" name="password" required />
      </label>
      <label>
        Destination subfolder (optional)
        <input type="text" name="subdir" placeholder="e.g. rock/2024" />
      </label>
      <label>
        File
        <input type="file" name="file" required />
      </label>
      <button type="submit">Upload</button>
    </form>
    <div id="status" class="status" hidden></div>
    <script>
      const form = document.getElementById('upload-form');
      const statusEl = document.getElementById('status');

      const showStatus = (message, ok) => {
        statusEl.textContent = message;
        statusEl.className = ok ? 'status ok' : 'status error';
        statusEl.hidden = false;
      };

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        statusEl.hidden = true;

        const password = form.password.value;
        const subdir = form.subdir.value.trim();
        const fileInput = form.file;

        if (!fileInput.files.length) {
          showStatus('Please choose a file to upload.', false);
          return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        try {
          const response = await fetch('/upload', {
            method: 'POST',
            headers: {
              'x-upload-password': password,
              ...(subdir ? { 'x-upload-subdir': subdir } : {}),
            },
            body: formData,
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            showStatus(payload.error || 'Upload failed.', false);
            return;
          }
          showStatus(payload.message || 'Upload complete.', true);
          form.reset();
        } catch (error) {
          showStatus('Upload failed. Check the server logs.', false);
        }
      });
    </script>
  </body>
</html>`);
});

app.post('/upload', requirePassword, loadUploadDir, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const relativePath = req.uploadBasePath
    ? path.relative(req.uploadBasePath, req.file.path)
    : req.file.filename;
  return res.json({
    message: `Uploaded ${req.file.originalname}.`,
    storedAs: relativePath,
  });
});

app.use((error, req, res, next) => {
  if (!error) {
    return next();
  }
  console.error('Unhandled server error:', error);
  return res.status(500).json({ error: 'Unexpected server error.' });
});

ensureDestinationPathFile();

app.listen(PORT, () => {
  console.log(`nd-server-upload listening on http://localhost:${PORT}`);
});
