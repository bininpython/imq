"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, BookOpen, Camera, Check, CheckCircle2, ChevronRight,
  ClipboardPlus, Command as CommandIcon, Download, Eye, FileSpreadsheet, FileText, LayoutDashboard,
  Loader2, Mail, Menu, Moon, Paperclip, Plus, Printer, RefreshCcw, Search, ShieldCheck, Sun, Video, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { DEFECTS, DEFECT_GROUPS, EQUIPMENT_CODES, EQUIPMENT_CODE_BY_NAME } from "@/lib/inspection-codes";
import {
  downloadBlob, downloadEvidence, downloadReportPdf, fetchReports, getEvidenceContentType, saveReport,
  snapshotEvidenceFile, supabase, type Deviation, type EvidenceFile, type StoredReport,
} from "@/lib/imq-supabase";

const AREAS = [
  { code: "ITIF", name: "Recozimento e Decapagem", equipment: ["RB1", "RB4", "LE1"] },
  { code: "ITIQ", name: "Preparação e Acabamento", equipment: ["RB3", "PB3", "PB1"] },
  { code: "ITIL", name: "Laminação", equipment: ["LB1", "LB3", "LB4", "EB1", "EB2"] },
  { code: "ITIA", name: "Linhas e Tratamentos", equipment: ["TL1", "TL5", "TL6", "TL9", "TT1", "AP2", "EB3"] },
] as const;

const ALL_EQUIPMENT = AREAS.flatMap((area) => area.equipment.map((equipment) => `${area.code}:${equipment}`));
const DEVIATION_DESTINATIONS = [...EQUIPMENT_CODES, { code: "N/I", equipment: "EB3" }]
  .sort((a, b) => a.equipment.localeCompare(b.equipment));

const SHIFT_ACCOUNTS = {
  TN: { label: "Inspetor Líder TN", period: "Noite" },
  TM: { label: "Inspetor Líder TM", period: "Manhã" },
  TT: { label: "Inspetor Líder TT", period: "Tarde" },
} as const;
type ShiftCode = keyof typeof SHIFT_ACCOUNTS;
const SHIFT_CODES = Object.keys(SHIFT_ACCOUNTS) as ShiftCode[];
type AuthUser = { id: string; shift: ShiftCode; label: string };

type View = "dashboard" | "new" | "reports" | "library";
const VIEWS: Record<View, { index: string; label: string; title: string; icon: React.ReactNode }> = {
  dashboard: { index: "01", label: "Visão geral", title: "Visão geral", icon: <LayoutDashboard /> },
  new: { index: "02", label: "Novo fechamento", title: "Novo fechamento de turno", icon: <ClipboardPlus /> },
  reports: { index: "03", label: "Relatórios", title: "Relatórios de turno", icon: <FileText /> },
  library: { index: "04", label: "Biblioteca de códigos", title: "Biblioteca de códigos", icon: <BookOpen /> },
};

const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));
const formatDateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const pad = (value: number) => String(value).padStart(2, "0");

/* ---------- Tema claro/escuro (persistido, sem flash) ---------- */

type Theme = "light" | "dark";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", callback);
  return () => { observer.disconnect(); media.removeEventListener("change", callback); };
}

function readTheme(): Theme {
  const stored = document.documentElement.dataset.theme;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("imiq-theme", theme); } catch { /* armazenamento indisponível */ }
}

function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as Theme);
  const toggle = useCallback(() => applyTheme(readTheme() === "dark" ? "light" : "dark"), []);
  return [theme, toggle] as const;
}

/** Troca de tela com a View Transitions API quando disponível. */
function withViewTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced) { update(); return; }
  doc.startViewTransition(() => flushSync(update));
}

