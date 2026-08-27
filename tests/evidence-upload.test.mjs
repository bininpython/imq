import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("evidências são copiadas imediatamente e o upload usa o blob durável", async () => {
  const client = await readFile(new URL("../lib/imq-supabase.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(client, /export async function snapshotEvidenceFile/);
  assert.match(client, /const buffer = await file\.arrayBuffer\(\)/);
  assert.match(client, /\.upload\(storagePath, file\.blob,/);
  assert.doesNotMatch(client, /fileToUploadBlob/);
  assert.match(page, /Promise\.all\(incoming\.map\(snapshotEvidenceFile\)\)/);
  assert.match(page, /disabled=\{readingEvidence\}/);
});

test("a identidade visível do sistema é IMIQ - Inspeção", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const pdf = await readFile(new URL("../lib/imq-supabase.ts", import.meta.url), "utf8");

  assert.match(layout, /IMIQ - Inspeção/);
  assert.match(page, /IMIQ/);
  assert.match(pdf, /IMIQ \| RELATORIO DE INSPECAO/);
  assert.doesNotMatch(`${layout}\n${page}\n${pdf}`, /\bIMQ\b/);
});
