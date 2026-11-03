import { expect, it } from "vitest";
import type { TrainingItem } from "./types";
import {
  joinPreviousBlock,
  movePracticeBlock,
  plannedMinutes,
  practiceBlocks,
  removePracticeItem,
} from "./practiceBlocks";
const item = (
  drillId: string,
  durationMinutes = 10,
  runInParallelWithPrevious = false,
) => ({ drillId, durationMinutes, runInParallelWithPrevious, notes: drillId });

it("keeps legacy entries sequential and counts a group of four only once", () => {
  const legacy = [item("a"), item("b"), item("c"), item("d")];
  expect(plannedMinutes(legacy)).toBe(40);
  let grouped: TrainingItem[] = legacy;
  for (const index of [1, 2, 3])
    grouped = joinPreviousBlock(grouped, index, true);
  expect(plannedMinutes(grouped)).toBe(10);
  expect(practiceBlocks(grouped)[0].items).toHaveLength(4);
  expect(legacy.every((entry) => !entry.runInParallelWithPrevious)).toBe(true);
});
it("joining adopts the previous block's shared time and splitting retains it", () => {
  const joined = joinPreviousBlock(
    [item("a", 15), item("b", 8), item("c", 8, true)],
    1,
    true,
  );
  expect(joined.map((entry) => entry.durationMinutes)).toEqual([15, 15, 15]);
  const split = joinPreviousBlock(joined, 1, false);
  expect(practiceBlocks(split).map((block) => block.items.length)).toEqual([
    1, 2,
  ]);
  expect(plannedMinutes(split)).toBe(30);
});
it("moving and removing entries preserve block boundaries and notes", () => {
  const entries = [item("a"), item("b", 10, true), item("c", 20)];
  const moved = movePracticeBlock(entries, 0, 1);
  expect(moved.map((entry) => entry.drillId)).toEqual(["c", "a", "b"]);
  expect(plannedMinutes(moved)).toBe(30);
  const removed = removePracticeItem(moved, 1);
  expect(
    practiceBlocks(removed).map((block) =>
      block.items.map((entry) => entry.notes),
    ),
  ).toEqual([["c"], ["b"]]);
  expect(removePracticeItem(entries, 0)[0].runInParallelWithPrevious).toBe(
    false,
  );
});
it("supports empty practices and zero-duration blocks", () => {
  expect(plannedMinutes([])).toBe(0);
  expect(plannedMinutes([item("a", 0), item("b", 0, true)])).toBe(0);
});