export default function Home() {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [choosingShift, setChoosingShift] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [search, setSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState("todos");
  const [selectedReport, setSelectedReport] = useState<StoredReport | null>(null);
  const [reportDate, setReportDate] = useState(today());
  const [inspectorName, setInspectorName] = useState("");
  const [generalObservation, setGeneralObservation] = useState("");
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [deviations, setDeviations] = useState<Deviation[]>([]);
  const [dialogEquipment, setDialogEquipment] = useState<{ area: string; equipment: string } | null>(null);
  const [form, setForm] = useState({ um: "", divertedToEquipment: "", defectCode: "", observation: "" });
  const [formFiles, setFormFiles] = useState<EvidenceFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Recarrega o histórico quando a sessão ou o turno mudam.
  const authKey = authUser ? `${authUser.id}:${authUser.shift}` : null;

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthUser(getShiftUser(data.session?.user));
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(getShiftUser(session?.user));
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function loadReports() {
    setLoadingReports(true);
    try {
      setReports(await fetchReports());
    } catch (error) {
      setReports([]);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os relatórios.");
    } finally {
      setLoadingReports(false);
    }
  }

  useEffect(() => {
    if (!authKey) return;
    const task = window.setTimeout(() => { void loadReports(); }, 0);
    return () => window.clearTimeout(task);
  }, [authKey]);

  /** Entrada sem PIN: sessão anônima do Supabase marcada com o turno escolhido. */
  async function enterShift(shift: ShiftCode) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      // Reaproveita a sessão do dispositivo e só troca o turno.
      const { error } = await supabase.auth.updateUser({ data: { shift } });
      if (error) throw error;
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      setAuthUser(getShiftUser(data.user ?? undefined));
    } else {
      const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { shift } } });
      if (error) throw error;
      setAuthUser(getShiftUser(data.user ?? undefined));
    }
    resetDraft();
    setChoosingShift(false);
    setView("dashboard");
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const reviewedCount = reviewed.length;
  const completion = Math.round((reviewedCount / ALL_EQUIPMENT.length) * 100);
  const filteredReports = useMemo(() => reports.filter((report) => {
    const haystack = `${report.reporter} ${report.inspectorName || ""} ${report.shift} ${report.reportDate} ${report.payload.deviations.map((d) => `${d.area} ${d.equipment} ${d.equipmentCode || ""} ${d.divertedToEquipment || ""} ${d.divertedToEquipmentCode || ""} ${d.um} ${d.defectCode || ""} ${d.defectName || d.reason}`).join(" ")}`.toLowerCase();
    return (shiftFilter === "todos" || report.shift === shiftFilter) && haystack.includes(search.toLowerCase());
  }), [reports, search, shiftFilter]);

  function go(next: View) {
    setMobileNav(false);
    if (next === view) return;
    withViewTransition(() => setView(next));
    window.scrollTo({ top: 0 });
  }

  function openDeviation(area: string, equipment: string) {
    setDialogEquipment({ area, equipment });
    setForm({ um: "", divertedToEquipment: "", defectCode: "", observation: "" });
    setFormFiles([]);
  }

  function markNoDeviation(area: string, equipment: string) {
    const key = `${area}:${equipment}`;
    setReviewed((items) => items.includes(key) ? items : [...items, key]);
    toast.success(`${equipment} revisado sem desvio.`);
  }

  function addDeviation() {
    if (!dialogEquipment || !/^[A-Z0-9]{8,20}$/i.test(form.um.trim())) {
      toast.error("Informe uma UM válida, sem espaços."); return;
    }
    const destination = DEVIATION_DESTINATIONS.find((item) => item.equipment === form.divertedToEquipment);
    if (!destination) { toast.error("Selecione o equipamento de destino do desvio."); return; }
    const selectedDefect = DEFECTS.find((item) => item.code === form.defectCode);
    if (!selectedDefect) { toast.error("Selecione o código do defeito."); return; }
    const deviation: Deviation = {
      id: crypto.randomUUID(), area: dialogEquipment.area, equipment: dialogEquipment.equipment,
      equipmentCode: EQUIPMENT_CODE_BY_NAME[dialogEquipment.equipment] || "N/I",
      divertedToEquipment: destination.equipment, divertedToEquipmentCode: destination.code,
      defectCode: selectedDefect.code, defectName: selectedDefect.name,
      um: form.um.trim().toUpperCase(), reason: selectedDefect.name, observation: form.observation.trim(), files: formFiles,
    };
    setDeviations((items) => [...items, deviation]);
    const key = `${dialogEquipment.area}:${dialogEquipment.equipment}`;
    setReviewed((items) => items.includes(key) ? items : [...items, key]);
    setDialogEquipment(null);
    toast.success("Desvio incluído no fechamento.");
  }

  function removeDeviation(id: string) {
    const target = deviations.find((item) => item.id === id);
    setDeviations((items) => items.filter((item) => item.id !== id));
    if (target && !deviations.some((item) => item.id !== id && item.area === target.area && item.equipment === target.equipment)) {
      setReviewed((items) => items.filter((key) => key !== `${target.area}:${target.equipment}`));
    }
  }

  async function finalizeReport() {
    if (!authUser) { toast.error("Sua sessão expirou. Entre novamente."); return; }
    const normalizedInspectorName = inspectorName.trim();
    if (normalizedInspectorName.length < 2) { toast.error("Informe o nome do inspetor responsável pela inspeção."); return; }
    if (reviewedCount < ALL_EQUIPMENT.length) { toast.error(`Revise os ${ALL_EQUIPMENT.length - reviewedCount} equipamentos restantes.`); return; }
    setSaving(true);
    const reportId = crypto.randomUUID();
    try {
      await saveReport({ id: reportId, reportDate, shift: authUser.shift, reporter: authUser.label, inspectorName: normalizedInspectorName, reviewed, generalObservation, deviations });
      setReports(await fetchReports());
      resetDraft(); go("reports");
      toast.success("Fechamento finalizado e salvo com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar o relatório.");
    } finally { setSaving(false); }
  }

  function resetDraft() {
    setReportDate(today()); setInspectorName(""); setGeneralObservation(""); setReviewed([]); setDeviations([]);
  }

  function exportCsv(report: StoredReport) {
    const header = ["Data", "Turno", "Responsável do turno", "Inspetor", "Gerência", "Cód. passagem", "Equipamento de passagem", "Cód. destino", "Equipamento de destino", "UM", "Cód. Defeito", "Defeito", "Observação", "Evidências"];
    const rows = report.payload.deviations.length ? report.payload.deviations.map((d) => [
      report.reportDate, report.shift, report.reporter, report.inspectorName || report.reporter, d.area, d.equipmentCode || EQUIPMENT_CODE_BY_NAME[d.equipment] || "N/I", d.equipment,
      d.divertedToEquipmentCode || "—", d.divertedToEquipment || "Não informado", d.um, d.defectCode || "—", d.defectName || d.reason, d.observation,
      (d.attachments || []).map((a) => a.name).join(" | "),
    ]) : [[report.reportDate, report.shift, report.reporter, report.inspectorName || report.reporter, "", "", "", "", "", "", "", "Sem desvios", report.payload.generalObservation || "", ""]];
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
    downloadBlob(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }), `IMIQ_${report.reportDate}_${report.shift}.csv`);
    toast.success("Planilha exportada.");
  }

  async function printPdf(report: StoredReport) {
    try {
      await downloadReportPdf(report);
      toast.success("PDF gerado e baixado com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    }
  }
  async function handleDownloadEvidence(attachment: NonNullable<Deviation["attachments"]>[number]) {
    try {
      await downloadEvidence(attachment);
      toast.success("Evidência baixada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível baixar a evidência.");
    }
  }
  function emailReport(report: StoredReport) {
    const subject = encodeURIComponent(`IMIQ | Fechamento ${report.shift} - ${formatDate(report.reportDate)}`);
    const body = encodeURIComponent(`Relatório de turno IMIQ\n\nData: ${formatDate(report.reportDate)}\nTurno: ${report.shift}\nResponsável do turno: ${report.reporter}\nInspetor: ${report.inspectorName || report.reporter}\nDesvios: ${report.deviationCount}\n\nO PDF pode ser gerado no botão Exportar PDF e anexado a esta mensagem.`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function runCommand(action: () => void) {
    setPaletteOpen(false);
    action();
  }

  if (!authReady) return <AuthLoading />;
  if (!authUser || choosingShift) return <><Toaster theme={theme} position="top-right" /><AuthScreen theme={theme} onToggleTheme={toggleTheme} current={authUser?.shift} onEnter={enterShift} onCancel={authUser ? () => setChoosingShift(false) : undefined} /></>;

  const shiftPeriod = SHIFT_ACCOUNTS[authUser.shift].period;

  return (
    <div className="shell">
      <Toaster theme={theme} position="top-right" />
      <aside className="rail" data-open={mobileNav} aria-label="Menu lateral">
        <div className="rail-brand"><Logo /><div><strong>IMIQ</strong><span>Inspeção · Laminação a Frio</span></div></div>
        <nav className="rail-nav" aria-label="Navegação principal">
          {(Object.keys(VIEWS) as View[]).map((key) => (
            <button key={key} type="button" data-active={view === key} aria-current={view === key ? "page" : undefined} onClick={() => go(key)}>
              <span className="rail-index">{VIEWS[key].index}</span>{VIEWS[key].icon}<span>{VIEWS[key].label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="rail-command" onClick={() => setPaletteOpen(true)}>
          <CommandIcon /><span>Comandos</span><kbd>Ctrl K</kbd>
        </button>
        <div className="rail-foot">
          <div className="rail-secure"><ShieldCheck /><span>Acesso por turno · dados com RLS</span></div>
          <div className="rail-profile">
            <div className="rail-avatar">{authUser.shift}</div>
            <div><strong>{authUser.label}</strong><span>Turno da {shiftPeriod}</span></div>
            <Button variant="ghost" size="icon" title="Trocar turno" aria-label="Trocar turno" onClick={() => setChoosingShift(true)}><RefreshCcw /></Button>
          </div>
          <p className="rail-credit">developed by Abner Lucas</p>
        </div>
      </aside>
      {mobileNav && <button type="button" className="scrim" aria-label="Fechar menu" onClick={() => setMobileNav(false)} />}

      <main className="stage">
        <header className="topbar">
          <Button variant="ghost" size="icon" className="topbar-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Abrir menu"><Menu /></Button>
          <div className="crumbs"><span>IMIQ</span><i>/</i><strong>{VIEWS[view].title}</strong></div>
          <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
            <Search /><span>Buscar telas, ações ou defeitos…</span><kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-tools">
            <time className="topbar-date" dateTime={today()}>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date())}</time>
            <span className="shift-chip"><i />{authUser.shift}</span>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"} title="Alternar tema">{theme === "dark" ? <Sun /> : <Moon />}</Button>
          </div>
        </header>

        <div className="content">
          {view === "dashboard" && <Dashboard reports={reports} loading={loadingReports} onNew={() => go("new")} onReports={() => go("reports")} onOpen={setSelectedReport} />}
          {view === "new" && (
            <section className="view">
              <PageHead kicker="Rotina operacional" title="Fechamento da inspeção" lede="Revise cada equipamento da linha e registre as unidades metálicas desviadas.">
                <Button variant="outline" onClick={() => go("dashboard")}><ArrowLeft /> Voltar</Button>
              </PageHead>

              <div className="panel meta-grid">
                <div className="field"><Label htmlFor="report-date">Data do fechamento</Label><Input id="report-date" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></div>
                <div className="field"><Label htmlFor="report-shift">Turno</Label><Input id="report-shift" value={`${authUser.shift} · Turno da ${shiftPeriod}`} readOnly /></div>
                <div className="field"><Label htmlFor="reporter">Responsável do turno</Label><Input id="reporter" value={authUser.label} readOnly /></div>
                <div className="field"><Label htmlFor="inspector-name">Nome do inspetor *</Label><Input id="inspector-name" value={inspectorName} onChange={(event) => setInspectorName(event.target.value)} placeholder="Digite o nome do inspetor" maxLength={120} /></div>
              </div>

              <LineStrip reviewed={reviewed} deviations={deviations} completion={completion} onMarkAll={() => setReviewed([...ALL_EQUIPMENT])} />

              <div className="areas">
                {AREAS.map((area, areaIndex) => {
                  const areaReviewed = area.equipment.filter((eq) => reviewed.includes(`${area.code}:${eq}`)).length;
                  const areaDeviations = deviations.filter((d) => d.area === area.code).length;
                  return <section key={area.code} className="panel area" aria-labelledby={`area-${area.code}`}>
                    <header className="area-head">
                      <span className="area-index">{pad(areaIndex + 1)}</span>
                      <div><h3 id={`area-${area.code}`}>{area.code}</h3><p>{area.name}</p></div>
                      {areaDeviations > 0 && <span className="signal-tag"><AlertTriangle /> {areaDeviations} desvio{areaDeviations > 1 ? "s" : ""}</span>}
                      <span className="area-count" data-complete={areaReviewed === area.equipment.length}>{areaReviewed}/{area.equipment.length}</span>
                    </header>
                    <div className="tiles">
                      {area.equipment.map((equipment) => {
                        const key = `${area.code}:${equipment}`; const done = reviewed.includes(key);
                        const count = deviations.filter((d) => d.area === area.code && d.equipment === equipment).length;
                        const state = count ? "deviation" : done ? "ok" : "pending";
                        return <article className="tile" data-state={state} key={equipment}>
                          <div className="tile-top"><span className="tile-code">CÓD. {EQUIPMENT_CODE_BY_NAME[equipment] || "N/I"}</span><span className="tile-status"><i />{count ? `${count} desvio${count > 1 ? "s" : ""}` : done ? "Revisado" : "Pendente"}</span></div>
                          <strong className="tile-name">{equipment}</strong>
                          <div className="tile-actions">
                            <Button size="sm" variant="outline" onClick={() => markNoDeviation(area.code, equipment)} disabled={done && !count}><Check /> Sem desvio</Button>
                            <Button size="sm" className="btn-signal" onClick={() => openDeviation(area.code, equipment)}><Plus /> Desvio</Button>
                          </div>
                        </article>;
                      })}
                    </div>
                  </section>;
                })}
              </div>

              {deviations.length > 0 && <Panel title="Desvios registrados" subtitle="Itens que entrarão neste fechamento" aside={<span className="count-pill" data-tone="signal">{pad(deviations.length)}</span>} flush>
                <Table><TableHeader><TableRow><TableHead>Gerência</TableHead><TableHead>Passagem</TableHead><TableHead>Destino</TableHead><TableHead>UM</TableHead><TableHead>Defeito</TableHead><TableHead>Evidências</TableHead><TableHead><span className="sr-only">Ações</span></TableHead></TableRow></TableHeader>
                  <TableBody>{deviations.map((item) => <TableRow key={item.id}>
                    <TableCell><span className="tag">{item.area}</span></TableCell>
                    <TableCell className="strong">{item.equipment} <small className="mono muted">{item.equipmentCode || EQUIPMENT_CODE_BY_NAME[item.equipment] || "N/I"}</small></TableCell>
                    <TableCell className="strong">{item.divertedToEquipment || "Não informado"} <small className="mono muted">{item.divertedToEquipmentCode || "—"}</small></TableCell>
                    <TableCell className="mono">{item.um}</TableCell>
                    <TableCell><span className="defect-code">{item.defectCode || "—"}</span> {item.defectName || item.reason}</TableCell>
                    <TableCell>{item.files.length ? <span className="file-count"><Paperclip /> {item.files.length}</span> : <span className="muted">—</span>}</TableCell>
                    <TableCell className="cell-end"><Button variant="ghost" size="icon" aria-label="Remover desvio" onClick={() => removeDeviation(item.id)}><X /></Button></TableCell>
                  </TableRow>)}</TableBody></Table>
              </Panel>}

              <div className="panel field note-field"><Label htmlFor="general-note">Observação geral do turno</Label><Textarea id="general-note" placeholder="Registre informações relevantes para o próximo turno…" value={generalObservation} onChange={(e) => setGeneralObservation(e.target.value)} /></div>

              <div className="finish-bar" data-ready={completion === 100}>
                <div className="finish-meter"><span style={{ "--value": completion } as React.CSSProperties}><b>{completion}</b>%</span></div>
                <div><strong>{completion === 100 ? "Pronto para finalizar" : "Revisão em andamento"}</strong><span>{completion === 100 ? "O relatório ficará disponível no histórico para exportação." : `Faltam ${ALL_EQUIPMENT.length - reviewedCount} equipamentos para liberar o fechamento.`}</span></div>
                <Button size="lg" className="btn-primary" onClick={finalizeReport} disabled={saving || completion < 100}>{saving ? "Salvando evidências…" : "Finalizar fechamento"}<ChevronRight /></Button>
              </div>
            </section>
          )}
          {view === "reports" && <ReportsView reports={filteredReports} loading={loadingReports} search={search} setSearch={setSearch} shiftFilter={shiftFilter} setShiftFilter={setShiftFilter} onView={setSelectedReport} onCsv={exportCsv} onPdf={printPdf} onEmail={emailReport} onNew={() => go("new")} />}
          {view === "library" && <CodeLibrary query={libraryQuery} setQuery={setLibraryQuery} />}
        </div>
        <footer className="stage-foot"><span>IMIQ - Inspeção</span><span>developed by Abner Lucas</span></footer>
      </main>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen} title="Comandos do IMIQ" description="Navegue pelas telas, execute ações ou encontre um código de defeito." className="palette">
        <CommandInput placeholder="Digite um comando, tela ou código de defeito…" />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          <CommandGroup heading="Navegação">
            {(Object.keys(VIEWS) as View[]).map((key) => <CommandItem key={key} value={`ir ${VIEWS[key].label}`} onSelect={() => runCommand(() => go(key))}>{VIEWS[key].icon}<span>{VIEWS[key].label}</span><CommandShortcut>{VIEWS[key].index}</CommandShortcut></CommandItem>)}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Ações">
            <CommandItem value="alternar tema claro escuro" onSelect={() => runCommand(toggleTheme)}>{theme === "dark" ? <Sun /> : <Moon />}<span>Alternar para tema {theme === "dark" ? "claro" : "escuro"}</span></CommandItem>
            <CommandItem value="atualizar relatórios recarregar" onSelect={() => runCommand(() => void loadReports())}><FileText /><span>Atualizar relatórios</span></CommandItem>
            <CommandItem value="trocar turno tn tm tt" onSelect={() => runCommand(() => setChoosingShift(true))}><RefreshCcw /><span>Trocar turno</span></CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Códigos de defeito">
            {DEFECTS.map((item) => <CommandItem key={item.code} value={`defeito ${item.code} ${item.name} ${item.group}`} onSelect={() => runCommand(() => { setLibraryQuery(item.code); go("library"); })}><span className="defect-code">{item.code}</span><span>{item.name}</span><CommandShortcut>{item.group}</CommandShortcut></CommandItem>)}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <DeviationDialog key={dialogEquipment ? `${dialogEquipment.area}:${dialogEquipment.equipment}` : "closed"} open={!!dialogEquipment} target={dialogEquipment} form={form} setForm={setForm} files={formFiles} setFiles={setFormFiles} fileInputRef={fileInputRef} onClose={() => setDialogEquipment(null)} onAdd={addDeviation} />
      <ReportDialog report={selectedReport} onClose={() => setSelectedReport(null)} onPdf={printPdf} onCsv={exportCsv} onEmail={emailReport} onEvidence={handleDownloadEvidence} />
      {selectedReport && <PrintReport report={selectedReport} />}
    </div>
  );
}

/* ---------- Identidade ---------- */

function Logo({ size = 34 }: { size?: number }) {
  return <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" className="logo-bg" />
    <rect x="8" y="9" width="3.2" height="14" rx="1.6" className="logo-bar" />
    <rect x="14.4" y="13" width="3.2" height="10" rx="1.6" className="logo-bar" />
    <rect x="20.8" y="9" width="3.2" height="14" rx="1.6" className="logo-violet" />
    <circle cx="22.4" cy="5.6" r="2" className="logo-orange" />
  </svg>;
}

function AuthLoading() {
  return <main className="boot"><Logo size={44} /><div className="boot-bar"><span /></div><strong>Carregando ambiente seguro…</strong></main>;
}

function getShiftUser(user: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | undefined): AuthUser | null {
  if (!user) return null;
  const shift = user.user_metadata?.shift ?? user.app_metadata?.shift;
  if (shift !== "TN" && shift !== "TM" && shift !== "TT") return null;
  return { id: user.id, shift, label: SHIFT_ACCOUNTS[shift].label };
}

function AuthScreen({ theme, onToggleTheme, current, onEnter, onCancel }: { theme: Theme; onToggleTheme: () => void; current?: ShiftCode; onEnter: (shift: ShiftCode) => Promise<void>; onCancel?: () => void }) {
  const [entering, setEntering] = useState<ShiftCode | null>(null);
  const [message, setMessage] = useState("");

  async function enter(shift: ShiftCode) {
    setEntering(shift);
    setMessage("");
    try {
      await onEnter(shift);
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage(/anonymous/i.test(text)
        ? "O acesso sem senha ainda não foi liberado no Supabase. Ative “Anonymous Sign-Ins” no painel do projeto."
        : "Não foi possível entrar no turno. Verifique a conexão e tente novamente.");
    } finally {
      setEntering(null);
    }
  }

  return <main className="auth">
    <section className="auth-art" aria-hidden="true">
      <div className="auth-grid" />
      <div className="auth-scan" />
      <div className="auth-art-top"><Logo /><span>IMIQ · Inspeção</span></div>
      <div className="auth-word"><span>IM</span><span>IQ</span></div>
      <p className="auth-tagline">Fechamento de turno da<br />Laminação a Frio Central.</p>
      <dl className="auth-figures">
        <div><dt>Gerências</dt><dd>04</dd></div>
        <div><dt>Equipamentos</dt><dd>{ALL_EQUIPMENT.length}</dd></div>
        <div><dt>Códigos de defeito</dt><dd>{DEFECTS.length}</dd></div>
      </dl>
    </section>

    <section className="auth-panel">
      <div className="auth-panel-top">
        <div className="auth-mobile-brand"><Logo size={28} /><strong>IMIQ</strong></div>
        <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
      </div>
      <div className="auth-form">
        <p className="kicker"><i />{current ? "Trocar turno" : "Acesso por turno"}</p>
        <h1>{current ? "Para qual turno?" : "Selecione seu turno"}</h1>
        <p className="lede">Toque no seu turno para entrar. Não é preciso senha.</p>

        <div className="shift-picker shift-entry" role="group" aria-label="Turno de trabalho">
          {SHIFT_CODES.map((shiftCode) => <button type="button" key={shiftCode} data-current={current === shiftCode || undefined} aria-busy={entering === shiftCode} disabled={entering !== null} onClick={() => void enter(shiftCode)}>
            <strong>{shiftCode}</strong><span>Turno da {SHIFT_ACCOUNTS[shiftCode].period}</span>
            <em>{entering === shiftCode ? <Loader2 className="spin" /> : <ArrowUpRight />}</em>
          </button>)}
        </div>
        {message && <p className="auth-message" role="alert"><AlertTriangle /> {message}</p>}
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={entering !== null}><ArrowLeft /> Voltar</Button>}
      </div>
      <footer className="auth-foot"><span><ShieldCheck /> Dados protegidos pelo Supabase e políticas RLS</span><span>developed by Abner Lucas</span></footer>
    </section>
  </main>;
}

/* ---------- Blocos de layout ---------- */

function PageHead({ kicker, title, lede, children }: { kicker: string; title: string; lede: string; children?: React.ReactNode }) {
  return <header className="page-head"><div><p className="kicker"><i />{kicker}</p><h2>{title}</h2><p className="lede">{lede}</p></div>{children && <div className="page-head-actions">{children}</div>}</header>;
}

function Panel({ title, subtitle, aside, flush, className, children }: { title: string; subtitle?: string; aside?: React.ReactNode; flush?: boolean; className?: string; children: React.ReactNode }) {
  return <section className={`panel ${className || ""}`}>
    <header className="panel-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{aside}</header>
    <div className={flush ? "panel-body flush" : "panel-body"}>{children}</div>
  </section>;
}

function LineStrip({ reviewed, deviations, completion, onMarkAll }: { reviewed: string[]; deviations: Deviation[]; completion: number; onMarkAll: () => void }) {
  return <div className="line-strip">
    <div className="line-strip-head">
      <div className="line-strip-value"><b>{completion}</b><span>%</span></div>
      <div className="line-strip-text"><strong>{reviewed.length} de {ALL_EQUIPMENT.length} equipamentos revisados</strong><span>{deviations.length ? `${deviations.length} desvio${deviations.length > 1 ? "s" : ""} registrado${deviations.length > 1 ? "s" : ""}` : "Nenhum desvio registrado"}</span></div>
      <Button variant="outline" size="sm" onClick={onMarkAll} disabled={reviewed.length === ALL_EQUIPMENT.length}><Check /> Marcar restantes sem desvio</Button>
    </div>
    <div className="segments" role="progressbar" aria-label="Progresso da inspeção" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}>
      {AREAS.map((area) => <div className="segment-group" key={area.code} style={{ flexGrow: area.equipment.length }}>
        <div className="segment-row">{area.equipment.map((equipment) => {
          const key = `${area.code}:${equipment}`;
          const state = deviations.some((d) => d.area === area.code && d.equipment === equipment) ? "deviation" : reviewed.includes(key) ? "ok" : "pending";
          return <span key={equipment} data-state={state} title={`${equipment} · ${state === "deviation" ? "com desvio" : state === "ok" ? "revisado" : "pendente"}`} />;
        })}</div>
        <small>{area.code}</small>
      </div>)}
    </div>
  </div>;
}

/* ---------- Visão geral ---------- */

function Dashboard({ reports, loading, onNew, onReports, onOpen }: { reports: StoredReport[]; loading: boolean; onNew: () => void; onReports: () => void; onOpen: (report: StoredReport) => void }) {
  const todayReports = reports.filter((r) => r.reportDate === today()).length;
  const recent = reports.slice(0, 5);
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6);
  const weekReports = reports.filter((report) => report.reportDate >= cutoff.toISOString().slice(0, 10));
  const weekDeviations = weekReports.flatMap((report) => report.payload.deviations.map((deviation) => ({ ...deviation, shift: report.shift })));
  const passageRanking = rankCounts(weekDeviations.map((item) => item.equipment)).slice(0, 6);
  const destinationRanking = rankCounts(weekDeviations.map((item) => item.divertedToEquipment || "")).slice(0, 6);
  const defectRanking = rankCounts(weekDeviations.map((item) => `${item.defectCode || "S/C"} · ${item.defectName || item.reason || "Não classificado"}`)).slice(0, 6);
  const shiftRanking = (["TN", "TM", "TT"] as const).map((name) => ({ name, value: weekDeviations.filter((item) => item.shift === name).length }));
  const affectedEquipment = new Set(weekDeviations.map((item) => item.divertedToEquipment).filter(Boolean)).size;
  const leadingShift = [...shiftRanking].sort((a, b) => b.value - a.value)[0];
  const dash = loading ? "—" : null;

  return <section className="view">
    <header className="hero">
      <div>
        <p className="kicker"><i />Laminação a Frio Central</p>
        <h2 className="display">Controle de fechamento<br />de turno<span className="display-dot">.</span></h2>
        <p className="lede">Inspeções, desvios e evidências operacionais consolidados em um só lugar.</p>
      </div>
      <div className="hero-actions">
        <Button size="lg" className="btn-primary" onClick={onNew}><ClipboardPlus /> Iniciar fechamento</Button>
        <Button size="lg" variant="outline" onClick={onReports}>Ver relatórios <ArrowUpRight /></Button>
      </div>
    </header>

    <div className="metrics">
      <Metric label="Fechamentos hoje" value={dash ?? pad(todayReports)} note="TN, TM e TT" tone="violet" />
      <Metric label="Defeitos na semana" value={dash ?? pad(weekDeviations.length)} note="Últimos 7 dias" tone="signal" />
      <Metric label="Destinos com desvios" value={dash ?? pad(affectedEquipment)} note="Na semana atual" />
      <Metric label="Turno com mais desvios" value={weekDeviations.length ? leadingShift.name : "—"} note={weekDeviations.length ? `${leadingShift.value} registros na semana` : "Sem registros"} />
    </div>

    <div className="bento">
      <RankPanel title="Detecção por passagem" subtitle="Onde a UM foi inspecionada · 7 dias" data={passageRanking} empty="Nenhuma detecção registrada na semana." />
      <RankPanel title="Desvios por destino" subtitle="Para onde as UMs foram desviadas" data={destinationRanking} empty="Nenhum destino de desvio registrado na semana." />
      <RankPanel title="Principais defeitos" subtitle="Códigos com maior recorrência" data={defectRanking} empty="Nenhum defeito classificado na semana." />
      <Panel title="Distribuição por turno" subtitle="TN, TM e TT · últimos 7 dias">
        <ShiftColumns data={shiftRanking} />
      </Panel>
    </div>

    <div className="split">
      <Panel title="Fechamentos recentes" subtitle="Últimos registros consolidados" aside={<Button variant="ghost" size="sm" onClick={onReports}>Ver todos <ChevronRight /></Button>} flush>
        {loading ? <div className="skeleton-list">{[0, 1, 2].map((item) => <span key={item} />)}</div>
          : recent.length ? <ul className="recent-list">{recent.map((report) => <li key={report.id}><button type="button" onClick={() => onOpen(report)}>
            <span className="recent-shift">{report.shift}</span>
            <span className="recent-main"><strong>{formatDate(report.reportDate)} · {report.inspectorName || report.reporter}</strong><small>{report.deviationCount ? `${report.deviationCount} desvio${report.deviationCount > 1 ? "s" : ""}` : "Turno sem desvios"}</small></span>
            <Status alert={report.deviationCount > 0} />
            <ChevronRight className="recent-arrow" />
          </button></li>)}</ul>
          : <Empty icon={<FileText />} title="Nenhum fechamento ainda" text="O primeiro relatório aparecerá aqui."><Button variant="outline" onClick={onNew}>Criar primeiro fechamento</Button></Empty>}
      </Panel>
      <Panel title="Cobertura operacional" subtitle="Estrutura inspecionada por gerência" flush>
        <ul className="coverage">{AREAS.map((area, index) => <li key={area.code}>
          <span className="coverage-index">{pad(index + 1)}</span>
          <div><strong>{area.code} <span>{area.name}</span></strong><small>{area.equipment.join(" · ")}</small></div>
          <b>{pad(area.equipment.length)}</b>
        </li>)}</ul>
      </Panel>
    </div>
  </section>;
}

function rankCounts(values: string[]) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "violet" | "signal" }) {
  return <div className="metric" data-tone={tone}><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><small>{note}</small></div>;
}

