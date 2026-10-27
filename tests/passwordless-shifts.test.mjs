import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("a entrada é feita só pelo turno, sem PIN ou senha", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /signInWithPassword/);
  assert.doesNotMatch(page, /access-code|InputOTP/);
  assert.match(page, /signInAnonymously\(\{ options: \{ data: \{ shift \} \} \}\)/);
  assert.match(page, /updateUser\(\{ data: \{ shift \} \}\)/);
});

test("a migração sem PIN grava e lê pelo turno da sessão sem apagar dados", async () => {
  const sql = await readFile(new URL("../supabase/remove_pin_shift_access.sql", import.meta.url), "utf8");

  assert.match(sql, /create or replace function public\.imq_current_shift\(\)/);
  assert.match(sql, /v_shift := public\.imq_current_shift\(\);/);
  assert.match(sql, /shift = \(select public\.imq_current_shift\(\)\)/);
  assert.doesNotMatch(sql, /^\s*(drop table|delete from|truncate)/im);
});

test("o modo local funciona sem Supabase e guarda dados no navegador", async () => {
  const client = await readFile(new URL("../lib/imq-supabase.ts", import.meta.url), "utf8");
  const store = await readFile(new URL("../lib/local-store.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(client, /export const LOCAL_MODE = true;/);
  assert.match(client, /if \(LOCAL_MODE\) return saveReportLocally\(input\);/);
  assert.match(store, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(page, /if \(LOCAL_MODE\) \{\s+setAuthUser\(saveLocalShiftUser\(shift\)\);/);
});
