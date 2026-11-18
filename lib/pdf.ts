import { createWriteStream } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatEUR, formatPercent, formatQty } from "@/lib/format";
import type { PrintableDocument, WorkshopProfile } from "@/lib/printable";

const regularFont = path.join(process.cwd(), "assets/fonts/DejaVuSans.ttf");
const boldFont = path.join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");

function render(doc: PDFKit.PDFDocument, printable: PrintableDocument, workshop: WorkshopProfile) {
  const pine = "#0b8f9c";
  const copper = "#0b8f9c";
  const ink = "#1c1916";
  const muted = "#5c574e";
  const line = "#e4ddd0";
  const left = 40;
  const width = 515;

  doc.rect(0, 0, 595.28, 10).fill(pine);
  const company = workshop;
  doc.fillColor(ink).font("bold").fontSize(9).text(company.legalName || company.tradeName || "Oficina", left, 24, { width: 300 });
  doc.font("body").fontSize(8).fillColor(muted);
  doc.text(company.address, left, 40, { width: 280 });
  doc.text(`${company.postalCode} ${company.city}`, left, 50, { width: 280 });
  doc.text(company.phone ? `Tel./WhatsApp ${company.phone}` : "", left, 60, { width: 280 });
  doc.text(company.email, left, 70, { width: 280 });
  doc.text(company.nif ? `NIF ${company.nif}` : "", left, 90, { width: 280 });

  doc.fillColor(copper).font("bold").fontSize(11).text(printable.title.toUpperCase(), 330, 32, { width: 225, align: "right" });
  doc.fillColor(ink).fontSize(16).text(printable.number, 330, 48, { width: 225, align: "right" });
  doc.font("body").fontSize(9).fillColor(muted).text(printable.statusLabel, 330, 70, { width: 225, align: "right" });

  doc.moveTo(left, 122).lineTo(555, 122).strokeColor(line).stroke();

  doc.roundedRect(left, 136, 250, 92, 6).strokeColor(line).stroke();
  doc.roundedRect(305, 136, 250, 92, 6).strokeColor(line).stroke();
  doc.fillColor(copper).font("bold").fontSize(8).text("CLIENTE", 52, 146);
  doc.fillColor(ink).font("bold").fontSize(11).text(printable.client.name, 52, 160, { width: 226 });
  doc.font("body").fontSize(9).fillColor(muted);
  doc.text(`NIF ${printable.client.nif}`, 52, 176, { width: 226 });
  doc.text(printable.client.address || "Sem morada", 52, 188, { width: 226 });
  doc.text([printable.client.phone, printable.client.email].filter(Boolean).join(" · ") || "—", 52, 208, { width: 226 });

  doc.fillColor(copper).font("bold").fontSize(8).text("VIATURA", 317, 146);
  doc.fillColor(ink).font("bold").fontSize(11).text(printable.vehicle.plate, 317, 160);
  doc.font("body").fontSize(9).fillColor(muted);
  doc.text(`${printable.vehicle.brand} ${printable.vehicle.model} · ${printable.vehicle.year}`, 317, 176, { width: 226 });
  doc.text(`${printable.vehicle.fuel} · ${formatQty(printable.km)} km`, 317, 188, { width: 226 });
  doc.text(printable.vehicle.vin ? `VIN ${printable.vehicle.vin}` : "VIN não indicado", 317, 208, { width: 226 });

  doc.fillColor(muted).fontSize(9);
  doc.text(`${printable.primaryDateLabel}: ${printable.primaryDate}`, left, 240);
  doc.text(`${printable.secondaryDateLabel}: ${printable.secondaryDate}`, 220, 240);
  doc.text(`Km à entrada: ${formatQty(printable.km)}`, 400, 240);

  doc.fillColor(copper).font("bold").fontSize(8).text(printable.problemLabel.toUpperCase(), left, 262);
  doc.fillColor(ink).font("body").fontSize(10).text(printable.problem, left, 276, { width });

  let y = doc.y + 16;
  doc.rect(left, y, width, 18).fill("#e7f7f8");
  doc.fillColor(muted).font("bold").fontSize(8);
  doc.text("DESCRIÇÃO", left + 8, y + 5, { width: 250 });
  doc.text("QTD", 310, y + 5, { width: 40, align: "right" });
  doc.text("PREÇO", 355, y + 5, { width: 60, align: "right" });
  doc.text("IVA", 420, y + 5, { width: 40, align: "right" });
  doc.text("TOTAL", 465, y + 5, { width: 80, align: "right" });
  y += 22;

  for (const item of printable.lines) {
    if (y > 720) {
      doc.addPage();
      y = 48;
    }
    const label = item.ref ? `${item.ref}  ${item.description}` : item.description;
    const unit = item.kind === "mao_de_obra" ? `${formatQty(item.quantity)} h` : formatQty(item.quantity);
    doc.fillColor(ink).font("body").fontSize(9).text(label, left + 8, y, { width: 250 });
    const rowHeight = Math.max(16, doc.heightOfString(label, { width: 250 }));
    doc.text(unit, 310, y, { width: 40, align: "right" });
    doc.text(formatEUR(item.unitPrice), 355, y, { width: 60, align: "right" });
    doc.text(formatPercent(item.vatRate), 420, y, { width: 40, align: "right" });
    doc.text(formatEUR(item.total), 465, y, { width: 80, align: "right" });
    y += rowHeight + 6;
  }

  if (printable.lines.length === 0) {
    doc.fillColor(muted).font("body").fontSize(9).text("Sem linhas lançadas.", left + 8, y);
    y += 20;
  }

  y += 6;
  doc.moveTo(360, y).lineTo(555, y).strokeColor(line).stroke();
  y += 8;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? "bold" : "body").fontSize(bold ? 11 : 9).fillColor(bold ? ink : muted);
    doc.text(label, 360, y, { width: 90 });
    doc.fillColor(ink).text(value, 455, y, { width: 100, align: "right" });
    y += bold ? 18 : 14;
  };
  totalRow("Base s/ IVA", formatEUR(printable.totals.base));
  totalRow("IVA", formatEUR(printable.totals.vat));
  totalRow("Total", formatEUR(printable.totals.total), true);

  if (printable.invoice) {
    y += 8;
    doc.roundedRect(left, y, width, 42, 6).fillAndStroke("#fff7ed", "#fdba74");
    doc.fillColor("#9a3412").font("bold").fontSize(9).text(
      printable.invoice.simulated
        ? `Fatura simulada ${printable.invoice.number}`
        : `Fatura ${printable.invoice.number}`,
      left + 12,
      y + 8,
    );
    const origin = (printable.invoice.provider || "").toLowerCase();
    const imported = origin === "importado" || origin === "keymaster";
    const note = imported
      ? "Importado"
      : printable.invoice.simulated
        ? "Este documento não tem validade fiscal e não foi comunicado à Autoridade Tributária."
        : "";
    if (note) {
      doc.font("body").fontSize(8).text(note, left + 12, y + 22, { width: width - 24 });
    }
    y += 54;
  }

  if (printable.notes) {
    doc.fillColor(muted).font("body").fontSize(8).text(`Notas: ${printable.notes}`, left, y, { width });
    y = doc.y + 12;
  }

  y = Math.max(y + 20, 700);
  doc.moveTo(left, y).lineTo(230, y).strokeColor(line).stroke();
  doc.moveTo(330, y).lineTo(555, y).strokeColor(line).stroke();
  doc.font("body").fontSize(8).fillColor(muted).text("O cliente", left, y + 6, { width: 190 });
  doc.text("A oficina", 330, y + 6, { width: 190 });

  doc.font("body").fontSize(7.5).fillColor(muted).text(
    `${workshop.tradeName || workshop.legalName || "Oficina"} · documento interno de oficina. A faturação certificada não está ativa. Números de fatura em modo de simulação não substituem uma fatura emitida por software certificado pela AT.`,
    left,
    800,
    { width, align: "center" },
  );
}

export function renderDocumentPdf(printable: PrintableDocument, workshop: WorkshopProfile) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("body", regularFont);
    doc.registerFont("bold", boldFont);
    doc.font("body");
    render(doc, printable, workshop);
    doc.end();
  });
}

export function writePdfFile(filePath: string, printable: PrintableDocument, workshop: WorkshopProfile) {
  return new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(filePath);
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(stream);
    doc.registerFont("body", regularFont);
    doc.registerFont("bold", boldFont);
    render(doc, printable, workshop);
    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}