function RankPanel({ title, subtitle, data, empty }: { title: string; subtitle: string; data: Array<{ name: string; value: number }>; empty: string }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return <Panel title={title} subtitle={subtitle}>
    {data.some((item) => item.value > 0) ? <ol className="ranks">{data.map((item, index) => <li key={item.name} data-lead={index === 0 || undefined}>
      <span className="rank-pos">{pad(index + 1)}</span>
      <div className="rank-main"><div><strong>{item.name}</strong><b>{item.value}</b></div><div className="rank-track"><span style={{ "--w": `${(item.value / max) * 100}%` } as React.CSSProperties} /></div></div>
    </li>)}</ol> : <p className="panel-empty">{empty}</p>}
  </Panel>;
}

function ShiftColumns({ data }: { data: Array<{ name: string; value: number }> }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <p className="panel-empty">Nenhum desvio registrado por turno.</p>;
  return <div className="shift-columns">{data.map((item) => <div key={item.name} data-lead={item.value === max || undefined}>
    <b>{item.value}</b>
    <div className="shift-column-track"><span style={{ "--h": `${(item.value / max) * 100}%` } as React.CSSProperties} /></div>
    <strong>{item.name}</strong><small>{Math.round((item.value / total) * 100)}%</small>
  </div>)}</div>;
}

