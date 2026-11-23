import { ChevronDown, Play } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { RinkMarkings, RinkOrientation } from "../../components/Rink";
import { rinkViewBox } from "../../lib/geometry";
import type { Diagram } from "../../lib/types";
import "./animation.css";
const AnimationSetup = lazy(() => import("./AnimationSetup"));

function AnimationLoading({ size }: { size: Diagram["rinkSize"] }) {
  return (
    <div className="animation-setup animation-loading" aria-busy="true">
      <div aria-hidden="true">
        <div className="animation-loading-controls">
          <span />
          <span />
          <span />
        </div>
        <div className="animation-rink">
          <svg
            viewBox={rinkViewBox(size)}
            className={size === "half" ? "half-rink" : undefined}
          >
            <RinkOrientation size={size}>
              <RinkMarkings size={size} />
            </RinkOrientation>
          </svg>
        </div>
      </div>
      <span className="visually-hidden" role="status">
        Loading animation tools
      </span>
    </div>
  );
}

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
        <Suspense fallback={<AnimationLoading size={diagram.rinkSize} />}>
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
