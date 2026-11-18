import { useEffect, useId, useRef } from "react";
import { Maximize, X } from "lucide-react";
import type { Diagram } from "../../lib/types";
import AnimationPlayer from "./AnimationPlayer";
import GifExportControls from "./GifExportControls";
import { animationErrors } from "./animationRules";

export default function AnimationDialog({
  diagram,
  title,
  onClose,
}: {
  diagram: Diagram;
  title: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const errors = animationErrors(diagram);
  return (
    <dialog
      ref={dialog}
      className="animation-dialog"
      aria-labelledby={headingId}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="animation-dialog-content">
        <header className="animation-dialog-heading">
          <h2 id={headingId}>{title}</h2>
          <div className="inline">
            {document.fullscreenEnabled && (
              <button
                type="button"
                className="icon-button"
                aria-label="Full screen animation"
                onClick={() =>
                  void dialog.current?.requestFullscreen().catch(() => {})
                }
              >
                <Maximize size={18} />
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="Close animation"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </header>
        {errors.length ? (
          <p className="alert">
            This animation needs updating in the drill editor.
          </p>
        ) : (
          <>
            <AnimationPlayer diagram={diagram} />
            <GifExportControls diagram={diagram} title={title} />
          </>
        )}
      </div>
    </dialog>
  );
}
