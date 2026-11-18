import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
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
  function renderHeader(exportButton?: ReactNode) {
    return (
      <header className="animation-dialog-heading">
        <h2 id={headingId}>{title}</h2>
        {exportButton}
        <button
          type="button"
          className="icon-button"
          aria-label="Close animation"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
    );
  }

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
        {errors.length ? (
          <>
            {renderHeader()}
            <p className="alert">
              This animation needs updating in the drill editor.
            </p>
          </>
        ) : (
          <GifExportControls diagram={diagram} title={title}>
            {(exportButton) => (
              <>
                {renderHeader(exportButton)}
                <AnimationPlayer diagram={diagram} />
              </>
            )}
          </GifExportControls>
        )}
      </div>
    </dialog>
  );
}
