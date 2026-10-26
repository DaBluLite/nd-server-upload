import { type SubmitEventHandler, useRef, useState } from "react";

const PASSWORD_ENV = "UPLOAD_PASSWORD";
const DEFAULT_FOLDER_PATTERN = "{artist}/{album}";
const FOLDER_PATTERN_TOKENS = [
  "artist",
  "albumartist",
  "album",
  "title",
  "year",
  "genre",
  "track",
  "disc",
] as const;

type FolderMode = "pattern" | "fixed";

type Status = {
  message: string;
  ok: boolean;
  details?: string[];
};

type UploadProgress = {
  current: number;
  total: number;
};

function App() {
  const [password, setPassword] = useState("");
  const [folderMode, setFolderMode] = useState<FolderMode>("pattern");
  const [folderPattern, setFolderPattern] = useState(DEFAULT_FOLDER_PATTERN);
  const [subdir, setSubdir] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setStatus(null);

    if (files.length === 0) {
      setStatus({
        message: "Please choose at least one file to upload.",
        ok: false,
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const trimmedSubdir = subdir.trim();
      const trimmedPattern = folderPattern.trim() || DEFAULT_FOLDER_PATTERN;
      const headers = {
        "x-upload-password": password,
        "x-upload-folder-mode": folderMode,
        ...(folderMode === "pattern"
          ? { "x-upload-folder-pattern": trimmedPattern }
          : trimmedSubdir
            ? { "x-upload-subdir": trimmedSubdir }
            : {}),
      };
      const failures: string[] = [];
      let uploadedCount = 0;

      for (const [index, currentFile] of files.entries()) {
        setProgress({ current: index + 1, total: files.length });

        const formData = new FormData();
        formData.append("file", currentFile);

        try {
          const response = await fetch("/upload", {
            method: "POST",
            headers,
            body: formData,
          });
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };

          if (!response.ok) {
            failures.push(
              `${currentFile.name}: ${payload.error ?? "Upload failed."}`,
            );
            continue;
          }

          uploadedCount += 1;
        } catch {
          failures.push(`${currentFile.name}: Network error.`);
        }
      }

      if (failures.length === 0) {
        setStatus({
          message: `Uploaded ${uploadedCount} ${
            uploadedCount === 1 ? "file" : "files"
          }.`,
          ok: true,
        });
        setPassword("");
        setSubdir("");
        setFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        setStatus({
          message:
            uploadedCount > 0
              ? `Uploaded ${uploadedCount} of ${files.length} files.`
              : "Upload failed.",
          ok: false,
          details: failures,
        });
      }
    } catch {
      setStatus({
        message: "Upload failed. Check the server logs.",
        ok: false,
      });
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-12">
        <header className="space-y-3">
          <h1 className="text-3xl font-thin text-center w-full">
            Upload songs to Navidrome
          </h1>
          <p className="text-sm text-zinc-400 text-center">
            Configure the destination path on the server (see the README).
            Passwords are checked against <code>{PASSWORD_ENV}</code>.
          </p>
        </header>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase text-zinc-700 dark:text-zinc-400">
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full min-w-140 use-transition px-3 py-2 bg-second-layer-thin dark:bg-second-layer-thin-dark focus:bg-second-layer-thin-active dark:focus:bg-second-layer-thin-dark-active border border-faint shadow-glass rounded-md outline-none focus:border-subtle"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-bold uppercase text-zinc-700 dark:text-zinc-400">
              Destination folder
            </legend>

            <label className="use-transition flex cursor-pointer items-start gap-3 rounded-md border border-faint bg-zinc-950/20 px-3 py-2 hover:bg-second-layer-thin-hover dark:hover:bg-second-layer-thin-hover-dark">
              <input
                type="radio"
                name="folderMode"
                value="pattern"
                checked={folderMode === "pattern"}
                onChange={() => setFolderMode("pattern")}
                className="mt-1 accent-[#0084ff]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm">Create folders from song metadata</span>
                <span className="text-xs text-zinc-500">
                  Each song is placed using a pattern. The default is{" "}
                  <code>{DEFAULT_FOLDER_PATTERN}</code>.
                </span>
              </span>
            </label>

            {folderMode === "pattern" ? (
              <div className="flex flex-col gap-1 pl-7">
                <label
                  htmlFor="folder-pattern"
                  className="text-xs font-bold uppercase text-zinc-700 dark:text-zinc-400"
                >
                  Folder pattern
                </label>
                <input
                  id="folder-pattern"
                  type="text"
                  name="folderPattern"
                  value={folderPattern}
                  onChange={(event) => setFolderPattern(event.target.value)}
                  placeholder={DEFAULT_FOLDER_PATTERN}
                  className="use-transition w-full rounded-md border border-faint bg-second-layer-thin px-3 py-2 outline-none focus:border-subtle focus:bg-second-layer-thin-active dark:bg-second-layer-thin-dark dark:focus:bg-second-layer-thin-dark-active"
                />
                <p className="text-xs text-zinc-500">
                  Available tokens:{" "}
                  {FOLDER_PATTERN_TOKENS.map((token, index) => (
                    <span key={token}>
                      <code>{`{${token}}`}</code>
                      {index < FOLDER_PATTERN_TOKENS.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </p>
              </div>
            ) : null}

            <label className="use-transition flex cursor-pointer items-start gap-3 rounded-md border border-faint bg-zinc-950/20 px-3 py-2 hover:bg-second-layer-thin-hover dark:hover:bg-second-layer-thin-hover-dark">
              <input
                type="radio"
                name="folderMode"
                value="fixed"
                checked={folderMode === "fixed"}
                onChange={() => setFolderMode("fixed")}
                className="mt-1 accent-[#0084ff]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm">Use one folder for all songs</span>
                <span className="text-xs text-zinc-500">
                  Leave the subfolder blank to upload into the destination root.
                </span>
              </span>
            </label>

            {folderMode === "fixed" ? (
              <div className="flex flex-col gap-1 pl-7">
                <label
                  htmlFor="subdir"
                  className="text-xs font-bold uppercase text-zinc-700 dark:text-zinc-400"
                >
                  Destination subfolder (optional)
                </label>
                <input
                  id="subdir"
                  type="text"
                  name="subdir"
                  value={subdir}
                  onChange={(event) => setSubdir(event.target.value)}
                  placeholder="e.g. rock/2024"
                  className="use-transition w-full rounded-md border border-faint bg-second-layer-thin px-3 py-2 outline-none focus:border-subtle focus:bg-second-layer-thin-active dark:bg-second-layer-thin-dark dark:focus:bg-second-layer-thin-dark-active"
                />
              </div>
            ) : null}
          </fieldset>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase text-zinc-700 dark:text-zinc-400">
              Files
            </label>
            <input
              ref={fileInputRef}
              type="file"
              name="files"
              multiple
              required
              disabled={isSubmitting}
              onChange={(event) =>
                setFiles(Array.from(event.target.files ?? []))
              }
              className="file:btn-accent mt-2 w-full rounded-md border border-dashed border-subtle bg-zinc-950/40 px-3 py-2 text-sm text-slate-200 file:mr-4 file:rounded-sm file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            />
            <p className="text-xs text-zinc-500">
              {files.length === 0
                ? "You can select multiple files at once."
                : `${files.length} ${
                    files.length === 1 ? "file" : "files"
                  } selected${
                    files.length <= 3
                      ? `: ${files.map((selectedFile) => selectedFile.name).join(", ")}`
                      : ""
                  }`}
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-accent cursor-pointer w-full py-1.5 rounded-full"
          >
            {isSubmitting
              ? progress
                ? `Uploading ${progress.current} of ${progress.total}…`
                : "Uploading…"
              : files.length > 1
                ? `Upload ${files.length} files`
                : "Upload"}
          </button>
        </form>

        {status ? (
          <div
            role="status"
            className={`rounded-lg border px-4 py-3 text-sm ${
              status.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/40 bg-rose-500/10 text-rose-200"
            }`}
          >
            <p>{status.message}</p>
            {status.details && status.details.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {status.details.slice(0, 5).map((detail, index) => (
                  <li key={`${detail}-${index}`}>{detail}</li>
                ))}
                {status.details.length > 5 ? (
                  <li>…and {status.details.length - 5} more.</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default App;
