import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { strToU8, zipSync } from "fflate";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true }, logLevel: "error" });
after(async () => { await vite.close(); });

const HEADER = ["Unidade Metálica - Entrada", "Unidade Metálica - Saída", "Equip. - Prod.", "Aço", "Espessura - Saída", "Largura - Saída", "Destino - Previs.", "Destino - Realiz.", "Desvio Fluxo - Resp.", "Desvio Fluxo - Motivo", "Desvio Qualidade - Resp.", "Desvio Qualidade - Motivo", "Defeito - 1", "Defeito - 2", "Defeito - 3", "Data Refer.", "Letra", "Turno"];
const ROWS = [
  ["100001A1000B 01", "100001A1000B 02", "RB1", "P430F", "1.8", "1270", "LE1", "LE1", "", "", "", "", "RB1053A", "LB3091A", "", "25/10/2026 02:00:00", "A", "1"],
  ["100002A1000B 01", "100002A1000B 02", "RB1", "P430F", "1.8", "1270", "LE1", "RB1", "RB1", "077", "RB1", "077", "RB1077C4", "RB1089C4", "LB3029C4", "25/10/2026 05:08:00", "A", "1"],
  ["100003A1000B 01", "100003A1000B 02", "RB1", "P441A", "2", "1040", "EMP", "TL5", "", "", "", "", "RB1150B2", "", "", "24/10/2026 03:00:00", "D", "1"],
  ["100004A1000B 01", "100004A1000B 02", "RB1", "P441A", "2", "1040", "", "EMP", "", "", "", "", "RB1127A2", "", "", "24/10/2026 04:00:00", "D", "1"],
];

// Gera um .xlsx mínimo (strings compartilhadas + uma aba), como o Excel exporta.
function buildXlsx(rows) {
  const strings = [...new Set(rows.flat())];
  const col = (i) => String.fromCharCode(65 + (i % 26)).padStart(i >= 26 ? 2 : 1, "A");
  const sheet = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${col(c)}${r + 1}" t="s"><v>${strings.indexOf(value)}</v></c>`).join("")}</row>`).join("");
  const esc = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return zipSync({
    "xl/workbook.xml": strToU8('<workbook xmlns:r="r"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId5"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId5" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8(`<sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheet}</sheetData></worksheet>`),
  });
}

test("lê o .xlsx e considera apenas as bobinas desviadas", async () => {
  const { parseXlsx } = await vite.ssrLoadModule("/lib/spreadsheet-reader.ts");
  const { analyzeTable, summarize } = await vite.ssrLoadModule("/lib/production-analysis.ts");
  const result = analyzeTable(parseXlsx(buildXlsx([HEADER, ...ROWS])), "relatorio.xlsx");
  const summary = summarize(result.coils);

  assert.equal(summary.total, 4);
  assert.equal(summary.deviated, 2);
  assert.equal(summary.quality, 1);
  assert.equal(summary.noPlanned, 1);
  assert.deepEqual(result.coils.find((coil) => coil.um === "100002A1000B 02").kinds, ["qualidade", "fluxo", "destino"]);
  assert.deepEqual(summary.qualityResp.map((item) => [item.key, item.value]), [["RB1", 1]]);
  assert.equal(summary.qualityReason[0].label, "077 · Queimado");
  assert.equal(summary.defectsByPosition[0][0].label, "077 · Queimado");
  assert.deepEqual(summary.routes.map((item) => item.label), ["EMP → TL5", "LE1 → RB1"]);
  assert.equal(result.shifts.length, 2);
  assert.equal(result.coils[0].shift, "TN");
});

test("decodifica o código do defeito: equipamento + código + complemento", async () => {
  const { parseDefect, decodeReason } = await vite.ssrLoadModule("/lib/production-analysis.ts");

  assert.deepEqual(parseDefect("RB1127A2"), { raw: "RB1127A2", equipment: "RB1", code: "127", name: "Decapagem Deficiente – Mancha de Ácido", complement: "A2", known: true });
  assert.equal(parseDefect("LTQ329C4").known, false);
  assert.equal(parseDefect(""), null);
  assert.equal(decodeReason("007").name, "Arranhão");
});

test("planilha sem as colunas do relatório é recusada com mensagem clara", async () => {
  const { parseCsv } = await vite.ssrLoadModule("/lib/spreadsheet-reader.ts");
  const { analyzeTable } = await vite.ssrLoadModule("/lib/production-analysis.ts");

  assert.throws(() => analyzeTable(parseCsv("Nome;Idade\nAna;30"), "x.csv"), /cabeçalho/);
  const csv = parseCsv(`${HEADER.join(";")}\n${ROWS[1].join(";")}`);
  assert.equal(analyzeTable(csv, "x.csv").coils[0].deviated, true);
});
