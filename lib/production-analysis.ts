import { DEFECTS } from "./inspection-codes";
import type { SheetTable } from "./spreadsheet-reader";

/*
 * Análise do "Relatório de Produção": identifica as bobinas desviadas e
 * decodifica responsáveis, motivos e defeitos. Bobinas sem desvio ficam
 * fora dos cálculos.
 *
 * Uma bobina é desviada quando:
 *   - há Desvio de Qualidade (responsável ou motivo preenchido), ou
 *   - há Desvio de Fluxo (responsável ou motivo preenchido), ou
 *   - o Destino Realizado difere do Destino Previsto (ambos informados).
 *
 * Defeitos seguem o padrão EQUIPAMENTO + CÓDIGO + COMPLEMENTO, ex.: RB1127A2
 * = RB1 · defeito 127 (catálogo) · A2. Motivos usam o mesmo catálogo (077 = 77).
 */

export type ShiftCode = "TN" | "TM" | "TT";
export type DeviationKind = "qualidade" | "fluxo" | "destino";

export type DefectRef = {
  raw: string;
  equipment: string;
  code: string;
  name: string;
  complement: string;
  known: boolean;
};

export type ReasonRef = { code: string; name: string; known: boolean };

export type Coil = {
  um: string;
  umIn: string;
  equipment: string;
  steel: string;
  thickness: string;
  width: string;
  plannedDestination: string;
  actualDestination: string;
  flowResp: string;
  flowReason: ReasonRef | null;
  qualityResp: string;
  qualityReason: ReasonRef | null;
  defects: Array<DefectRef | null>;
  date: string;
  endTime: string;
  shiftNumber: string;
  shift: ShiftCode | null;
  crew: string;
  customer: string;
  deviated: boolean;
  kinds: DeviationKind[];
};

export type ShiftGroup = {
  key: string;
  date: string;
  shiftNumber: string;
  shift: ShiftCode | null;
  crew: string;
  coils: number;
  deviated: number;
};

export type ProductionImport = {
  id: string;
  fileName: string;
  importedAt: string;
  coils: Coil[];
  shifts: ShiftGroup[];
  warnings: string[];
};

type Field =
  | "um" | "umIn" | "equipment" | "steel" | "thickness" | "thicknessIn" | "width" | "widthIn"
  | "planned" | "actual" | "flowResp" | "flowReason" | "qualityResp" | "qualityReason"
  | "defect1" | "defect2" | "defect3" | "date" | "endTime" | "shift" | "crew" | "customer";

// Cabeçalhos aceitos (já normalizados: minúsculas, sem acento e pontuação).
const ALIASES: Record<Field, string[]> = {
  um: ["unidade metalica saida", "um saida", "unidade metalica", "um", "bobina"],
  umIn: ["unidade metalica entrada", "um entrada"],
  equipment: ["equip prod", "equipamento producao", "equipamento prod", "equipamento"],
  steel: ["aco", "tipo de aco"],
  thickness: ["espessura saida", "espessura"],
  thicknessIn: ["espessura entr", "espessura entrada"],
  width: ["largura saida", "largura"],
  widthIn: ["largura entr", "largura entrada"],
  planned: ["destino previs", "destino previsto"],
  actual: ["destino realiz", "destino realizado"],
  flowResp: ["desvio fluxo resp", "desvio de fluxo resp", "desvio fluxo responsavel"],
  flowReason: ["desvio fluxo motivo", "desvio de fluxo motivo"],
  qualityResp: ["desvio qualidade resp", "desvio de qualidade resp", "desvio qualidade responsavel"],
  qualityReason: ["desvio qualidade motivo", "desvio de qualidade motivo"],
  defect1: ["defeito 1", "defeito1"],
  defect2: ["defeito 2", "defeito2"],
  defect3: ["defeito 3", "defeito3"],
  date: ["data refer", "data referencia", "data"],
  endTime: ["hora fim"],
  shift: ["turno"],
  crew: ["letra", "turma"],
  customer: ["nome do cliente", "cliente"],
};

const SHIFT_BY_NUMBER: Record<string, ShiftCode> = { "1": "TN", "2": "TM", "3": "TT", TN: "TN", TM: "TM", TT: "TT" };
const DEFECT_BY_CODE = new Map(DEFECTS.map((item) => [Number(item.code), item.name]));
const RESPONSIBLE_NAMES: Record<string, string> = { PCP: "Planejamento (PCP)" };

