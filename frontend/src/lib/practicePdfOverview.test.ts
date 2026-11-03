import { expect, it, vi } from "vitest";
import { DocumentWriter } from "./pdf";
import { practicePdfOverview } from "./practicePdfOverview";
import { emptyDiagram, type Drill, type Training } from "./types";

it("keeps long block notes and final drills within printable pages", () => {
  const writer = new DocumentWriter();
  const text = vi.spyOn(writer.doc, "text");
  const drill: Drill = {
    id: "a",
    title: "Skating circuit",
    notes: "",
    categoryId: "skating",
    tags: [],
    updatedAt: "",
    diagram: emptyDiagram(),
  };
  const notes = Array.from(
    { length: 160 },
    (_, index) =>
      `Station cue ${index + 1}: maintain speed and keep your head up.`,
  ).join("\n");
  const training: Training = {
    id: "plan",
    title: "Practice",
    notes: "",
    tags: [],
    updatedAt: "",
    items: [
      { drillId: "a", durationMinutes: 10, notes },
      {
        drillId: "a",
        durationMinutes: 10,
        notes: "Second station",
        runInParallelWithPrevious: true,
      },
      { drillId: "a", durationMinutes: 15, notes: "Final cue" },
    ],
  };
  practicePdfOverview(writer, training, [drill]);
  const rendered = text.mock.calls.map((call) => String(call[0])).join("\n");
  expect(rendered).toContain("Station cue 1:");
  expect(rendered).toContain("Station cue 160:");
  expect(rendered).toContain("Block 1 (continued)");
  expect(rendered).toContain("Block 2");
  expect(rendered).toContain("10-25 min");
  expect(rendered).toContain("Second station");
  expect(rendered).toContain("Final cue");
  expect(rendered).toContain("25\nMINUTES");
  expect(writer.doc.getNumberOfPages()).toBeGreaterThan(1);
  expect(
    text.mock.calls.every(
      (call) => Number(call[2]) >= 22 && Number(call[2]) < 276,
    ),
  ).toBe(true);
});