function Status({ alert }: { alert: boolean }) {
  return <span className="status" data-tone={alert ? "alert" : "ok"}><i />{alert ? "Com desvios" : "Conforme"}</span>;
}

function Empty({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return <div className="empty">{icon}<strong>{title}</strong><span>{text}</span>{children}</div>;
}

/* ---------- Relatórios ---------- */

function ReportsView({ reports, loading, search, setSearch, shiftFilter, setShiftFilter, onView, onCsv, onPdf, onEmail, onNew }: {
  reports: StoredReport[]; loading: boolean; search: string; setSearch: (v: string) => void; shiftFilter: string; setShiftFilter: (v: string) => void;
  onView: (r: StoredReport) => void; onCsv: (r: StoredReport) => void; onPdf: (r: StoredReport) => void; onEmail: (r: StoredReport) => void; onNew: () => void;
}) {
  return <section className="view">
    <PageHead kicker="Histórico consolidado" title="Relatórios de turno" lede="Consulte, compartilhe e exporte todos os fechamentos."><Button className="btn-primary" onClick={onNew}><Plus /> Novo fechamento</Button></PageHead>
    <section className="panel">
      <div className="toolbar">
        <div className="search-field"><Search /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por UM, equipamento ou responsável…" aria-label="Buscar relatórios" /></div>
        <Select value={shiftFilter} onValueChange={setShiftFilter}><SelectTrigger aria-label="Filtrar por turno"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os turnos</SelectItem><SelectItem value="TN">Turno TN</SelectItem><SelectItem value="TM">Turno TM</SelectItem><SelectItem value="TT">Turno TT</SelectItem></SelectContent></Select>
        <span className="toolbar-count">{reports.length} resultado{reports.length === 1 ? "" : "s"}</span>
      </div>
      {loading ? <div className="skeleton-list">{[0, 1, 2, 3].map((item) => <span key={item} />)}</div>
        : reports.length ? <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Turno</TableHead><TableHead>Responsável</TableHead><TableHead>Inspetor</TableHead><TableHead>Desvios</TableHead><TableHead>Status</TableHead><TableHead>Gerado em</TableHead><TableHead className="cell-end">Ações</TableHead></TableRow></TableHeader>
          <TableBody>{reports.map((report) => <TableRow key={report.id}>
            <TableCell className="strong mono">{formatDate(report.reportDate)}</TableCell>
            <TableCell><span className="tag">{report.shift}</span></TableCell>
            <TableCell>{report.reporter}</TableCell>
            <TableCell>{report.inspectorName || "—"}</TableCell>
            <TableCell className="mono">{pad(report.deviationCount)}</TableCell>
            <TableCell><Status alert={report.deviationCount > 0} /></TableCell>
            <TableCell className="muted mono">{formatDateTime(report.createdAt)}</TableCell>
            <TableCell className="cell-end"><div className="row-actions">
              <Button variant="ghost" size="icon" title="Visualizar" aria-label="Visualizar relatório" onClick={() => onView(report)}><Eye /></Button>
              <Button variant="ghost" size="icon" title="Exportar PDF" aria-label="Exportar PDF" onClick={() => onPdf(report)}><Printer /></Button>
              <Button variant="ghost" size="icon" title="Planilha" aria-label="Exportar planilha" onClick={() => onCsv(report)}><FileSpreadsheet /></Button>
              <Button variant="ghost" size="icon" title="E-mail" aria-label="Enviar por e-mail" onClick={() => onEmail(report)}><Mail /></Button>
            </div></TableCell>
          </TableRow>)}</TableBody></Table>
          : <Empty icon={<Search />} title="Nenhum relatório encontrado" text="Ajuste os filtros ou crie um novo fechamento." />}
    </section>
  </section>;
}

/* ---------- Biblioteca ---------- */

function CodeLibrary({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  const [group, setGroup] = useState("todos");
  const normalizedQuery = normalizeSearch(query);
  const defects = DEFECTS.filter((item) => (group === "todos" || item.group === group) && normalizeSearch(`${item.code} ${item.name} ${item.group}`).includes(normalizedQuery));
  const equipment = [...EQUIPMENT_CODES, { code: "N/I", equipment: "EB3" }].filter((item) => normalizeSearch(`${item.code} ${item.equipment}`).includes(normalizedQuery));
  return <section className="view">
    <PageHead kicker="Padrão de classificação" title="Biblioteca de códigos" lede="Consulta oficial de equipamentos e defeitos para o registro padronizado das ocorrências.">
      <div className="head-figure"><b>{DEFECTS.length}</b><span>códigos de<br />defeito</span></div>
    </PageHead>
    <div className="panel toolbar">
      <div className="search-field"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar código, defeito ou equipamento…" aria-label="Buscar na biblioteca" /></div>
      <Select value={group} onValueChange={setGroup}><SelectTrigger aria-label="Filtrar por grupo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os grupos</SelectItem>{DEFECT_GROUPS.map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select>
    </div>
    <div className="library">
      <Panel title="Equipamentos" subtitle="Códigos conforme referência operacional" aside={<span className="count-pill">{pad(equipment.length)}</span>} flush>
        <Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Equipamento</TableHead><TableHead>Gerência</TableHead></TableRow></TableHeader>
          <TableBody>{equipment.map((item) => <TableRow key={`${item.code}-${item.equipment}`}><TableCell><span className="equip-code" data-missing={item.code === "N/I" || undefined}>{item.code}</span></TableCell><TableCell className="strong">{item.equipment}</TableCell><TableCell className="muted">{findArea(item.equipment)}</TableCell></TableRow>)}</TableBody></Table>
        {equipment.some((item) => item.code === "N/I") && <p className="panel-note"><AlertTriangle /> O código do EB3 não consta na referência e foi mantido como “N/I”.</p>}
      </Panel>
      <Panel title="Defeitos em produtos inoxidáveis" subtitle="Código oficial, descrição e grupo operacional" aside={<span className="count-pill">{pad(defects.length)}</span>} flush className="library-defects">
        {defects.length ? <Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descrição do defeito</TableHead><TableHead>Grupo</TableHead></TableRow></TableHeader>
          <TableBody>{defects.map((item) => <TableRow key={item.code}><TableCell><span className="defect-code">{item.code}</span></TableCell><TableCell className="strong">{item.name}</TableCell><TableCell><span className="tag">{item.group}</span></TableCell></TableRow>)}</TableBody></Table>
          : <p className="panel-empty">Nenhum código encontrado para os filtros informados.</p>}
      </Panel>
    </div>
  </section>;
}

function findArea(equipment: string) {
  return AREAS.find((area) => area.equipment.some((item) => item === equipment))?.code || "Referência externa";
}

/* ---------- Diálogos ---------- */

function DeviationDialog({ open, target, form, setForm, files, setFiles, fileInputRef, onClose, onAdd }: {
  open: boolean; target: { area: string; equipment: string } | null; form: { um: string; divertedToEquipment: string; defectCode: string; observation: string };
  setForm: React.Dispatch<React.SetStateAction<{ um: string; divertedToEquipment: string; defectCode: string; observation: string }>>; files: EvidenceFile[]; setFiles: React.Dispatch<React.SetStateAction<EvidenceFile[]>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>; onClose: () => void; onAdd: () => void;
}) {
  const selectedDefect = DEFECTS.find((item) => item.code === form.defectCode);
  const [defectQuery, setDefectQuery] = useState("");
  const [defectSearchOpen, setDefectSearchOpen] = useState(false);
  const [highlightedDefect, setHighlightedDefect] = useState(0);
  const [readingEvidence, setReadingEvidence] = useState(false);
  const normalizedDefectQuery = normalizeSearch(defectQuery);
  const filteredDefects = DEFECTS.filter((item) => normalizeSearch(`${item.code} ${item.name} ${item.group}`).includes(normalizedDefectQuery));

  async function addEvidence(selected: FileList | null) {
    const incoming = Array.from(selected || []);
    const invalidType = incoming.find((file) => !getEvidenceContentType(file));
    const oversized = incoming.find((file) => file.size > 50 * 1024 * 1024);
    if (invalidType) {
      toast.error(`${invalidType.name} não é uma imagem ou vídeo compatível. Use JPG, PNG, WEBP, HEIC, MP4 ou MOV.`);
      return;
    }
    if (oversized) {
      toast.error(`${oversized.name} excede o limite de 50 MB.`);
      return;
    }
    setReadingEvidence(true);
    try {
      const durableFiles = await Promise.all(incoming.map(snapshotEvidenceFile));
      setFiles((current) => {
        const next = [...current, ...durableFiles].slice(0, 6);
        if (current.length + durableFiles.length > 6) toast.info("Foram mantidas as 6 primeiras evidências do desvio.");
        return next;
      });
      if (durableFiles.length) toast.success(`${durableFiles.length} evidência${durableFiles.length > 1 ? "s prontas" : " pronta"} para envio.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a evidência selecionada.");
    } finally {
      setReadingEvidence(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function selectDefect(code: string) {
    const defect = DEFECTS.find((item) => item.code === code);
    if (!defect) return;
    setForm((current) => ({ ...current, defectCode: defect.code }));
    setDefectQuery(`${defect.code} · ${defect.name}`);
    setDefectSearchOpen(false);
  }

  function handleDefectKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setDefectSearchOpen(true);
      setHighlightedDefect((index) => Math.min(index + 1, Math.max(0, filteredDefects.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedDefect((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && defectSearchOpen && filteredDefects[highlightedDefect]) {
      event.preventDefault();
      selectDefect(filteredDefects[highlightedDefect].code);
    } else if (event.key === "Escape") {
      setDefectSearchOpen(false);
    }
  }

  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="sheet deviation-sheet">
    <DialogHeader className="sheet-head">
      <p className="kicker" data-tone="signal"><i />Registrar desvio</p>
      <DialogTitle>{target?.area} · {target?.equipment}</DialogTitle>
      <DialogDescription>A UM passou pelo equipamento abaixo. Informe o destino do desvio e classifique o defeito.</DialogDescription>
    </DialogHeader>
    <div className="sheet-body">
      <div className="route">
        <div><span>Passagem</span><strong>{target?.equipment || "—"}</strong><small>CÓD. {target ? EQUIPMENT_CODE_BY_NAME[target.equipment] || "N/I" : "—"}</small></div>
        <ChevronRight />
        <div data-empty={!form.divertedToEquipment || undefined}><span>Destino</span><strong>{form.divertedToEquipment || "A definir"}</strong><small>CÓD. {DEVIATION_DESTINATIONS.find((item) => item.equipment === form.divertedToEquipment)?.code || "—"}</small></div>
      </div>

      <div className="field"><Label htmlFor="um">Unidade Metálica (UM) *</Label><Input id="um" className="mono input-um" placeholder="Ex.: 671606B2000B" maxLength={20} value={form.um} onChange={(e) => setForm((f) => ({ ...f, um: e.target.value.replace(/\s/g, "").toUpperCase() }))} /><small>Use letras e números, sem espaços.</small></div>

      <div className="field"><Label>Equipamento de destino do desvio *</Label><Select value={form.divertedToEquipment} onValueChange={(value) => setForm((current) => ({ ...current, divertedToEquipment: value }))}><SelectTrigger className="select-full"><SelectValue placeholder="Selecione o equipamento de destino" /></SelectTrigger><SelectContent>{DEVIATION_DESTINATIONS.map((item) => <SelectItem value={item.equipment} key={`${item.code}-${item.equipment}`}><span className="destination-option"><b>{item.code}</b><span>{item.equipment}</span></span></SelectItem>)}</SelectContent></Select><small>Indique para qual equipamento a UM foi efetivamente desviada.</small></div>

      <div className="field"><Label htmlFor="defect-search">Código ou descrição do defeito *</Label>
        <div className="defect-search"><Search aria-hidden="true" /><Input id="defect-search" role="combobox" aria-autocomplete="list" aria-expanded={defectSearchOpen} aria-controls="defect-results" autoComplete="off" placeholder="Ex.: 07, arranhão, oxidação…" value={defectQuery} onFocus={() => setDefectSearchOpen(true)} onChange={(event) => { setDefectQuery(event.target.value); setDefectSearchOpen(true); setHighlightedDefect(0); if (form.defectCode) setForm((current) => ({ ...current, defectCode: "" })); }} onKeyDown={handleDefectKeyDown} />{defectQuery && <button type="button" className="defect-search-clear" aria-label="Limpar pesquisa de defeito" onClick={() => { setDefectQuery(""); setDefectSearchOpen(true); setHighlightedDefect(0); setForm((current) => ({ ...current, defectCode: "" })); }}><X /></button>}</div>
        {defectSearchOpen && <div id="defect-results" className="defect-results" role="listbox" aria-label="Resultados da pesquisa de defeitos">{filteredDefects.length ? filteredDefects.map((item, index) => <button type="button" role="option" aria-selected={form.defectCode === item.code} data-highlighted={index === highlightedDefect || undefined} className="defect-result" key={item.code} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setHighlightedDefect(index)} onClick={() => selectDefect(item.code)}><span className="defect-code">{item.code}</span><span><strong>{item.name}</strong><small>{item.group}</small></span><Check /></button>) : <div className="panel-empty">Nenhum defeito encontrado. Tente outro código ou termo.</div>}</div>}
        {selectedDefect && <div className="selected-defect"><span className="defect-code">{selectedDefect.code}</span><div><strong>{selectedDefect.name}</strong><small>{selectedDefect.group}</small></div><CheckCircle2 /></div>}
        <small>Pesquise pelo código numérico ou por qualquer palavra da descrição.</small>
      </div>

      <div className="field"><Label htmlFor="observation">Observação</Label><Textarea id="observation" placeholder="Descreva condição, localização do defeito e ação tomada…" value={form.observation} onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))} /></div>

      <div className="field"><Label>Evidências</Label><input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(event) => void addEvidence(event.target.files)} />
        <button className="dropzone" type="button" disabled={readingEvidence} onClick={() => fileInputRef.current?.click()}><span className="dropzone-icons"><Camera /><Video /></span><strong>{readingEvidence ? "Preparando evidências…" : "Adicionar foto ou vídeo"}</strong><small>Até 6 arquivos · máximo de 50 MB cada</small></button>
        {files.length > 0 && <ul className="file-list">{files.map((file, index) => <li key={`${file.name}-${index}`}><Paperclip /><span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span><Button variant="ghost" size="icon" aria-label={`Remover ${file.name}`} onClick={() => setFiles((items) => items.filter((_, i) => i !== index))}><X /></Button></li>)}</ul>}
      </div>
    </div>
    <DialogFooter className="sheet-foot"><Button variant="outline" onClick={onClose} disabled={readingEvidence}>Cancelar</Button><Button className="btn-signal" onClick={onAdd} disabled={readingEvidence}><Plus /> Adicionar desvio</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function ReportDialog({ report, onClose, onPdf, onCsv, onEmail, onEvidence }: { report: StoredReport | null; onClose: () => void; onPdf: (r: StoredReport) => void; onCsv: (r: StoredReport) => void; onEmail: (r: StoredReport) => void; onEvidence: (attachment: NonNullable<Deviation["attachments"]>[number]) => void }) {
  return <Dialog open={!!report} onOpenChange={(open) => !open && onClose()}>{report && <DialogContent className="sheet report-sheet">
    <DialogHeader className="sheet-head">
      <p className="kicker"><i />Relatório finalizado</p>
      <DialogTitle>{formatDate(report.reportDate)} · Turno {report.shift}</DialogTitle>
      <DialogDescription>Responsável: {report.reporter} · Inspetor: {report.inspectorName || report.reporter}</DialogDescription>
    </DialogHeader>
    <div className="sheet-body">
      <dl className="summary"><div><dt>Gerências</dt><dd>{pad(AREAS.length)}</dd></div><div><dt>Equipamentos</dt><dd>{ALL_EQUIPMENT.length}</dd></div><div data-tone={report.deviationCount ? "signal" : undefined}><dt>Desvios</dt><dd>{pad(report.deviationCount)}</dd></div></dl>
      {report.payload.deviations.length ? <ul className="occurrences">{report.payload.deviations.map((d) => <li key={d.id}>
        <div className="occurrence-head"><span className="tag">{d.area}</span><b className="mono">{d.um}</b></div>
        <div className="route compact"><div><span>Passagem</span><strong>{d.equipment}</strong><small>CÓD. {d.equipmentCode || EQUIPMENT_CODE_BY_NAME[d.equipment] || "N/I"}</small></div><ChevronRight /><div><span>Destino</span><strong>{d.divertedToEquipment || "Não informado"}</strong><small>CÓD. {d.divertedToEquipmentCode || "—"}</small></div></div>
        <p className="occurrence-defect"><span className="defect-code">{d.defectCode || "—"}</span> {d.defectName || d.reason}</p>
        <p className="occurrence-note">{d.observation || "Sem observação adicional."}</p>
        {(d.attachments || []).length > 0 && <div className="evidence">{d.attachments!.map((attachment) => <button type="button" key={attachment.id || attachment.name} onClick={() => onEvidence(attachment)}><Download /><span>{attachment.name}</span><small>{formatBytes(attachment.size)}</small></button>)}</div>}
      </li>)}</ul> : <div className="all-clear"><CheckCircle2 /><div><strong>Turno sem desvios</strong><span>Todos os equipamentos foram revisados.</span></div></div>}
      {report.payload.generalObservation && <div className="report-note"><strong>Observação geral</strong><p>{report.payload.generalObservation}</p></div>}
    </div>
    <DialogFooter className="sheet-foot"><Button variant="outline" onClick={() => onCsv(report)}><FileSpreadsheet /> Planilha</Button><Button variant="outline" onClick={() => onPdf(report)}><Download /> PDF</Button><Button className="btn-primary" onClick={() => onEmail(report)}><Mail /> Enviar por e-mail</Button></DialogFooter>
  </DialogContent>}</Dialog>;
}

function PrintReport({ report }: { report: StoredReport }) {
  return <article className="print-report"><header><div className="print-logo">IMIQ</div><div><h1>RELATÓRIO DE INSPEÇÃO</h1><p>Laminação a Frio Central · Fechamento de Turno</p></div></header><section className="print-meta"><div><span>Data</span><strong>{formatDate(report.reportDate)}</strong></div><div><span>Turno</span><strong>{report.shift}</strong></div><div><span>Responsável</span><strong>{report.reporter}</strong></div><div><span>Inspetor</span><strong>{report.inspectorName || report.reporter}</strong></div><div><span>Status</span><strong>Finalizado</strong></div></section><h2>Resumo operacional</h2><div className="print-summary"><div><b>{pad(AREAS.length)}</b><span>Gerências</span></div><div><b>{ALL_EQUIPMENT.length}</b><span>Equipamentos</span></div><div><b>{report.deviationCount}</b><span>Desvios</span></div></div><h2>Ocorrências registradas</h2>{report.payload.deviations.length ? <table><thead><tr><th>Gerência</th><th>Passagem / cód.</th><th>Destino / cód.</th><th>UM</th><th>Cód. defeito</th><th>Defeito</th><th>Observação</th></tr></thead><tbody>{report.payload.deviations.map((d) => <tr key={d.id}><td>{d.area}</td><td>{d.equipment} / {d.equipmentCode || EQUIPMENT_CODE_BY_NAME[d.equipment] || "N/I"}</td><td>{d.divertedToEquipment || "Não informado"} / {d.divertedToEquipmentCode || "—"}</td><td>{d.um}</td><td>{d.defectCode || "—"}</td><td>{d.defectName || d.reason}</td><td>{d.observation || "—"}</td></tr>)}</tbody></table> : <div className="print-clear">✓ Todos os equipamentos revisados, sem desvios.</div>}{report.payload.generalObservation && <section className="print-observation"><h2>Observação geral</h2><p>{report.payload.generalObservation}</p></section>}<footer><span>IMIQ - Inspeção | developed by Abner Lucas</span><span>Gerado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}</span></footer></article>;
}
