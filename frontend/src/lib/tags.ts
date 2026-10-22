import type { Category } from "./types";

export const tagKey = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
export function normalizeTag(value: string, known: string[]): string {
  const label = value.trim().replace(/\s+/g, " ");
  return known.find((tag) => tagKey(tag) === tagKey(label)) || label;
}
export function addTag(
  tags: string[],
  value: string,
  known: string[],
): string[] {
  const label = normalizeTag(value, known);
  if (
    !label ||
    label.length > 40 ||
    tags.length >= 20 ||
    tags.some((tag) => tagKey(tag) === tagKey(label))
  )
    return tags;
  return [...tags, label];
}
export function categoryForTags(
  tags: string[],
  categories: Category[],
): string {
  return (
    tags
      .map(
        (tag) =>
          categories.find((category) => tagKey(tag) === tagKey(category.name))
            ?.id,
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
