# nd-server-upload
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

### API example
```bash
curl -X POST \
  -H "x-upload-password: your-strong-password" \
  -H "x-upload-subdir: rock/2024" \
  -F "file=@song.mp3" \
  http://localhost:3000/upload
```

Uploads are always constrained to the configured destination path; subfolders are created automatically.