export const normalizeHeader = (value: string) => value
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

export function analyzeTable(table: SheetTable, fileName: string): ProductionImport {
  const { headerRow, columns } = findHeader(table);
  const warnings: string[] = [];
  const required: Field[] = ["planned", "actual", "qualityResp", "qualityReason", "defect1"];
  const missing = required.filter((field) => columns[field] === undefined);
  if (missing.length === required.length) {
    throw new Error("Não reconheci esta planilha como Relatório de Produção: faltam as colunas de destino, desvio e defeito.");
  }
  if (missing.length) warnings.push(`Colunas não encontradas: ${missing.map(fieldLabel).join(", ")}.`);

  const get = (row: string[], field: Field) => (columns[field] === undefined ? "" : clean(row[columns[field]!]));
  const coils: Coil[] = [];
  for (const row of table.slice(headerRow + 1)) {
    const um = get(row, "um") || get(row, "umIn");
    if (!um) continue;
    const plannedDestination = get(row, "planned").toUpperCase();
    const actualDestination = get(row, "actual").toUpperCase();
    const flowResp = get(row, "flowResp").toUpperCase();
    const flowReasonCode = get(row, "flowReason");
    const qualityResp = get(row, "qualityResp").toUpperCase();
    const qualityReasonCode = get(row, "qualityReason");
    const kinds: DeviationKind[] = [];
    if (qualityResp || qualityReasonCode) kinds.push("qualidade");
    if (flowResp || flowReasonCode) kinds.push("fluxo");
    if (plannedDestination && actualDestination && plannedDestination !== actualDestination) kinds.push("destino");
    const [date, time] = get(row, "date").split(" ");
    const shiftNumber = get(row, "shift");
    coils.push({
      um,
      umIn: get(row, "umIn"),
      equipment: get(row, "equipment").toUpperCase(),
      steel: get(row, "steel"),
      thickness: get(row, "thickness") || get(row, "thicknessIn"),
      width: get(row, "width") || get(row, "widthIn"),
      plannedDestination,
      actualDestination,
      flowResp,
      flowReason: decodeReason(flowReasonCode),
      qualityResp,
      qualityReason: decodeReason(qualityReasonCode),
      defects: (["defect1", "defect2", "defect3"] as const).map((field) => parseDefect(get(row, field))),
      date: date ?? "",
      endTime: get(row, "endTime") || (time ?? "").slice(0, 5),
      shiftNumber,
      shift: SHIFT_BY_NUMBER[shiftNumber.toUpperCase()] ?? null,
      crew: get(row, "crew").toUpperCase(),
      customer: get(row, "customer"),
      deviated: kinds.length > 0,
      kinds,
    });
  }
  if (!coils.length) throw new Error("A planilha não contém nenhuma unidade metálica.");

  return {
    id: crypto.randomUUID(),
    fileName,
    importedAt: new Date().toISOString(),
    coils,
    shifts: groupShifts(coils),
    warnings,
  };
}

function findHeader(table: SheetTable) {
  for (let index = 0; index < Math.min(table.length, 20); index += 1) {
    const columns: Partial<Record<Field, number>> = {};
    const headers = (table[index] ?? []).map((cell) => normalizeHeader(cell ?? ""));
    for (const field of Object.keys(ALIASES) as Field[]) {
      for (const alias of ALIASES[field]) {
        const col = headers.findIndex((header, i) => header === alias && !Object.values(columns).includes(i));
        if (col >= 0) { columns[field] = col; break; }
      }
    }
    if ((columns.um !== undefined || columns.umIn !== undefined) && Object.keys(columns).length >= 4) return { headerRow: index, columns };
  }
  throw new Error("Não encontrei o cabeçalho da planilha (coluna “Unidade Metálica”).");
}

export function parseDefect(value: string): DefectRef | null {
  const raw = value.replace(/\s+/g, "").toUpperCase();
  if (!raw) return null;
  const match = /^([A-Z]{2}[A-Z0-9])(\d{3})([A-Z]?\d?)$/.exec(raw);
  if (!match) return { raw, equipment: "", code: "", name: "Código não reconhecido", complement: "", known: false };
  const [, equipment, code, complement] = match;
  const name = DEFECT_BY_CODE.get(Number(code));
  return { raw, equipment, code, name: name ?? `Defeito ${code} (fora do catálogo)`, complement, known: Boolean(name) };
}

