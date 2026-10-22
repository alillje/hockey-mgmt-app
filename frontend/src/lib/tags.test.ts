import { describe, expect, it } from "vitest";
import { addTag, categoryForTags, tagFolders } from "./tags";
import { appendDrillOnce } from "./drafts";
import { newTraining } from "./types";

describe("tag folders and drafts", () => {
  it("normalizes suggested labels and puts an item in every tagged folder", () => {
    const tags = addTag(addTag([], "  skating  ", ["Skating"]), "passing", [
      "Skating",
      "Passing",
    ]);
    expect(tags).toEqual(["Skating", "Passing"]);
    expect(addTag(tags, "SKATING", ["Skating"])).toEqual(tags);
    expect(tagFolders([{ tags }, { tags: ["Passing"] }])).toEqual([
      { label: "Passing", count: 2, untagged: false },
      { label: "Skating", count: 1, untagged: false },
    ]);
  });
  it("keeps a custom Uncategorized tag distinct from no tags", () => {
    expect(tagFolders([{ tags: [] }, { tags: ["Uncategorized"] }])).toEqual([
      { label: "Uncategorized", count: 1, untagged: true },
      { label: "Uncategorized", count: 1, untagged: false },
    ]);
  });
  it("derives the primary category from the first matching tag and appends a new drill without changing prior practice items", () => {
    expect(
      categoryForTags(
        ["Custom", "Passing", "Skating"],
        [
          { id: "skating", name: "Skating" },
          { id: "passing", name: "Passing" },
        ],
      ),
    ).toBe("passing");
    const original = {
      ...newTraining(),
      title: "Practice",
      notes: "Bring cones",
      tags: ["Youth"],
      items: [{ drillId: "first", durationMinutes: 25, notes: "Groups" }],
    };
    const next = appendDrillOnce(original, "new");
    expect(original.items).toHaveLength(1);
    expect(next).toMatchObject({
      title: "Practice",
      notes: "Bring cones",
      tags: ["Youth"],
      items: [
        { drillId: "first", durationMinutes: 25, notes: "Groups" },
        { drillId: "new", durationMinutes: 10, notes: "" },
      ],
    });
  });
});
