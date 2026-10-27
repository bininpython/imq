import { strFromU8, unzipSync } from "fflate";

/**
 * Leitor leve de planilhas: .xlsx (Office Open XML) e .csv.
 * Retorna a primeira aba como matriz de textos, sem depender do DOM,
 * para funcionar igual no navegador e nos testes.
 */
export type SheetTable = string[][];

export async function readSpreadsheet(file: File): Promise<SheetTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(await file.text());
  if (name.endsWith(".xls")) {
    throw new Error("Formato .xls antigo não é suportado. Salve a planilha como .xlsx e envie novamente.");
  }
  return parseXlsx(new Uint8Array(await file.arrayBuffer()));
}

export function parseXlsx(data: Uint8Array): SheetTable {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new Error("Não foi possível abrir o arquivo. Verifique se é uma planilha .xlsx válida.");
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : "");

  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => readRichText(match[1]));
  const sheetPath = firstSheetPath(text("xl/workbook.xml"), text("xl/_rels/workbook.xml.rels"))
    ?? Object.keys(files).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path)).sort()[0];
  if (!sheetPath || !files[sheetPath]) throw new Error("A planilha não tem nenhuma aba legível.");

  const rows: SheetTable = [];
  for (const rowMatch of text(sheetPath).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowIndex = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1] ?? rows.length + 1) - 1;
    const row: string[] = [];
    for (const cell of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const body = cell[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : row.length;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = readRichText(body);
      else if (type === "b") value = raw === "1" ? "VERDADEIRO" : "FALSO";
      else value = raw !== undefined ? decodeXml(raw) : "";
      row[col] = value;
    }
    rows[rowIndex] = Array.from(row, (value) => value ?? "");
  }
  return Array.from(rows, (row) => row ?? []);
}

export function parseCsv(input: string): SheetTable {
  const content = input.replace(/^﻿/, "");
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: SheetTable = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function firstSheetPath(workbook: string, rels: string): string | null {
  const relId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  if (!relId) return null;
  const target = new RegExp(`<Relationship\\b[^>]*Id="${relId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
    ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${relId}"`).exec(rels)?.[1];
  if (!target) return null;
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

function readRichText(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}
