import { renderToStaticMarkup } from "react-dom/server";
import { DiagramSvg } from "../../components/Rink";
import type { Diagram } from "../../lib/types";
import { animationFrame } from "./animationTimeline";

/** Render one frame without retaining images or object URLs between frames. */
export async function renderAnimationFrame(
  context: CanvasRenderingContext2D,
  diagram: Diagram,
  title: string,
  seconds: number,
  hideRoutes: boolean,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const source = renderToStaticMarkup(
    <DiagramSvg
      diagram={animationFrame(diagram, seconds, hideRoutes ? "hide" : "show")}
      includeSkatingPasses={false}
      animationPlayback
    />,
  );
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
  );
  const image = new Image();
  let abort: () => void = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Could not render an animation frame."));
      image.src = url;
    });
    signal.throwIfAborted();
    const width = context.canvas.width;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, context.canvas.height);
    context.font = "600 18px Arial, sans-serif";
    context.fillStyle = "#183746";
    context.fillText(title, 14, 25, width - 110);
    context.font = "12px Arial, sans-serif";
    context.fillStyle = "#167e83";
    context.textAlign = "right";
    context.fillText("ICEWORK", width - 14, 25);
    context.textAlign = "left";
    context.drawImage(image, 0, 40, width, width / 2);
  } finally {
    signal.removeEventListener("abort", abort);
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}
