import { Pause, Play, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { DiagramSvg } from "../../components/Rink";
import type { Diagram } from "../../lib/types";
import { animationSeconds } from "./animationRules";
import { animationFrame } from "./animationTimeline";
import { useAnimationPlayback } from "./useAnimationPlayback";

export function AnimationRouteToggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="animation-route-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      Hide all arrows and lines
    </label>
  );
}

export default function AnimationPlayer({
  diagram,
  hideRoutes = false,
}: {
  diagram: Diagram;
  hideRoutes?: boolean;
}) {
  const duration = animationSeconds(diagram);
  const revision = useMemo(() => JSON.stringify(diagram), [diagram]);
  const playback = useAnimationPlayback(duration, revision);
  const frame = useMemo(
    () =>
      animationFrame(diagram, playback.seconds, hideRoutes ? "hide" : "show"),
    [diagram, playback.seconds, hideRoutes],
  );
  return (
    <div className="animation-player">
      <div
        className="animation-rink"
        role="img"
        aria-label="Animated drill preview"
      >
        <DiagramSvg
          diagram={frame}
          includeSkatingPasses={false}
          animationPlayback
        />
      </div>
      <div className="animation-controls">
        <button
          type="button"
          className="button secondary"
          onClick={playback.toggle}
          disabled={!duration}
        >
          {playback.playing ? <Pause size={16} /> : <Play size={16} />}
          {playback.playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Restart animation"
          onClick={() => playback.seek(0)}
        >
          <RotateCcw size={17} />
        </button>
        <label className="animation-timeline">
          Timeline
          <input
            aria-label="Animation position"
            type="range"
            min="0"
            max={duration}
            step="0.01"
            value={playback.seconds}
            onChange={(event) => playback.seek(Number(event.target.value))}
          />
        </label>
        <span className="animation-time">
          {playback.seconds.toFixed(1)} / {duration.toFixed(1)} s
        </span>
        <label>
          Speed
          <select
            value={playback.speed}
            onChange={(event) => playback.setSpeed(Number(event.target.value))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
        </label>
      </div>
    </div>
  );
}
