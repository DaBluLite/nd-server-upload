import { type FormEvent, useRef, useState } from "react";

const PASSWORD_ENV = "UPLOAD_PASSWORD";

type Status = {
  message: string;
  ok: boolean;
};

function App() {
  const [password, setPassword] = useState("");
  const [subdir, setSubdir] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    if (!file) {
      setStatus({ message: "Please choose a file to upload.", ok: false });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setIsSubmitting(true);
      const trimmedSubdir = subdir.trim();
      const response = await fetch("/upload", {
        method: "POST",
        headers: {
          "x-upload-password": password,
          ...(trimmedSubdir ? { "x-upload-subdir": trimmedSubdir } : {}),
        },
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setStatus({ message: payload.error ?? "Upload failed.", ok: false });
        return;
      }

      setStatus({ message: payload.message ?? "Upload complete.", ok: true });
      setPassword("");
      setSubdir("");
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      setStatus({
        message: "Upload failed. Check the server logs.",
        ok: false,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100">
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

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase text-zinc-700 dark:text-zinc-400">
              Destination subfolder (optional)
            </label>
            <input
              type="text"
              name="subdir"
              value={subdir}
              onChange={(event) => setSubdir(event.target.value)}
              placeholder="e.g. rock/2024"
              className="w-full use-transition px-3 py-2 bg-second-layer-thin dark:bg-second-layer-thin-dark focus:bg-second-layer-thin-active dark:focus:bg-second-layer-thin-dark-active border border-faint shadow-glass rounded-md outline-none focus:border-subtle"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase text-zinc-700 dark:text-zinc-400">
              File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              required
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="file:btn-accent mt-2 w-full rounded-md border border-dashed border-subtle bg-zinc-950/40 px-3 py-2 text-sm text-slate-200 file:mr-4 file:rounded-sm file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-accent cursor-pointer w-full py-1.5 rounded-full"
          >
            {isSubmitting ? "Uploading…" : "Upload"}
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
            {status.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default App;
