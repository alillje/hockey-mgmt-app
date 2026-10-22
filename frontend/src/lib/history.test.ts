import { describe, it, expect } from "vitest";
import { commit, initialHistory, redo, undo } from "./history";
describe("diagram history", () => {
  it("restores previous content and reapplies edits", () => {
    const a = { objects: ["cone"] };
    const b = { objects: ["cone", "goal"] };
    const history = commit(initialHistory(a), b);
    expect(undo(history).present).toEqual(a);
    expect(redo(undo(history)).present).toEqual(b);
  });
  it("discards redo after a new branch and ignores unchanged edits", () => {
    const state = undo(commit(initialHistory(1), 2));
    expect(commit(state, 3).future).toEqual([]);
    expect(commit(state, 1)).toBe(state);
  });
  it("bounds undo memory and safely handles empty history", () => {
    let state = initialHistory(0);
    for (let i = 1; i <= 100; i++) state = commit(state, i);
    expect(state.past.length).toBe(80);
    expect(undo(initialHistory(0)).present).toBe(0);
    expect(redo(initialHistory(0)).present).toBe(0);
  });
});
