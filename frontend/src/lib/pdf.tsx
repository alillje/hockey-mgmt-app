import { jsPDF } from "jspdf";
import { renderToStaticMarkup } from "react-dom/server";
import { DiagramSvg } from "../components/Rink";
import type { Drill, Training } from "./types";
import { practiceBlocks } from "./practiceBlocks";
import { practicePdfOverview } from "./practicePdfOverview";
import { drillPdfHeading, drillPdfNotes } from "./drillPdfLayout";
export function fitsOnPage(y: number, height: number, bottom = 276) {
  return y + height <= bottom;
}
async function rinkImage(drill: Drill): Promise<string> {
  const svg = renderToStaticMarkup(<DiagramSvg diagram={drill.diagram} />);
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Unable to render the rink for PDF."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PDF rendering is unavailable.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 2400, 1200);
    ctx.drawImage(image, 0, 0, 2400, 1200);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export class DocumentWriter {
  doc = new jsPDF();
  y = 22;
  page() {
    this.doc.addPage();
    this.y = 22;
  }
  text(value: string, size = 11, bold = false) {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor("#183746");
    const lines = this.doc.splitTextToSize(
      value.replace(/\r/g, ""),
      174,
    ) as string[];
    for (const line of lines) {
      const h = size * 0.47 + 2;
      if (!fitsOnPage(this.y, h)) this.page();
      this.doc.text(line, 18, this.y);
      this.y += h;
    }
    this.y += 3;
  }
  async drill(drill: Drill, heading?: string, itemNotes?: string) {
    drillPdfHeading(this, drill, heading);
    if (!fitsOnPage(this.y, 91)) this.page();
    this.doc.addImage(await rinkImage(drill), "PNG", 18, this.y, 174, 87);
    this.y += 97;
    drillPdfNotes(this, "Drill notes", drill.notes);
    drillPdfNotes(this, "Practice notes", itemNotes || "");
  }
  save(title: string) {
    const count = this.doc.getNumberOfPages();
    for (let i = 1; i <= count; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.setTextColor("#73848b");
      this.doc.text("ICEWORK / COACH WORKSPACE", 18, 288);
      this.doc.text(`${i} / ${count}`, 192, 288, { align: "right" });
    }
    this.doc.save(
      (title.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "icework") + ".pdf",
    );
  }
}
export async function exportDrill(drill: Drill) {
  const writer = new DocumentWriter();
  await writer.drill(drill);
  writer.save(drill.title);
}
export async function exportTraining(training: Training, drills: Drill[]) {
  const writer = new DocumentWriter();
  practicePdfOverview(writer, training, drills);
  for (const [blockIndex, block] of practiceBlocks(training.items).entries()) {
    for (const [offset, item] of block.items.entries()) {
      const i = block.startIndex + offset;
      writer.page();
      await writer.drill(
        drills.find((d) => d.id === item.drillId)!,
        `BLOCK ${blockIndex + 1} - ${block.startMinute}-${block.startMinute + block.durationMinutes} MIN / DRILL ${i + 1}`,
        item.notes,
      );
    }
  }
  writer.save(training.title);
}
