import { ChevronDown, Play } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import type { Diagram } from "../../lib/types";
import "./animation.css";
const AnimationSetup = lazy(() => import("./AnimationSetup"));

export default function AnimationSettings({
  diagram,
  onChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  diagram: Diagram;
  onChange: (diagram: Diagram) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="animation-settings"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Play className="animation-summary-icon" size={17} aria-hidden="true" />
        <span>Animation</span>
        <span className="animation-summary-status">
          {diagram.animation ? "Configured" : "Optional"}
        </span>
        <ChevronDown
          className="animation-summary-chevron"
          size={17}
          aria-hidden="true"
        />
      </summary>
      {open && (
        <Suspense fallback={<p className="muted">Loading animation tools…</p>}>
          <AnimationSetup
            diagram={diagram}
            onChange={onChange}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        </Suspense>
      )}
    </details>
  );
}
