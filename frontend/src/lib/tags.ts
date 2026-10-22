import type { Category } from "./types";

export const STATIC_CATEGORIES: Category[] = [
  { id: "skating", name: "Skating" },
  { id: "stick-handling", name: "Stick handling" },
  { id: "passing", name: "Passing" },
  { id: "shooting", name: "Shooting" },
  { id: "tactics", name: "Tactics" },
  { id: "warm-up", name: "Warm-up" },
  { id: "other", name: "Other" },
];
export const tagKey = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function catalogCategories(categories: Category[]): Category[] {
  return STATIC_CATEGORIES.map((option) => {
    const fromApi = categories.find(
      (category) => tagKey(category.id) === tagKey(option.id),
    );
    return fromApi ? { id: option.id, name: fromApi.name } : option;
  });
}
export function normalizeTags(
  tags: string[] | undefined | null,
  categories: Category[],
): string[] {
  const options = catalogCategories(categories);
  const result: string[] = [];
  for (const tag of tags || []) {
    const option =
      options.find(
        (candidate) =>
          tagKey(candidate.name) === tagKey(tag) ||
          tagKey(candidate.id) === tagKey(tag),
      ) || options.find((candidate) => candidate.id === "other")!;
    if (!result.some((label) => tagKey(label) === tagKey(option.name)))
      result.push(option.name);
  }
  return result;
}
export function categoryForTags(
  tags: string[],
  categories: Category[],
): string {
  const options = catalogCategories(categories);
  return (
    tags
      .map(
        (tag) =>
          options.find((option) => tagKey(option.name) === tagKey(tag))?.id,
      )
      .find(Boolean) || "other"
  );
}
export function tagFolders<T extends { tags: string[] }>(items: T[]) {
  const map = new Map<
    string,
    { label: string; count: number; untagged?: boolean }
  >();
  for (const item of items) {
    for (const tag of item.tags.length ? item.tags : ["Uncategorized"]) {
      const untagged = item.tags.length === 0;
      const key = untagged ? "\0uncategorized" : tagKey(tag);
      const folder = map.get(key);
      if (folder) folder.count += 1;
      else map.set(key, { label: tag, count: 1, untagged });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}
