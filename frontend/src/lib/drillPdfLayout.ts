import type { DocumentWriter } from "./pdf";
import type { Drill } from "./types";

export function drillPdfHeading(
  writer: DocumentWriter,
  drill: Drill,
  context?: string,
) {
  const { doc } = writer;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor("#167e83");
  doc.text("DRILL", 18, writer.y);
  writer.y += 12;
  writer.text(drill.title, 24, true);
  writer.y -= 11;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const metadata = [
    context,
    drill.tags.length ? drill.tags.join(" · ") : "Uncategorized",
  ]
    .filter(Boolean)
    .join("\n");
  const lines = doc.splitTextToSize(metadata, 162) as string[];
  const height = lines.length * 5 + 9;
  if (writer.y + height + 8 > 276) writer.page();
  doc.setTextColor("#4d6872");
  lines.forEach((line, index) => doc.text(line, 18, writer.y + 7 + index * 5));
  doc.setDrawColor("#e1e7e8");
  doc.setLineWidth(0.2);
  doc.line(18, writer.y + height - 2, 192, writer.y + height - 2);
  writer.y += height + 6;
}

export function drillPdfNotes(
  writer: DocumentWriter,
  title: string,
  notes: string,
) {
  if (!notes.trim()) return;
  if (writer.y + 30 > 276) writer.page();
  const { doc } = writer;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor("#183746");
  doc.text(title, 18, writer.y + 7.7);
  writer.y += 14;
  writer.text(notes, 10);
  writer.y -= 1;
}
