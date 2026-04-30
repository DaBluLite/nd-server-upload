import { type FormEvent, useRef, useState } from 'react'

const PASSWORD_ENV = 'UPLOAD_PASSWORD'

type Status = {
  message: string
  ok: boolean
}

function App() {
  const [password, setPassword] = useState('')
  const [subdir, setSubdir] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus(null)

    if (!file) {
      setStatus({ message: 'Please choose a file to upload.', ok: false })
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    try {
      setIsSubmitting(true)
      const trimmedSubdir = subdir.trim()
      const response = await fetch('/upload', {
        method: 'POST',
        headers: {
          'x-upload-password': password,
          ...(trimmedSubdir ? { 'x-upload-subdir': trimmedSubdir } : {}),
        },
        body: formData,
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        message?: string
      }

      if (!response.ok) {
        setStatus({ message: payload.error ?? 'Upload failed.', ok: false })
        return
      }

      setStatus({ message: payload.message ?? 'Upload complete.', ok: true })
      setPassword('')
      setSubdir('')
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      setStatus({ message: 'Upload failed. Check the server logs.', ok: false })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-400">nd-server-upload</p>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Upload songs to Navidrome</h1>
          <p className="text-sm text-slate-400">
            Configure the destination path on the server (see the README). Passwords are checked
            against <code>{PASSWORD_ENV}</code>.
          </p>
        </header>

        <form
          className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg"
          onSubmit={handleSubmit}
        >
          <label className="block text-sm font-medium text-slate-200">
            Password
            <input
              type="password"
              name="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
            />
          </label>

          <label className="block text-sm font-medium text-slate-200">
            Destination subfolder (optional)
            <input
              type="text"
              name="subdir"
              value={subdir}
              onChange={(event) => setSubdir(event.target.value)}
              placeholder="e.g. rock/2024"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
            />
          </label>

          <label className="block text-sm font-medium text-slate-200">
            File
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              required
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 w-full rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 file:mr-4 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-100 hover:file:bg-slate-700"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
          >
            {isSubmitting ? 'Uploading…' : 'Upload'}
          </button>
        </form>

        {status ? (
          <div
            role="status"
            className={`rounded-lg border px-4 py-3 text-sm ${
              status.ok
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
            }`}
          >
            {status.message}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App
