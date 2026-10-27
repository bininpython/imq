"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Download, FileSpreadsheet, Loader2, Search, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadBlob } from "@/lib/imq-supabase";
import { deleteLocalImport, listLocalImports, saveLocalImport } from "@/lib/local-store";
import {
  analyzeTable, responsibleName, shiftKey, summarize,
  type Coil, type DefectRef, type ProductionImport, type Rank, type ShiftGroup,
} from "@/lib/production-analysis";
import { readSpreadsheet } from "@/lib/spreadsheet-reader";

type DefectFilter = { position: number; code: string; label: string } | null;

const pad = (value: number) => String(value).padStart(2, "0");
const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const formatDateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const shiftLabel = (group: Pick<ShiftGroup, "date" | "shiftNumber" | "shift" | "crew">) =>
  `${group.date || "Sem data"} · ${group.shift ?? `Turno ${group.shiftNumber || "?"}`}${group.crew ? ` · Turma ${group.crew}` : ""}`;

export function ProductionView() {
  const [imports, setImports] = useState<ProductionImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shift, setShift] = useState("todos");
  const [query, setQuery] = useState("");
  const [defectFilter, setDefectFilter] = useState<DefectFilter>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void listLocalImports<ProductionImport>()
      .then((items) => {
        if (!active) return;
        const sorted = items.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
        setImports(sorted);
        setSelectedId(sorted[0]?.id ?? null);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar as planilhas."))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selected = imports.find((item) => item.id === selectedId) ?? null;
  const scoped = useMemo(() => (selected?.coils ?? []).filter((coil) => shift === "todos" || shiftKey(coil) === shift), [selected, shift]);
  const summary = useMemo(() => summarize(scoped), [scoped]);
  const rows = useMemo(() => {
    const term = query.trim().toUpperCase();
    return scoped.filter((coil) => coil.deviated
      && (!term || `${coil.um} ${coil.umIn} ${coil.steel} ${coil.actualDestination} ${coil.qualityResp}`.toUpperCase().includes(term))
      && (!defectFilter || coil.defects[defectFilter.position]?.code === defectFilter.code));
  }, [scoped, query, defectFilter]);

  async function handleFiles(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setReading(true);
    try {
      const analysis = analyzeTable(await readSpreadsheet(file), file.name);
      await saveLocalImport(analysis);
      setImports((items) => [analysis, ...items]);
      setSelectedId(analysis.id);
      setShift(analysis.shifts.length === 1 ? analysis.shifts[0].key : "todos");
      setDefectFilter(null);
      setQuery("");
      const deviated = analysis.coils.filter((coil) => coil.deviated).length;
      toast.success(deviated
        ? `${deviated} bobina${deviated > 1 ? "s desviadas identificadas" : " desviada identificada"} em ${analysis.coils.length}.`
        : `Nenhum desvio nas ${analysis.coils.length} bobinas do relatório.`);
      analysis.warnings.forEach((warning) => toast.warning(warning));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeImport(id: string) {
    try {
      await deleteLocalImport(id);
      const remaining = imports.filter((item) => item.id !== id);
      setImports(remaining);
      if (selectedId === id) { setSelectedId(remaining[0]?.id ?? null); setShift("todos"); setDefectFilter(null); }
      toast.success("Planilha removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover a planilha.");
    }
  }

  function exportCsv() {
    if (!selected) return;
    const header = ["Data", "Turno", "Turma", "UM", "Equip. produção", "Aço", "Espessura", "Largura", "Destino previsto", "Destino realizado", "Tipo de desvio", "Desvio fluxo resp.", "Desvio fluxo motivo", "Desvio qualidade resp.", "Desvio qualidade motivo", "Defeito 1", "Defeito 2", "Defeito 3"];
    const defectText = (defect: DefectRef | null) => (defect ? `${defect.raw} - ${defect.name}` : "");
    const lines = rows.map((coil) => [
      coil.date, coil.shift ?? coil.shiftNumber, coil.crew, coil.um, coil.equipment, coil.steel, coil.thickness, coil.width,
      coil.plannedDestination, coil.actualDestination, coil.kinds.join(" + "),
      coil.flowResp, coil.flowReason ? `${coil.flowReason.code} - ${coil.flowReason.name}` : "",
      coil.qualityResp, coil.qualityReason ? `${coil.qualityReason.code} - ${coil.qualityReason.name}` : "",
      defectText(coil.defects[0]), defectText(coil.defects[1]), defectText(coil.defects[2]),
    ]);
    const csv = [header, ...lines].map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
    downloadBlob(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }), `IMIQ_desvios_${selected.fileName.replace(/\.[^.]+$/, "")}.csv`);
    toast.success("Planilha de desvios exportada.");
  }

  const filterDefect = (position: number) => (item: Rank) =>
    setDefectFilter((current) => current?.position === position && current.code === item.key ? null : { position, code: item.key, label: `Defeito ${position + 1}: ${item.label}` });

  return <section className="view">
    <header className="page-head">
      <div>
        <p className="kicker"><i />Inteligência de produção</p>
        <h2>Desvios da produção</h2>
        <p className="lede">Envie o Relatório de Produção do turno. O sistema separa só as bobinas desviadas e organiza responsáveis, motivos e defeitos.</p>
      </div>
    </header>

    <button
      type="button"
      className="upload-drop"
      data-dragging={dragging || undefined}
      disabled={reading}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void handleFiles(event.dataTransfer.files); }}
    >
      <span className="upload-drop-icon">{reading ? <Loader2 className="spin" /> : <UploadCloud />}</span>
      <span className="upload-drop-text">
        <strong>{reading ? "Analisando a planilha…" : "Enviar Relatório de Produção"}</strong>
        <small>Arraste o arquivo aqui ou clique para escolher · .xlsx ou .csv</small>
      </span>
      <span className="upload-drop-cta">Escolher arquivo <ChevronRight /></span>
    </button>
    <input ref={inputRef} type="file" hidden accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => void handleFiles(event.target.files)} />

    {loading ? <div className="panel"><div className="skeleton-list"><span /><span /></div></div>
      : !imports.length ? <div className="panel"><div className="empty"><FileSpreadsheet /><strong>Nenhuma planilha enviada</strong><span>O primeiro relatório analisado aparecerá aqui.</span></div></div>
      : <>
        <div className="import-strip" role="list" aria-label="Planilhas enviadas">
          {imports.map((item) => {
            const deviated = item.coils.filter((coil) => coil.deviated).length;
            return <div role="listitem" key={item.id} className="import-chip" data-active={item.id === selectedId || undefined}>
              <button type="button" onClick={() => { setSelectedId(item.id); setShift(item.shifts.length === 1 ? item.shifts[0].key : "todos"); setDefectFilter(null); }}>
                <FileSpreadsheet />
                <span><strong>{item.fileName}</strong><small>{formatDateTime(item.importedAt)} · {item.coils.length} bobinas · <b data-tone={deviated ? "signal" : undefined}>{deviated} desviada{deviated === 1 ? "" : "s"}</b></small></span>
              </button>
              <Button variant="ghost" size="icon" aria-label={`Remover ${item.fileName}`} onClick={() => void removeImport(item.id)}><Trash2 /></Button>
            </div>;
          })}
        </div>

        {selected && <>
          <div className="panel toolbar">
            <Select value={shift} onValueChange={(value) => { setShift(value); setDefectFilter(null); }}>
              <SelectTrigger aria-label="Turno do relatório" className="shift-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os turnos ({selected.shifts.length})</SelectItem>
                {selected.shifts.map((group) => <SelectItem key={group.key} value={group.key}>{shiftLabel(group)} — {group.deviated}/{group.coils} desviadas</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="search-field"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar UM, aço, destino ou responsável…" aria-label="Buscar bobina desviada" /></div>
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download /> Exportar desvios</Button>
          </div>

          <div className="metrics">
            <div className="metric"><span className="metric-label">Bobinas no relatório</span><strong className="metric-value">{pad(summary.total)}</strong><small>{shift === "todos" ? `${selected.shifts.length} turno${selected.shifts.length > 1 ? "s" : ""}` : "neste turno"}</small></div>
            <div className="metric" data-tone="signal"><span className="metric-label">Bobinas desviadas</span><strong className="metric-value">{pad(summary.deviated)}</strong><small>{percent(summary.deviated, summary.total)}% do total</small></div>
            <div className="metric" data-tone="violet"><span className="metric-label">Desvio de qualidade</span><strong className="metric-value">{pad(summary.quality)}</strong><small>com responsável/motivo</small></div>
            <div className="metric"><span className="metric-label">Desvio de fluxo</span><strong className="metric-value">{pad(summary.flow)}</strong><small>{summary.destinationOnly} só com destino alterado</small></div>
          </div>
          {summary.noPlanned > 0 && <p className="inline-note"><AlertTriangle /> {summary.noPlanned} bobina{summary.noPlanned > 1 ? "s" : ""} sem destino previsto e sem motivo de desvio {summary.noPlanned > 1 ? "não entram" : "não entra"} no cálculo.</p>}

          {summary.deviated === 0 ? <div className="panel all-clear-panel"><CheckCircle2 /><div><strong>Nenhuma bobina desviada</strong><span>Todas as {summary.total} bobinas seguiram o destino previsto, sem desvio de fluxo ou de qualidade.</span></div></div> : <>
            <div className="bento top">
              <RankPanel highlight title="Desvio de Qualidade — Responsável" subtitle="Equipamento responsável pelo desvio" data={summary.qualityResp} empty="Nenhum desvio de qualidade com responsável." />
              <RankPanel highlight title="Desvio de Qualidade — Motivo" subtitle="Código do motivo decodificado pelo catálogo" data={summary.qualityReason} empty="Nenhum desvio de qualidade com motivo." />
            </div>

            <section className="panel">
              <header className="panel-head"><div><h3>Defeitos das bobinas desviadas</h3><p>Toque num defeito para filtrar a tabela</p></div>{defectFilter && <button type="button" className="filter-pill" onClick={() => setDefectFilter(null)}>{defectFilter.label}<X /></button>}</header>
              <div className="defect-columns">
                {summary.defectsByPosition.map((data, position) => <div key={position}>
                  <h4><span>Defeito</span> {position + 1}</h4>
                  <Ranks data={data.slice(0, 6)} empty="Sem registro." active={defectFilter?.position === position ? defectFilter.code : undefined} onPick={filterDefect(position)} />
                </div>)}
              </div>
            </section>

            <div className="bento three">
              <RankPanel title="Desvio de Fluxo — Motivo" subtitle="Motivo e responsável pelo fluxo" data={summary.flowReason.slice(0, 6)} empty="Nenhum desvio de fluxo registrado." />
              <RankPanel title="Rota do desvio" subtitle="Destino previsto → realizado" data={summary.routes.slice(0, 6)} empty="Sem alteração de destino." />
              <RankPanel title="Origem dos defeitos" subtitle="Equipamento no código do defeito" data={summary.defectOrigins.slice(0, 6)} empty="Sem defeitos registrados." />
            </div>

            <section className="panel">
              <header className="panel-head"><div><h3>Bobinas desviadas</h3><p>{rows.length} de {summary.deviated} · bobinas sem desvio não aparecem</p></div></header>
              <div className="panel-body flush coil-table">
                {rows.length ? <Table><TableHeader><TableRow>
                  <TableHead>Unidade metálica</TableHead><TableHead>Equip.</TableHead><TableHead>Aço</TableHead><TableHead>Esp. × Larg.</TableHead>
                  <TableHead>Destino previsto → realizado</TableHead><TableHead>Desvio de fluxo</TableHead><TableHead className="col-highlight">Desvio de qualidade</TableHead>
                  <TableHead>Defeito 1</TableHead><TableHead>Defeito 2</TableHead><TableHead>Defeito 3</TableHead>
                </TableRow></TableHeader>
                  <TableBody>{rows.map((coil) => <CoilRow key={`${coil.um}-${coil.date}-${coil.endTime}`} coil={coil} />)}</TableBody></Table>
                  : <p className="panel-empty">Nenhuma bobina desviada para os filtros escolhidos.</p>}
              </div>
            </section>
          </>}
        </>}
      </>}
  </section>;
}

function CoilRow({ coil }: { coil: Coil }) {
  return <TableRow>
    <TableCell><strong className="mono">{coil.um}</strong><small className="cell-sub">{coil.date} {coil.endTime} · {coil.shift ?? `T${coil.shiftNumber}`}{coil.crew ? ` · ${coil.crew}` : ""}</small></TableCell>
    <TableCell><span className="tag">{coil.equipment || "—"}</span></TableCell>
    <TableCell className="mono">{coil.steel || "—"}</TableCell>
    <TableCell className="mono">{coil.thickness || "—"} × {coil.width || "—"}</TableCell>
    <TableCell><span className="route-cell" data-changed={coil.plannedDestination !== coil.actualDestination || undefined}><b>{coil.plannedDestination || "—"}</b><ChevronRight /><b>{coil.actualDestination || "—"}</b></span>
      <span className="kind-tags">{coil.kinds.map((kind) => <i key={kind} data-kind={kind}>{kind}</i>)}</span></TableCell>
    <TableCell>{coil.flowReason || coil.flowResp ? <Reason resp={coil.flowResp} code={coil.flowReason?.code} name={coil.flowReason?.name} /> : <span className="muted">—</span>}</TableCell>
    <TableCell className="col-highlight">{coil.qualityReason || coil.qualityResp ? <Reason strong resp={coil.qualityResp} code={coil.qualityReason?.code} name={coil.qualityReason?.name} /> : <span className="muted">—</span>}</TableCell>
    {coil.defects.map((defect, index) => <TableCell key={index}>{defect ? <DefectChip defect={defect} /> : <span className="muted">—</span>}</TableCell>)}
  </TableRow>;
}

function Reason({ resp, code, name, strong }: { resp: string; code?: string; name?: string; strong?: boolean }) {
  return <span className="reason" data-strong={strong || undefined}>
    {resp && <span className="reason-resp">{responsibleName(resp)}</span>}
    {code && <span className="reason-code"><span className="defect-code">{code}</span><small>{name}</small></span>}
  </span>;
}

function DefectChip({ defect }: { defect: DefectRef }) {
  return <span className="defect-chip" data-unknown={!defect.known || undefined} title={defect.raw}>
    <span className="defect-chip-top"><b>{defect.equipment}</b><span className="defect-code">{defect.code || "?"}</span>{defect.complement && <em>{defect.complement}</em>}</span>
    <small>{defect.name}</small>
  </span>;
}

function RankPanel({ title, subtitle, data, empty, highlight }: { title: string; subtitle: string; data: Rank[]; empty: string; highlight?: boolean }) {
  return <section className="panel" data-highlight={highlight || undefined}>
    <header className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div>{highlight && <span className="count-pill" data-tone="signal">Destaque</span>}</header>
    <div className="panel-body"><Ranks data={data} empty={empty} /></div>
  </section>;
}

function Ranks({ data, empty, active, onPick }: { data: Rank[]; empty: string; active?: string; onPick?: (item: Rank) => void }) {
  if (!data.length) return <p className="panel-empty">{empty}</p>;
  const max = Math.max(1, ...data.map((item) => item.value));
  return <ol className="ranks">{data.map((item, index) => {
    const body = <>
      <span className="rank-pos">{pad(index + 1)}</span>
      <div className="rank-main"><div><strong>{item.label}{item.detail && <small> · {item.detail}</small>}</strong><b>{item.value}</b></div><div className="rank-track"><span style={{ "--w": `${(item.value / max) * 100}%` } as React.CSSProperties} /></div></div>
    </>;
    return <li key={item.key} data-lead={index === 0 || undefined} data-active={active === item.key || undefined}>
      {onPick ? <button type="button" className="rank-button" onClick={() => onPick(item)}>{body}</button> : body}
    </li>;
  })}</ol>;
}
