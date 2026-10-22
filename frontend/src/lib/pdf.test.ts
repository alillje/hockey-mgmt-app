import { expect, it, vi } from "vitest";
import { DocumentWriter } from "./pdf";
it("paginates long coaching notes without losing lines or entering the footer", () => {
  const writer = new DocumentWriter();
  const text = vi.spyOn(writer.doc, "text");
  const notes = Array.from(
    { length: 180 },
    (_, i) =>
      `Coaching cue ${i + 1}: keep your head up and finish every stride.`,
  ).join("\n");
  writer.text(notes);
  expect(writer.doc.getNumberOfPages()).toBeGreaterThan(3);
  const lines = text.mock.calls.map((call) => String(call[0])).join("\n");
  expect(lines).toContain("Coaching cue 1:");
  expect(lines).toContain("Coaching cue 180:");
  expect(
    text.mock.calls.every(
      (call) => Number(call[2]) >= 22 && Number(call[2]) < 276,
    ),
  ).toBe(true);
});
