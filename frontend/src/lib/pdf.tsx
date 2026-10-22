import { jsPDF } from "jspdf";
import { renderToStaticMarkup } from "react-dom/server";
import { DiagramSvg } from "../components/Rink";
import type { Drill, Training } from "./types";
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
    if (heading) this.text(heading, 11, true);
    this.text(drill.title, 22, true);
    this.text(drill.tags.length ? drill.tags.join(" · ") : "Uncategorized", 9);
    if (!fitsOnPage(this.y, 91)) this.page();
    this.doc.addImage(await rinkImage(drill), "PNG", 18, this.y, 174, 87);
    this.y += 97;
    if (drill.notes) {
      this.text("COACHING NOTES", 10, true);
      this.text(drill.notes);
    }
    if (itemNotes) {
      this.text("PRACTICE NOTES", 10, true);
      this.text(itemNotes);
    }
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
  writer.text("PRACTICE PLAN", 10, true);
  writer.text(training.title, 24, true);
  writer.text(
    `${training.items.length} drills / ${training.items.reduce((n, i) => n + i.durationMinutes, 0)} minutes`,
    12,
  );
  writer.text(
    training.tags.length ? training.tags.join(" · ") : "Uncategorized",
    9,
  );
  if (training.notes) writer.text(training.notes);
  writer.text("RUN OF PRACTICE", 12, true);
  for (const [i, item] of training.items.entries()) {
    const drill = drills.find((d) => d.id === item.drillId);
    if (!drill)
      throw new Error(
        "A drill in this practice could not be found. Reload your library.",
      );
    writer.text(
      `${i + 1}. ${drill.title} - ${item.durationMinutes} min`,
      12,
      true,
    );
    if (item.notes) writer.text(item.notes);
  }
  for (const [i, item] of training.items.entries()) {
    writer.page();
    await writer.drill(
      drills.find((d) => d.id === item.drillId)!,
      `${i + 1} / ${training.items.length}  -  ${item.durationMinutes} MIN`,
      item.notes,
    );
  }
  writer.save(training.title);
}
