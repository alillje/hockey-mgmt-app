import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { Diagram } from "../../lib/types";
import { animationErrors, animationSeconds } from "./animationRules";
import { renderAnimationFrame } from "./renderAnimationFrame";

/** Bounded, cancellable export. Only the current raster and encoded bytes are retained. */
export async function exportAnimationGif(
  diagram: Diagram,
  title: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<Blob> {
  if (!diagram.animation || animationErrors(diagram).length)
    throw new Error("Set up a valid animation before exporting.");
  signal.throwIfAborted();
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 440;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("GIF export is unavailable in this browser.");
  const encoder = GIFEncoder();
  const duration = animationSeconds(diagram);
  const frameCount = Math.ceil(duration * 12);
  try {
    for (let index = 0; index <= frameCount; index++) {
      signal.throwIfAborted();
      await renderAnimationFrame(
        context,
        diagram,
        title,
        (duration * index) / frameCount,
        signal,
      );
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const palette = quantize(pixels, 128);
      const indexed = applyPalette(pixels, palette);
      encoder.writeFrame(indexed, canvas.width, canvas.height, {
        palette,
        // GIF delays use centiseconds. Distribute rounding so export keeps the timeline's duration.
        delay:
          index === frameCount
            ? 800
            : (index === 0 ? 500 : 0) +
              (Math.round((duration * 100 * (index + 1)) / frameCount) -
                Math.round((duration * 100 * index) / frameCount)) *
                10,
        repeat: 0,
      });
      onProgress(Math.round(((index + 1) / (frameCount + 1)) * 100));
      // Yield between frames to keep progress, cancel and navigation usable without a worker/CSP exception.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    encoder.finish();
    return new Blob([new Uint8Array(encoder.bytes()).buffer], {
      type: "image/gif",
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
