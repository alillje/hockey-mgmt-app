import type { DocumentWriter } from "./pdf";
import type { Drill, Training } from "./types";
import { plannedMinutes, practiceBlocks } from "./practiceBlocks";

/** Printable overview; drill detail pages are rendered separately. */
export function practicePdfOverview(
  writer: DocumentWriter,
  training: Training,
  drills: Drill[],
) {
  const { doc } = writer;
  const blocks = practiceBlocks(training.items);
  function label(
    text: string,
    x: number,
    y: number,
    size: number,
    bold = false,
    color = "#183746",
    right = false,
  ) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(text, x, y, { align: right ? "right" : "left" });
  }
  label("PRACTICE PLAN", 18, writer.y, 9, true, "#167e83");
  writer.y += 12;
  writer.text(training.title, 24, true);
  if (writer.y + 25 > 276) writer.page();
  const stats = [
    [String(plannedMinutes(training.items)), "MINUTES"],
    [String(blocks.length), "BLOCKS"],
    [String(training.items.length), "DRILLS"],
  ];
  stats.forEach(([value, name], index) => {
    const x = 24 + index * 58;
    label(value, x, writer.y + 10, 17, true);
    label(name, x, writer.y + 17, 8, false, "#60757d");
  });
  let summaryEnd = writer.y + 17;
  writer.y += 32;
  if (training.tags.length) {
    writer.text(training.tags.join(" · "), 9);
    summaryEnd = writer.y - (9 * 0.47 + 2) - 3;
  }
  if (training.notes.trim()) {
    writer.text(training.notes, 10);
    summaryEnd = writer.y - (10 * 0.47 + 2) - 3;
  }
  writer.y += 3;

  for (const [index, block] of blocks.entries()) {
    if (writer.y + 36 > 276) {
      writer.page();
    } else {
      doc.setDrawColor("#e1e7e8");
      doc.setLineWidth(0.2);
      const separatorY =
        index === 0 ? (summaryEnd + writer.y + 8) / 2 : writer.y;
      doc.line(18, separatorY, 192, separatorY);
    }
    function blockHeading(continued = false) {
      label(
        `Block ${index + 1}${continued ? " (continued)" : ""}`,
        23,
        writer.y + 8,
        10,
        true,
      );
      label(
        `${block.startMinute}-${block.startMinute + block.durationMinutes} min  /  ${block.durationMinutes} min`,
        187,
        writer.y + 8,
        9,
        false,
        "#4d6872",
        true,
      );
      writer.y += 19;
    }
    function ensureLineSpace() {
      if (writer.y + 7 > 276) {
        writer.page();
        blockHeading(true);
      }
    }
    blockHeading();
    let lastLineY = writer.y;
    for (const [offset, item] of block.items.entries()) {
      const drill = drills.find((candidate) => candidate.id === item.drillId);
      if (!drill)
        throw new Error(
          "A drill in this practice could not be found. Reload your library.",
        );
      // Reserve room for at least the title and first note line together.
      if (writer.y + (item.notes.trim() ? 14 : 7) > 276) {
        writer.page();
        blockHeading(true);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      const titleLines = doc.splitTextToSize(
        drill.title.replace(/\r/g, ""),
        155,
      ) as string[];
      for (const [lineIndex, line] of titleLines.entries()) {
        ensureLineSpace();
        if (lineIndex === 0)
          label(
            String(block.startIndex + offset + 1).padStart(2, "0"),
            23,
            writer.y,
            9,
            false,
            "#708581",
          );
        label(line, 32, writer.y, 11, true);
        lastLineY = writer.y;
        writer.y += 6;
      }
      if (item.notes.trim()) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const noteLines = doc.splitTextToSize(
          item.notes.replace(/\r/g, ""),
          155,
        ) as string[];
        for (const line of noteLines) {
          ensureLineSpace();
          label(line, 32, writer.y, 9, false, "#60757d");
          lastLineY = writer.y;
          writer.y += 5;
        }
      }
      writer.y += 4;
    }
    // Centre the separator between the preceding text and the next block heading.
    writer.y = lastLineY + 8;
  }
}
