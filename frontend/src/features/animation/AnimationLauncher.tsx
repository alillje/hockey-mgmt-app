import { lazy, Suspense, useState } from "react";
import { Play } from "lucide-react";
import type { Diagram } from "../../lib/types";
import "./animation.css";
const AnimationDialog = lazy(() => import("./AnimationDialog"));

export default function AnimationLauncher({
  diagram,
  title,
}: {
  diagram: Diagram;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  if (!diagram.animation?.actions.length) return null;
  return (
    <div className="animation-launcher">
      <button
        type="button"
        className="animation-link"
        onClick={() => setOpen(true)}
      >
        <Play size={15} />
        View animation
      </button>
      {open && (
        <Suspense fallback={<p role="status">Loading animation…</p>}>
          <AnimationDialog
            diagram={diagram}
            title={title}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