export function decodeReason(value: string): ReasonRef | null {
  const code = value.replace(/\s+/g, "");
  if (!code) return null;
  const name = /^\d+$/.test(code) ? DEFECT_BY_CODE.get(Number(code)) : undefined;
  return { code, name: name ?? `Motivo ${code} (fora do catálogo)`, known: Boolean(name) };
}

export const responsibleName = (code: string) => RESPONSIBLE_NAMES[code] ?? code;

function groupShifts(coils: Coil[]): ShiftGroup[] {
  const groups = new Map<string, ShiftGroup>();
  for (const coil of coils) {
    const key = shiftKey(coil);
    const group = groups.get(key) ?? { key, date: coil.date, shiftNumber: coil.shiftNumber, shift: coil.shift, crew: coil.crew, coils: 0, deviated: 0 };
    group.coils += 1;
    if (coil.deviated) group.deviated += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => toIso(b.date).localeCompare(toIso(a.date)) || a.key.localeCompare(b.key));
}

export const shiftKey = (coil: Pick<Coil, "date" | "shiftNumber" | "crew">) => `${coil.date}|${coil.shiftNumber}|${coil.crew}`;

const toIso = (date: string) => {
  const [day, month, year] = date.split("/");
  return year ? `${year}-${month}-${day}` : date;
};

/* ---------- Indicadores (somente bobinas desviadas) ---------- */

export type Rank = { key: string; label: string; detail?: string; value: number };

export function summarize(coils: Coil[]) {
  const deviated = coils.filter((coil) => coil.deviated);
  const rank = (values: Array<{ key: string; label: string; detail?: string } | null>): Rank[] => {
    const counts = new Map<string, Rank>();
    for (const value of values) {
      if (!value) continue;
      const current = counts.get(value.key) ?? { ...value, value: 0 };
      current.value += 1;
      counts.set(value.key, current);
    }
    return [...counts.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  };
  const defectItem = (defect: DefectRef | null) => defect && defect.code
    ? { key: defect.code, label: `${defect.code} · ${defect.name}`, detail: defect.known ? undefined : "fora do catálogo" }
    : null;

  return {
    total: coils.length,
    deviated: deviated.length,
    quality: deviated.filter((coil) => coil.kinds.includes("qualidade")).length,
    flow: deviated.filter((coil) => coil.kinds.includes("fluxo")).length,
    destinationOnly: deviated.filter((coil) => coil.kinds.length === 1 && coil.kinds[0] === "destino").length,
    noPlanned: coils.filter((coil) => !coil.deviated && !coil.plannedDestination).length,
    qualityResp: rank(deviated.map((coil) => coil.qualityResp ? { key: coil.qualityResp, label: responsibleName(coil.qualityResp) } : null)),
    qualityReason: rank(deviated.map((coil) => coil.qualityReason ? { key: coil.qualityReason.code, label: `${coil.qualityReason.code} · ${coil.qualityReason.name}` } : null)),
    flowReason: rank(deviated.map((coil) => coil.flowReason ? { key: coil.flowReason.code, label: `${coil.flowReason.code} · ${coil.flowReason.name}`, detail: coil.flowResp ? `resp. ${responsibleName(coil.flowResp)}` : undefined } : null)),
    routes: rank(deviated.map((coil) => coil.actualDestination ? { key: `${coil.plannedDestination}>${coil.actualDestination}`, label: `${coil.plannedDestination || "—"} → ${coil.actualDestination}` } : null)),
    defectsByPosition: [0, 1, 2].map((position) => rank(deviated.map((coil) => defectItem(coil.defects[position])))),
    defectOrigins: rank(deviated.flatMap((coil) => coil.defects.map((defect) => defect?.equipment ? { key: defect.equipment, label: defect.equipment } : null))),
  };
}

export type ProductionSummary = ReturnType<typeof summarize>;

function fieldLabel(field: Field): string {
  return ({
    planned: "Destino Previsto", actual: "Destino Realizado", qualityResp: "Desvio Qualidade – Resp.",
    qualityReason: "Desvio Qualidade – Motivo", defect1: "Defeito 1",
  } as Partial<Record<Field, string>>)[field] ?? field;
}
