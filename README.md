# Naviload - Navidrome Upload Server
A small server tool to easily upload songs to Navidrome without SSH/FTP.

## Setup
1. Install server dependencies:
   ```bash
   pnpm i
   ```
2. Install client dependencies:
   ```bash
   pnpm --prefix client i
   ```
3. Set the upload password:
   ```bash
   export UPLOAD_PASSWORD="your-strong-password"
   ```
4. Build the client and server:
   ```bash
   pnpm build
   ```
5. Start the server:
   ```bash
   pnpm start
   ```
6. On first run, the server creates `config/destination-path.txt`. Add the absolute destination path (one line):
   ```text
   /absolute/path/to/your/navidrome/music
   ```

## Development
Run the API and UI in separate terminals:
```bash
pnpm dev:server
```
```bash
pnpm --prefix client dev
```

## Uploading
Open `http://localhost:3000` in a browser to use the simple UI.

The UI can place uploads in two ways:
- **Folder pattern (default):** creates the destination folder from the song's metadata using the pattern `{artist}/{album}`. Any of these tokens can be used in a pattern: `{artist}`, `{albumartist}`, `{album}`, `{title}`, `{year}`, `{genre}`, `{track}`, `{disc}`.
- **Single folder:** uploads every song into the same subfolder (or the destination root when left blank).

### API example

Upload using the default metadata pattern (`{artist}/{album}`):
```bash
curl -X POST \
  -H "x-upload-password: your-strong-password" \
  -H "x-upload-folder-mode: pattern" \
  -F "file=@song.mp3" \
  http://localhost:3000/upload
```

Upload using a custom metadata pattern:
```bash
curl -X POST \
  -H "x-upload-password: your-strong-password" \
  -H "x-upload-folder-mode: pattern" \
  -H "x-upload-folder-pattern: {albumartist}/{year} - {album}" \
  -F "file=@song.mp3" \
  http://localhost:3000/upload
```

Upload into one fixed folder:
```bash
curl -X POST \
  -H "x-upload-password: your-strong-password" \
  -H "x-upload-folder-mode: fixed" \
  -H "x-upload-subdir: rock/2024" \
  -F "file=@song.mp3" \
  http://localhost:3000/upload
```

Uploads are always constrained to the configured destination path; subfolders are created automatically.
