import type { TrainingItem } from "./types";

export type PracticeBlock = {
  items: TrainingItem[];
  startIndex: number;
  durationMinutes: number;
  startMinute: number;
};

export function practiceBlocks(items: TrainingItem[]): PracticeBlock[] {
  const blocks: PracticeBlock[] = [];
  for (const [index, item] of items.entries()) {
    if (!blocks.length || !item.runInParallelWithPrevious) {
      const previous = blocks.at(-1);
      blocks.push({
        items: [],
        startIndex: index,
        durationMinutes: item.durationMinutes,
        startMinute: previous
          ? previous.startMinute + previous.durationMinutes
          : 0,
      });
    }
    blocks.at(-1)!.items.push(item);
  }
  return blocks;
}

export function plannedMinutes(items: TrainingItem[]): number {
  return practiceBlocks(items).reduce(
    (sum, block) => sum + block.durationMinutes,
    0,
  );
}

export function joinPreviousBlock(
  items: TrainingItem[],
  index: number,
  join: boolean,
): TrainingItem[] {
  const changed = items.map((item, i) =>
    i === index ? { ...item, runInParallelWithPrevious: i > 0 && join } : item,
  );
  return practiceBlocks(changed).flatMap((block) =>
    block.items.map((item, i) => ({
      ...item,
      durationMinutes: block.durationMinutes,
      runInParallelWithPrevious: i > 0,
    })),
  );
}

export function removePracticeItem(
  items: TrainingItem[],
  index: number,
): TrainingItem[] {
  return items
    .filter((_, i) => i !== index)
    .map((item, i) =>
      (i === index && !items[index].runInParallelWithPrevious) || i === 0
        ? { ...item, runInParallelWithPrevious: false }
        : item,
    );
}

export function movePracticeBlock(
  items: TrainingItem[],
  index: number,
  by: number,
): TrainingItem[] {
  const blocks = practiceBlocks(items);
  if (index + by < 0 || index + by >= blocks.length) return items;
  [blocks[index], blocks[index + by]] = [blocks[index + by], blocks[index]];
  return blocks.flatMap((block) => block.items);
}
