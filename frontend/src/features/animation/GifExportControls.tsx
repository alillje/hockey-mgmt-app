import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { Diagram } from "../../lib/types";

export default function GifExportControls({
  diagram,
  title,
}: {
  diagram: Diagram;
  title: string;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; size: number } | null>(
    null,
  );
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const resultUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    },
    [],
  );
  async function generate() {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setProgress(0);
    setError("");
    setPreview(false);
    try {
      const { exportAnimationGif } = await import("./exportAnimationGif");
      const blob = await exportAnimationGif(
        diagram,
        title,
        current.signal,
        setProgress,
      );
      if (current.signal.aborted) return;
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      const url = URL.createObjectURL(blob);
      resultUrl.current = url;
      setResult({ url, size: blob.size });
    } catch (reason) {
      if (!current.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : "Could not export GIF.",
        );
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  const filename =
    (title.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "icework-drill") + ".gif";
  return (
    <section className="gif-export" aria-label="GIF export">
      <div className="inline">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void generate()}
        >
          <Download size={16} />
          {result ? "Generate GIF again" : "Export GIF"}
        </button>
        {busy && (
          <>
            <span role="status">Generating GIF… {progress}%</span>
            <button
              type="button"
              className="button secondary"
              onClick={() => controller.current?.abort()}
            >
              Cancel
            </button>
          </>
        )}
        {result && !busy && (
          <>
            <button
              type="button"
              className="button secondary"
              onClick={() => setPreview((value) => !value)}
            >
              {preview ? "Hide GIF preview" : "Preview GIF"}
            </button>
            <a className="button primary" href={result.url} download={filename}>
              Save GIF
            </a>
            <span className="muted">
              {(result.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </>
        )}
      </div>
      <p className="small muted">
        Generated on your device. Save the file to share it; it is not uploaded.
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {result && preview && (
        <img
          className="gif-preview"
          src={result.url}
          alt={`GIF animation of ${title}`}
        />
      )}
    </section>
  );
}
