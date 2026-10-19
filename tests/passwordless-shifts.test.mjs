import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("a entrada por turno não usa PIN nem senha", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /signInAnonymously\(/);
  assert.match(page, /auth\.updateUser\(/);
  assert.match(page, /Selecionar turno/);
  assert.doesNotMatch(page, /signInWithPassword|accessCode|access-code|type="password"/);
});

test("o banco deriva o responsável pelo turno sem contas com PIN", async () => {
  const migration = await readFile(new URL("../supabase/remove_pin_shift_access.sql", import.meta.url), "utf8");
  const schema = await readFile(new URL("../supabase/imq_schema.sql", import.meta.url), "utf8");
  for (const sql of [migration, schema]) {
    assert.match(sql, /v_shift := p_report->>'shift'/);
    assert.match(sql, /v_reporter := case v_shift/);
    assert.match(sql, /security invoker/);
    assert.match(sql, /auth\.uid\(\)/);
    assert.doesNotMatch(sql, /select account\.shift/);
  }
});
