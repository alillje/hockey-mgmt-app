// Narrow declarations for the gifenc 1.0.3 API used by this feature.
declare module "gifenc" {
  export function GIFEncoder(): {
    writeFrame(
      pixels: Uint8Array,
      width: number,
      height: number,
      options: { palette: number[][]; delay: number; repeat?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(
    pixels: Uint8ClampedArray,
    colors: number,
  ): number[][];
  export function applyPalette(
    pixels: Uint8ClampedArray,
    palette: number[][],
  ): Uint8Array;
}
