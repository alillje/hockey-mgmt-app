import type { Drill, Training } from "./types";
export type Draft = Drill | Training;
export const draftKey = (kind: "drills" | "practices", id: string) =>
  `icework:draft:${kind}:${id}`;
export const parentKey = "icework:nested-practice-parent";
export const appendKey = "icework:nested-drill-append";
export function readDraft<T extends Draft>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null") as T | null;
  } catch {
    return null;
  }
}
export function writeDraft(key: string, value: Draft) {
  sessionStorage.setItem(key, JSON.stringify(value));
}
export function appendDrillOnce(training: Training, drillId: string): Training {
  return {
    ...training,
    items: [...training.items, { drillId, durationMinutes: 10, notes: "" }],
  };
}
