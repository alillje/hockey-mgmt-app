import { describe, expect, it } from "vitest";
import {
  catalogCategories,
  categoryForTags,
  normalizeTags,
  tagFolders,
} from "./tags";
import { appendDrillOnce } from "./drafts";
import { newTraining } from "./types";

describe("static tag choices and drafts", () => {
  it("shows each catalog choice once and canonicalizes duplicates and unknown legacy labels", () => {
    const categories = catalogCategories([]);
    expect(categories.map((option) => option.name)).toEqual([
      "Skating",
      "Stick handling",
      "Passing",
      "Shooting",
      "Battling",
      "Tactics",
      "Warm-up",
      "Other",
    ]);
    expect(
      normalizeTags(
        [" skating ", "SKATING", "stick-handling", "Custom", "Other"],
        categories,
      ),
    ).toEqual(["Skating", "Stick handling", "Other"]);
    expect(normalizeTags([], categories)).toEqual([]);
  });
  it("puts a multi-tag item in every folder", () => {
    expect(
      tagFolders([{ tags: ["Skating", "Passing"] }, { tags: ["Passing"] }]),
    ).toEqual([
      { label: "Passing", count: 2, untagged: false },
      { label: "Skating", count: 1, untagged: false },
    ]);
  });
  it("derives the first matching category and preserves prior practice items when appending", () => {
    expect(categoryForTags(["Passing", "Skating"], catalogCategories([]))).toBe(
      "passing",
    );
    const original = {
      ...newTraining(),
      title: "Practice",
      notes: "Bring cones",
      tags: ["Skating"],
      items: [{ drillId: "first", durationMinutes: 25, notes: "Groups" }],
    };
    const next = appendDrillOnce(original, "new");
    expect(original.items).toHaveLength(1);
    expect(next).toMatchObject({
      title: "Practice",
      notes: "Bring cones",
      tags: ["Skating"],
      items: [
        { drillId: "first", durationMinutes: 25, notes: "Groups" },
        { drillId: "new", durationMinutes: 10, notes: "" },
      ],
    });
  });
});
