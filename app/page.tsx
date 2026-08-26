"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, BarChart3, Bell, BookOpen, CalendarDays, Camera, Check, CheckCircle2,
  ChevronRight, ClipboardPlus, Download, Eye, Factory, FileSpreadsheet, FileText,
  LayoutDashboard, Mail, Menu, Paperclip, Plus, Printer, Search, ShieldCheck,
  Video, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { DEFECTS, DEFECT_GROUPS, EQUIPMENT_CODES, EQUIPMENT_CODE_BY_NAME } from "@/lib/inspection-codes";

const AREAS = [
  { code: "ITIF", name: "Recozimento e Decapagem", equipment: ["RB1", "RB4", "LE1"], color: "#7c3aed" },
  { code: "ITIQ", name: "Preparação e Acabamento", equipment: ["RB3", "PB3", "PB1"], color: "#f97316" },
  { code: "ITIL", name: "Laminação", equipment: ["LB1", "LB3", "LB4", "EB1", "EB2"], color: "#111827" },
  { code: "ITIA", name: "Linhas e Tratamentos", equipment: ["TL1", "TL5", "TL6", "TL9", "TT1", "AP2", "EB3"], color: "#a855f7" },
] as const;

const ALL_EQUIPMENT = AREAS.flatMap((area) => area.equipment.map((equipment) => `${area.code}:${equipment}`));
const DEVIATION_DESTINATIONS = [...EQUIPMENT_CODES, { code: "N/I", equipment: "EB3" }]
  .sort((a, b) => a.equipment.localeCompare(b.equipment));

type AttachmentRef = { id?: string; name: string; type: string; size: number };
type Deviation = {
  id: string; area: string; equipment: string; um: string; reason: string;
  equipmentCode?: string; defectCode?: string; defectName?: string;
  divertedToEquipment?: string; divertedToEquipmentCode?: string;
  observation: string; files: File[]; attachments?: AttachmentRef[];
};
type ReportPayload = { deviations: Omit<Deviation, "files">[]; reviewed?: string[]; generalObservation?: string };
type StoredReport = {
  id: string; reportDate: string; shift: string; reporter: string; status: string;
  deviationCount: number; createdAt: string; payload: ReportPayload;
};

const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));
const formatDateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default function Home() {
  const [view, setView] = useState<"dashboard" | "new" | "reports" | "library">("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [search, setSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState("todos");
  const [selectedReport, setSelectedReport] = useState<StoredReport | null>(null);
  const [reportDate, setReportDate] = useState(today());
  const [shift, setShift] = useState("TN");
  const [reporter, setReporter] = useState("");
  const [generalObservation, setGeneralObservation] = useState("");
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [deviations, setDeviations] = useState<Deviation[]>([]);
  const [dialogEquipment, setDialogEquipment] = useState<{ area: string; equipment: string } | null>(null);
  const [form, setForm] = useState({ um: "", divertedToEquipment: "", defectCode: "", observation: "" });
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void loadReports(); }, []);

  async function loadReports() {
    setLoadingReports(true);
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json() as { reports: StoredReport[] };
      setReports(data.reports || []);
    } catch {
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }

  const reviewedCount = reviewed.length;
  const completion = Math.round((reviewedCount / ALL_EQUIPMENT.length) * 100);
  const filteredReports = useMemo(() => reports.filter((report) => {
    const haystack = `${report.reporter} ${report.shift} ${report.reportDate} ${report.payload.deviations.map((d) => `${d.area} ${d.equipment} ${d.equipmentCode || ""} ${d.divertedToEquipment || ""} ${d.divertedToEquipmentCode || ""} ${d.um} ${d.defectCode || ""} ${d.defectName || d.reason}`).join(" ")}`.toLowerCase();
    return (shiftFilter === "todos" || report.shift === shiftFilter) && haystack.includes(search.toLowerCase());
  }), [reports, search, shiftFilter]);

  function beginReport() { setView("new"); setMobileNav(false); }

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
    if (!reporter.trim()) { toast.error("Informe o responsável pelo fechamento."); return; }
    if (reviewedCount < ALL_EQUIPMENT.length) { toast.error(`Revise os ${ALL_EQUIPMENT.length - reviewedCount} equipamentos restantes.`); return; }
    setSaving(true);
    const reportId = crypto.randomUUID();
    try {
      const normalized = [] as Omit<Deviation, "files">[];
      for (const deviation of deviations) {
        const attachments: AttachmentRef[] = [];
        for (const file of deviation.files) {
          const data = new FormData(); data.append("file", file); data.append("reportId", reportId);
          const upload = await fetch("/api/uploads", { method: "POST", body: data });
          const result = await upload.json() as { attachment?: { id: string }; error?: string };
          if (!upload.ok || !result.attachment) throw new Error(result.error || `Falha no arquivo ${file.name}`);
          attachments.push({ id: result.attachment.id, name: file.name, type: file.type, size: file.size });
        }
        const { files: _files, ...deviationData } = deviation;
        normalized.push({ ...deviationData, attachments });
      }
      const response = await fetch("/api/reports", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: reportId, reportDate, shift, reporter, status: "finalizado", deviations: normalized, payload: { reviewed, generalObservation } }),
      });
      const result = await response.json() as { report?: StoredReport; error?: string };
      if (!response.ok || !result.report) throw new Error(result.error || "Falha ao salvar.");
      setReports((items) => [result.report!, ...items]);
      resetDraft(); setView("reports");
      toast.success("Fechamento finalizado e salvo com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar o relatório.");
    } finally { setSaving(false); }
  }

  function resetDraft() {
    setReportDate(today()); setShift("TN"); setReporter(""); setGeneralObservation(""); setReviewed([]); setDeviations([]);
  }

  function exportCsv(report: StoredReport) {
    const header = ["Data", "Turno", "Responsável", "Gerência", "Cód. passagem", "Equipamento de passagem", "Cód. destino", "Equipamento de destino", "UM", "Cód. Defeito", "Defeito", "Observação", "Evidências"];
    const rows = report.payload.deviations.length ? report.payload.deviations.map((d) => [
      report.reportDate, report.shift, report.reporter, d.area, d.equipmentCode || EQUIPMENT_CODE_BY_NAME[d.equipment] || "N/I", d.equipment,
      d.divertedToEquipmentCode || "—", d.divertedToEquipment || "Não informado", d.um, d.defectCode || "—", d.defectName || d.reason, d.observation,
      (d.attachments || []).map((a) => a.name).join(" | "),
    ]) : [[report.reportDate, report.shift, report.reporter, "", "", "", "", "", "", "", "Sem desvios", report.payload.generalObservation || "", ""]];
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
    downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `IMQ_${report.reportDate}_${report.shift}.csv`);
    toast.success("Planilha exportada.");
  }

  function printPdf(report: StoredReport) { setSelectedReport(report); setTimeout(() => window.print(), 80); }
  function emailReport(report: StoredReport) {
    const subject = encodeURIComponent(`IMQ | Fechamento ${report.shift} - ${formatDate(report.reportDate)}`);
    const body = encodeURIComponent(`Relatório de turno IMQ\n\nData: ${formatDate(report.reportDate)}\nTurno: ${report.shift}\nResponsável: ${report.reporter}\nDesvios: ${report.deviationCount}\n\nO PDF pode ser gerado no botão Exportar PDF e anexado a esta mensagem.`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  return (
    <div className="app-shell">
      <Toaster richColors position="top-right" />
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark">IMQ</div><div><strong>INSPEÇÃO</strong><span>Laminação a Frio Central</span></div></div>
        <nav aria-label="Navegação principal">
          <NavButton icon={<LayoutDashboard />} label="Visão geral" active={view === "dashboard"} onClick={() => { setView("dashboard"); setMobileNav(false); }} />
          <NavButton icon={<ClipboardPlus />} label="Novo fechamento" active={view === "new"} onClick={beginReport} />
          <NavButton icon={<FileText />} label="Relatórios" active={view === "reports"} onClick={() => { setView("reports"); setMobileNav(false); }} />
          <NavButton icon={<BookOpen />} label="Biblioteca de códigos" active={view === "library"} onClick={() => { setView("library"); setMobileNav(false); }} />
        </nav>
        <div className="sidebar-foot">
          <div className="security-note"><ShieldCheck /><div><strong>Ambiente protegido</strong><span>Dados operacionais seguros</span></div></div>
          <div className="profile"><div className="avatar">AL</div><div><strong>Abner Lucas</strong><span>Administrador</span></div></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <Button variant="ghost" size="icon" className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Abrir menu"><Menu /></Button>
          <div><p>IMQ • INSPEÇÃO</p><h1>{view === "dashboard" ? "Visão geral" : view === "new" ? "Novo fechamento de turno" : view === "reports" ? "Relatórios de turno" : "Biblioteca de códigos"}</h1></div>
          <div className="top-actions"><span className="today"><CalendarDays /> {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date())}</span><Button variant="ghost" size="icon" aria-label="Notificações"><Bell /></Button></div>
        </header>

        <div className="content">
          {view === "dashboard" && <Dashboard reports={reports} loading={loadingReports} onNew={beginReport} onReports={() => setView("reports")} />}
          {view === "new" && (
            <section className="new-report">
              <div className="page-heading"><div><p className="eyebrow">ROTINA OPERACIONAL</p><h2>Fechamento da inspeção</h2><p>Revise os equipamentos e registre as unidades metálicas desviadas.</p></div><Button variant="outline" onClick={() => setView("dashboard")}><ArrowLeft /> Voltar</Button></div>
              <Card className="report-header-card"><CardContent className="report-meta">
                <div><Label htmlFor="report-date">Data do fechamento</Label><Input id="report-date" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></div>
                <div><Label>Turno</Label><Select value={shift} onValueChange={setShift}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TN">TN • Turno da Noite</SelectItem><SelectItem value="TM">TM • Turno da Manhã</SelectItem><SelectItem value="TT">TT • Turno da Tarde</SelectItem></SelectContent></Select></div>
                <div><Label htmlFor="reporter">Responsável</Label><Input id="reporter" placeholder="Nome e sobrenome" value={reporter} onChange={(e) => setReporter(e.target.value)} /></div>
              </CardContent></Card>
              <div className="progress-card"><div><strong>{completion}% concluído</strong><span>{reviewedCount} de {ALL_EQUIPMENT.length} equipamentos revisados</span></div><Progress value={completion} /><Button variant="outline" size="sm" onClick={() => setReviewed([...ALL_EQUIPMENT])}><Check /> Marcar restantes sem desvio</Button></div>

              <div className="areas-grid">
                {AREAS.map((area) => {
                  const areaReviewed = area.equipment.filter((eq) => reviewed.includes(`${area.code}:${eq}`)).length;
                  const areaDeviations = deviations.filter((d) => d.area === area.code).length;
                  return <Card key={area.code} className="area-card" style={{ "--area-color": area.color } as React.CSSProperties}>
                    <CardHeader><div className="area-title"><div className="area-icon"><Factory /></div><div><CardTitle>{area.code}</CardTitle><p>{area.name}</p></div></div><Badge variant="outline">{areaReviewed}/{area.equipment.length}</Badge></CardHeader>
                    <CardContent><div className="equipment-list">
                      <div className="equipment-columns"><span>Equipamento / código</span><span>Situação</span><span>Ocorrências</span><span>Ação</span></div>
                      {area.equipment.map((equipment) => {
                        const key = `${area.code}:${equipment}`; const done = reviewed.includes(key); const count = deviations.filter((d) => d.area === area.code && d.equipment === equipment).length;
                        return <div className={`equipment-row ${done ? "equipment-done" : ""}`} key={equipment}>
                          <div className="machine-symbol"><b>{equipment}</b><span>CÓD. {EQUIPMENT_CODE_BY_NAME[equipment] || "N/I"}</span></div>
                          <div className="equipment-info"><strong>{done ? "REVISADO" : "PENDENTE"}</strong><span>{done ? "Inspeção registrada" : "Aguardando inspeção"}</span></div>
                          <div className={`occurrence-count ${count ? "has-occurrence" : ""}`}>{count ? `${count} DESVIO${count > 1 ? "S" : ""}` : "—"}</div>
                          <div className="equipment-actions"><Button size="sm" variant="outline" onClick={() => markNoDeviation(area.code, equipment)} disabled={done && !count}><CheckCircle2 /> Sem desvio</Button><Button size="sm" className="deviation-button" onClick={() => openDeviation(area.code, equipment)}><Plus /> Desvio</Button></div>
                        </div>;
                      })}
                    </div>{areaDeviations > 0 && <div className="area-alert"><AlertTriangle /> {areaDeviations} ocorrência{areaDeviations > 1 ? "s" : ""} nesta gerência</div>}</CardContent>
                  </Card>;
                })}
              </div>

              {deviations.length > 0 && <Card className="deviations-card"><CardHeader><CardTitle>Desvios registrados</CardTitle><Badge>{deviations.length}</Badge></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Gerência</TableHead><TableHead>Passagem / cód.</TableHead><TableHead>Destino / cód.</TableHead><TableHead>UM</TableHead><TableHead>Cód. defeito</TableHead><TableHead>Defeito</TableHead><TableHead>Evidências</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{deviations.map((item) => <TableRow key={item.id}><TableCell><Badge variant="outline">{item.area}</Badge></TableCell><TableCell className="font-semibold">{item.equipment} <small>({item.equipmentCode || EQUIPMENT_CODE_BY_NAME[item.equipment] || "N/I"})</small></TableCell><TableCell className="font-semibold">{item.divertedToEquipment || "Não informado"} <small>({item.divertedToEquipmentCode || "—"})</small></TableCell><TableCell className="mono">{item.um}</TableCell><TableCell><span className="defect-code">{item.defectCode || "—"}</span></TableCell><TableCell>{item.defectName || item.reason}</TableCell><TableCell>{item.files.length ? <span className="file-count"><Paperclip /> {item.files.length}</span> : "—"}</TableCell><TableCell><Button variant="ghost" size="icon" aria-label="Remover desvio" onClick={() => removeDeviation(item.id)}><X /></Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}

              <Card><CardContent className="general-note"><Label htmlFor="general-note">Observação geral do turno</Label><Textarea id="general-note" placeholder="Registre informações relevantes para o próximo turno..." value={generalObservation} onChange={(e) => setGeneralObservation(e.target.value)} /></CardContent></Card>
              <div className="finish-bar"><div><strong>Pronto para finalizar?</strong><span>O relatório ficará disponível no histórico para exportação.</span></div><Button size="lg" className="finish-button" onClick={finalizeReport} disabled={saving || completion < 100}>{saving ? "Salvando evidências..." : "Finalizar fechamento"}<ChevronRight /></Button></div>
            </section>
          )}
          {view === "reports" && <ReportsView reports={filteredReports} search={search} setSearch={setSearch} shiftFilter={shiftFilter} setShiftFilter={setShiftFilter} onView={setSelectedReport} onCsv={exportCsv} onPdf={printPdf} onEmail={emailReport} onNew={beginReport} />}
          {view === "library" && <CodeLibrary />}
        </div>
      </main>

      <DeviationDialog open={!!dialogEquipment} target={dialogEquipment} form={form} setForm={setForm} files={formFiles} setFiles={setFormFiles} fileInputRef={fileInputRef} onClose={() => setDialogEquipment(null)} onAdd={addDeviation} />
      <ReportDialog report={selectedReport} onClose={() => setSelectedReport(null)} onPdf={printPdf} onCsv={exportCsv} onEmail={emailReport} />
      {selectedReport && <PrintReport report={selectedReport} />}
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? "nav-active" : ""} onClick={onClick}>{icon}<span>{label}</span>{active && <ChevronRight className="nav-arrow" />}</button>;
}

function Dashboard({ reports, loading, onNew, onReports }: { reports: StoredReport[]; loading: boolean; onNew: () => void; onReports: () => void }) {
  const todayReports = reports.filter((r) => r.reportDate === today()).length;
  const recent = reports.slice(0, 5);
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6);
  const weekReports = reports.filter((report) => report.reportDate >= cutoff.toISOString().slice(0, 10));
  const weekDeviations = weekReports.flatMap((report) => report.payload.deviations.map((deviation) => ({ ...deviation, shift: report.shift })));
  const passageRanking = rankCounts(weekDeviations.map((item) => item.equipment)).slice(0, 6);
  const destinationRanking = rankCounts(weekDeviations.map((item) => item.divertedToEquipment || "")).slice(0, 6);
  const defectRanking = rankCounts(weekDeviations.map((item) => `${item.defectCode || "S/C"} • ${item.defectName || item.reason || "Não classificado"}`)).slice(0, 6);
  const shiftRanking = ["TN", "TM", "TT"].map((name) => ({ name, value: weekDeviations.filter((item) => item.shift === name).length }));
  const affectedEquipment = new Set(weekDeviations.map((item) => item.divertedToEquipment).filter(Boolean)).size;
  const leadingShift = [...shiftRanking].sort((a, b) => b.value - a.value)[0];
  return <section>
    <div className="welcome"><div><p className="eyebrow">LAMINAÇÃO A FRIO CENTRAL</p><h2>Controle de fechamento de turno</h2><p>Registro consolidado das inspeções, desvios e evidências operacionais.</p></div><Button size="lg" onClick={onNew}><ClipboardPlus /> Iniciar fechamento</Button></div>
    <div className="stats-grid">
      <StatCard label="Fechamentos hoje" value={loading ? "—" : String(todayReports)} note="TN, TM e TT" icon={<FileText />} tone="purple" />
      <StatCard label="Defeitos na semana" value={loading ? "—" : String(weekDeviations.length)} note="Últimos 7 dias" icon={<AlertTriangle />} tone="orange" />
      <StatCard label="Destinos com desvios" value={loading ? "—" : String(affectedEquipment)} note="Na semana atual" icon={<Factory />} tone="black" />
      <StatCard label="Turno com mais desvios" value={weekDeviations.length ? leadingShift.name : "—"} note={weekDeviations.length ? `${leadingShift.value} registros na semana` : "Sem registros"} icon={<BarChart3 />} tone="violet" />
    </div>
    <div className="analytics-grid">
      <AnalyticsCard title="Detecção por equipamento de passagem" subtitle="Onde a UM foi inspecionada nos últimos 7 dias" data={passageRanking} empty="Nenhuma detecção registrada na semana." />
      <AnalyticsCard title="Desvios por equipamento de destino" subtitle="Para onde as UMs foram desviadas" data={destinationRanking} empty="Nenhum destino de desvio registrado na semana." />
      <AnalyticsCard title="Principais defeitos da semana" subtitle="Códigos com maior recorrência" data={defectRanking} empty="Nenhum defeito classificado na semana." />
      <AnalyticsCard title="Distribuição por turno" subtitle="TN, TM e TT nos últimos 7 dias" data={shiftRanking} empty="Nenhum desvio registrado por turno." />
    </div>
    <div className="dashboard-grid">
      <Card className="recent-card"><CardHeader><div><CardTitle>Fechamentos recentes</CardTitle><p>Últimos registros consolidados</p></div><Button variant="ghost" onClick={onReports}>Ver todos <ChevronRight /></Button></CardHeader><CardContent>
        {recent.length ? <div className="recent-list">{recent.map((report) => <button key={report.id} onClick={onReports}><div className="report-shift">{report.shift}</div><div><strong>{formatDate(report.reportDate)} • {report.reporter}</strong><span>{report.deviationCount ? `${report.deviationCount} desvio${report.deviationCount > 1 ? "s" : ""}` : "Turno sem desvios"}</span></div><Badge className={report.deviationCount ? "status-alert" : "status-ok"}>{report.deviationCount ? "Com desvios" : "Conforme"}</Badge><ChevronRight /></button>)}</div> : <div className="empty-state"><FileText /><strong>Nenhum fechamento ainda</strong><span>O primeiro relatório aparecerá aqui.</span><Button variant="outline" onClick={onNew}>Criar primeiro fechamento</Button></div>}
      </CardContent></Card>
      <Card className="coverage-card"><CardHeader><div><CardTitle>Cobertura operacional</CardTitle><p>Estrutura inspecionada por gerência</p></div></CardHeader><CardContent>{AREAS.map((area) => <div className="coverage-row" key={area.code}><div className="coverage-code" style={{ background: area.color }}>{area.code}</div><div><strong>{area.name}</strong><span>{area.equipment.join(" • ")}</span></div><b>{area.equipment.length}</b></div>)}</CardContent></Card>
    </div>
  </section>;
}

function rankCounts(values: string[]) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function AnalyticsCard({ title, subtitle, data, empty }: { title: string; subtitle: string; data: Array<{ name: string; value: number }>; empty: string }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return <Card className="analytics-card"><CardHeader><div><CardTitle>{title}</CardTitle><p>{subtitle}</p></div><BarChart3 /></CardHeader><CardContent>{data.some((item) => item.value > 0) ? <div className="rank-bars">{data.map((item, index) => <div className="rank-row" key={item.name}><span className="rank-position">{String(index + 1).padStart(2, "0")}</span><div className="rank-main"><div><strong>{item.name}</strong><b>{item.value}</b></div><div className="rank-track"><span style={{ width: `${(item.value / max) * 100}%` }} /></div></div></div>)}</div> : <div className="analytics-empty">{empty}</div>}</CardContent></Card>;
}

function StatCard({ label, value, note, icon, tone }: { label: string; value: string; note: string; icon: React.ReactNode; tone: string }) {
  return <Card className={`stat-card tone-${tone}`}><CardContent><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></CardContent></Card>;
}

function ReportsView({ reports, search, setSearch, shiftFilter, setShiftFilter, onView, onCsv, onPdf, onEmail, onNew }: {
  reports: StoredReport[]; search: string; setSearch: (v: string) => void; shiftFilter: string; setShiftFilter: (v: string) => void;
  onView: (r: StoredReport) => void; onCsv: (r: StoredReport) => void; onPdf: (r: StoredReport) => void; onEmail: (r: StoredReport) => void; onNew: () => void;
}) {
  return <section><div className="page-heading"><div><p className="eyebrow">HISTÓRICO CONSOLIDADO</p><h2>Relatórios de turno</h2><p>Consulte, compartilhe e exporte todos os fechamentos.</p></div><Button onClick={onNew}><Plus /> Novo fechamento</Button></div>
    <Card className="reports-card"><CardHeader className="filters"><div className="search-box"><Search /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por UM, equipamento ou responsável..." /></div><Select value={shiftFilter} onValueChange={setShiftFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os turnos</SelectItem><SelectItem value="TN">Turno TN</SelectItem><SelectItem value="TM">Turno TM</SelectItem><SelectItem value="TT">Turno TT</SelectItem></SelectContent></Select></CardHeader><CardContent>
      {reports.length ? <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Turno</TableHead><TableHead>Responsável</TableHead><TableHead>Desvios</TableHead><TableHead>Status</TableHead><TableHead>Gerado em</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{reports.map((report) => <TableRow key={report.id}><TableCell className="font-semibold">{formatDate(report.reportDate)}</TableCell><TableCell><span className="shift-pill">{report.shift}</span></TableCell><TableCell>{report.reporter}</TableCell><TableCell>{report.deviationCount}</TableCell><TableCell><Badge className={report.deviationCount ? "status-alert" : "status-ok"}>{report.deviationCount ? "Com desvios" : "Conforme"}</Badge></TableCell><TableCell>{formatDateTime(report.createdAt)}</TableCell><TableCell><div className="table-actions"><Button variant="ghost" size="icon" title="Visualizar" onClick={() => onView(report)}><Eye /></Button><Button variant="ghost" size="icon" title="Exportar PDF" onClick={() => onPdf(report)}><Printer /></Button><Button variant="ghost" size="icon" title="Planilha" onClick={() => onCsv(report)}><FileSpreadsheet /></Button><Button variant="ghost" size="icon" title="E-mail" onClick={() => onEmail(report)}><Mail /></Button></div></TableCell></TableRow>)}</TableBody></Table> : <div className="empty-state"><Search /><strong>Nenhum relatório encontrado</strong><span>Ajuste os filtros ou crie um novo fechamento.</span></div>}
    </CardContent></Card>
  </section>;
}

function CodeLibrary() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("todos");
  const normalizedQuery = query.trim().toLowerCase();
  const defects = DEFECTS.filter((item) => (group === "todos" || item.group === group) && `${item.code} ${item.name} ${item.group}`.toLowerCase().includes(normalizedQuery));
  const equipment = [...EQUIPMENT_CODES, { code: "N/I", equipment: "EB3" }].filter((item) => `${item.code} ${item.equipment}`.toLowerCase().includes(normalizedQuery));
  return <section className="library-view"><div className="page-heading"><div><p className="eyebrow">PADRÃO DE CLASSIFICAÇÃO</p><h2>Biblioteca de códigos</h2><p>Consulta oficial de equipamentos e defeitos para o registro padronizado das ocorrências.</p></div><div className="library-count"><strong>{DEFECTS.length}</strong><span>códigos de defeito</span></div></div>
    <Card className="library-tools"><CardContent><div className="search-box"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar código, defeito ou equipamento..." /></div><Select value={group} onValueChange={setGroup}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os grupos</SelectItem>{DEFECT_GROUPS.map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select></CardContent></Card>
    <div className="library-grid">
      <Card className="code-card"><CardHeader><div><CardTitle>Códigos de equipamentos</CardTitle><p>Conforme referência operacional enviada</p></div><Badge variant="outline">{equipment.length}</Badge></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Equipamento</TableHead><TableHead>Gerência no IMQ</TableHead></TableRow></TableHeader><TableBody>{equipment.map((item) => <TableRow key={`${item.code}-${item.equipment}`}><TableCell><span className={`equipment-code-badge ${item.code === "N/I" ? "code-missing" : ""}`}>{item.code}</span></TableCell><TableCell className="font-semibold">{item.equipment}</TableCell><TableCell>{findArea(item.equipment)}</TableCell></TableRow>)}</TableBody></Table>{equipment.some((item) => item.code === "N/I") && <p className="library-note"><AlertTriangle /> O código do EB3 não consta na imagem de referência e foi mantido como “N/I”.</p>}</CardContent></Card>
      <Card className="code-card defect-library"><CardHeader><div><CardTitle>Defeitos em produtos inoxidáveis</CardTitle><p>Código oficial, descrição e organização interna</p></div><Badge variant="outline">{defects.length}</Badge></CardHeader><CardContent>{defects.length ? <Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descrição do defeito</TableHead><TableHead>Grupo operacional IMQ</TableHead></TableRow></TableHeader><TableBody>{defects.map((item) => <TableRow key={item.code}><TableCell><span className="defect-code">{item.code}</span></TableCell><TableCell className="font-semibold">{item.name}</TableCell><TableCell><Badge variant="outline">{item.group}</Badge></TableCell></TableRow>)}</TableBody></Table> : <div className="analytics-empty">Nenhum código encontrado para os filtros informados.</div>}</CardContent></Card>
    </div>
  </section>;
}

function findArea(equipment: string) {
  return AREAS.find((area) => area.equipment.some((item) => item === equipment))?.code || "Referência externa";
}

function DeviationDialog({ open, target, form, setForm, files, setFiles, fileInputRef, onClose, onAdd }: {
  open: boolean; target: { area: string; equipment: string } | null; form: { um: string; divertedToEquipment: string; defectCode: string; observation: string };
  setForm: React.Dispatch<React.SetStateAction<{ um: string; divertedToEquipment: string; defectCode: string; observation: string }>>; files: File[]; setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>; onClose: () => void; onAdd: () => void;
}) {
  const selectedDefect = DEFECTS.find((item) => item.code === form.defectCode);
  const selectedDestination = DEVIATION_DESTINATIONS.find((item) => item.equipment === form.divertedToEquipment);
  const [defectQuery, setDefectQuery] = useState("");
  const [defectSearchOpen, setDefectSearchOpen] = useState(false);
  const [highlightedDefect, setHighlightedDefect] = useState(0);
  const normalizedDefectQuery = normalizeSearch(defectQuery);
  const filteredDefects = DEFECTS.filter((item) => normalizeSearch(`${item.code} ${item.name} ${item.group}`).includes(normalizedDefectQuery));

  useEffect(() => {
    if (!open) return;
    setDefectQuery("");
    setDefectSearchOpen(false);
    setHighlightedDefect(0);
  }, [open, target?.area, target?.equipment]);

  function selectDefect(code: string) {
    const defect = DEFECTS.find((item) => item.code === code);
    if (!defect) return;
    setForm((current) => ({ ...current, defectCode: defect.code }));
    setDefectQuery(`${defect.code} • ${defect.name}`);
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

  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="deviation-dialog"><DialogHeader><div className="dialog-kicker"><AlertTriangle /> REGISTRAR DESVIO</div><DialogTitle>{target?.area} • {target?.equipment}</DialogTitle><DialogDescription>A UM passou pelo equipamento abaixo. Informe o destino do desvio e classifique o defeito.</DialogDescription></DialogHeader>
    <div className="equipment-identification"><span>Equipamento de passagem</span><strong>{target?.equipment || "—"}</strong><span>Código de passagem</span><b>{target ? EQUIPMENT_CODE_BY_NAME[target.equipment] || "N/I" : "—"}</b></div>
    <div className="form-grid"><div className="full-field"><Label htmlFor="um">Unidade Metálica (UM) *</Label><Input id="um" className="mono" placeholder="Ex.: 671606B2000B" maxLength={20} value={form.um} onChange={(e) => setForm((f) => ({ ...f, um: e.target.value.replace(/\s/g, "").toUpperCase() }))} /><small>Use letras e números, sem espaços.</small></div><div className="full-field"><Label>Equipamento de destino do desvio *</Label><Select value={form.divertedToEquipment} onValueChange={(value) => setForm((current) => ({ ...current, divertedToEquipment: value }))}><SelectTrigger className="destination-select"><SelectValue placeholder="Selecione o equipamento de destino" /></SelectTrigger><SelectContent>{DEVIATION_DESTINATIONS.map((item) => <SelectItem value={item.equipment} key={`${item.code}-${item.equipment}`}><span className="destination-option"><b>{item.code}</b><span>{item.equipment}</span></span></SelectItem>)}</SelectContent></Select>{selectedDestination && <div className="selected-destination"><div><span>DESTINO SELECIONADO</span><strong>{selectedDestination.equipment}</strong></div><div><span>CÓDIGO AUTOMÁTICO</span><b>{selectedDestination.code}</b></div></div>}<small>Indique para qual equipamento a UM foi efetivamente desviada.</small></div><div className="full-field"><Label htmlFor="defect-search">Pesquisar código ou descrição do defeito *</Label><div className="defect-search"><Search aria-hidden="true" /><Input id="defect-search" role="combobox" aria-autocomplete="list" aria-expanded={defectSearchOpen} aria-controls="defect-results" autoComplete="off" placeholder="Ex.: 07, arranhão, oxidação..." value={defectQuery} onFocus={() => setDefectSearchOpen(true)} onChange={(event) => { setDefectQuery(event.target.value); setDefectSearchOpen(true); setHighlightedDefect(0); if (form.defectCode) setForm((current) => ({ ...current, defectCode: "" })); }} onKeyDown={handleDefectKeyDown} />{defectQuery && <button type="button" className="defect-search-clear" aria-label="Limpar pesquisa de defeito" onClick={() => { setDefectQuery(""); setDefectSearchOpen(true); setHighlightedDefect(0); setForm((current) => ({ ...current, defectCode: "" })); }}><X /></button>}</div>{defectSearchOpen && <div id="defect-results" className="defect-results" role="listbox" aria-label="Resultados da pesquisa de defeitos">{filteredDefects.length ? filteredDefects.map((item, index) => <button type="button" role="option" aria-selected={form.defectCode === item.code} className={index === highlightedDefect ? "defect-result highlighted" : "defect-result"} key={item.code} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setHighlightedDefect(index)} onClick={() => selectDefect(item.code)}><span className="defect-code">{item.code}</span><span><strong>{item.name}</strong><small>{item.group}</small></span><Check /></button>) : <div className="defect-no-results"><Search /><strong>Nenhum defeito encontrado</strong><span>Tente outro código ou termo.</span></div>}</div>}{selectedDefect && <div className="selected-defect"><span className="defect-code">{selectedDefect.code}</span><div><strong>{selectedDefect.name}</strong><small>{selectedDefect.group}</small></div><CheckCircle2 /></div>}<small>Pesquise pelo código numérico ou por qualquer palavra da descrição.</small></div><div className="full-field"><Label htmlFor="observation">Observação</Label><Textarea id="observation" placeholder="Descreva condição, localização do defeito e ação tomada..." value={form.observation} onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))} /></div>
      <div className="full-field"><Label>Evidências</Label><input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => setFiles((current) => [...current, ...Array.from(e.target.files || [])].slice(0, 6))} /><button className="upload-zone" type="button" onClick={() => fileInputRef.current?.click()}><div><Camera /><Video /></div><strong>Adicionar foto ou vídeo</strong><span>Até 6 arquivos • máximo de 50 MB cada</span></button>{files.length > 0 && <div className="selected-files">{files.map((file, index) => <div key={`${file.name}-${index}`}><Paperclip /><span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span><Button variant="ghost" size="icon" onClick={() => setFiles((items) => items.filter((_, i) => i !== index))}><X /></Button></div>)}</div>}</div></div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button className="deviation-button" onClick={onAdd}><Plus /> Adicionar desvio</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function ReportDialog({ report, onClose, onPdf, onCsv, onEmail }: { report: StoredReport | null; onClose: () => void; onPdf: (r: StoredReport) => void; onCsv: (r: StoredReport) => void; onEmail: (r: StoredReport) => void }) {
  return <Dialog open={!!report} onOpenChange={(open) => !open && onClose()}>{report && <DialogContent className="report-dialog"><DialogHeader><div className="dialog-kicker"><FileText /> RELATÓRIO FINALIZADO</div><DialogTitle>{formatDate(report.reportDate)} • Turno {report.shift}</DialogTitle><DialogDescription>Responsável: {report.reporter}</DialogDescription></DialogHeader><div className="report-summary"><div><span>Gerências</span><strong>04</strong></div><div><span>Equipamentos</span><strong>18</strong></div><div><span>Desvios</span><strong>{report.deviationCount}</strong></div></div>{report.payload.deviations.length ? <div className="dialog-deviations">{report.payload.deviations.map((d) => <div key={d.id}><div className="deviation-route"><Badge variant="outline">{d.area}</Badge><span><small>PASSAGEM</small><strong>{d.equipment} • CÓD. {d.equipmentCode || EQUIPMENT_CODE_BY_NAME[d.equipment] || "N/I"}</strong></span><ChevronRight /><span><small>DESTINO</small><strong>{d.divertedToEquipment || "Não informado"} • CÓD. {d.divertedToEquipmentCode || "—"}</strong></span></div><b className="mono">{d.um}</b><span><span className="defect-code">{d.defectCode || "—"}</span> {d.defectName || d.reason}</span><p>{d.observation || "Sem observação adicional."}</p>{(d.attachments || []).length > 0 && <small><Paperclip /> {d.attachments!.length} evidência(s)</small>}</div>)}</div> : <div className="all-clear"><CheckCircle2 /><div><strong>Turno sem desvios</strong><span>Todos os equipamentos foram revisados.</span></div></div>}{report.payload.generalObservation && <div className="report-note"><strong>Observação geral</strong><p>{report.payload.generalObservation}</p></div>}<DialogFooter className="export-actions"><Button variant="outline" onClick={() => onCsv(report)}><FileSpreadsheet /> Planilha</Button><Button variant="outline" onClick={() => onPdf(report)}><Download /> PDF</Button><Button onClick={() => onEmail(report)}><Mail /> Enviar por e-mail</Button></DialogFooter></DialogContent>}</Dialog>;
}

function PrintReport({ report }: { report: StoredReport }) {
  return <article className="print-report"><header><div className="print-logo">IMQ</div><div><h1>RELATÓRIO DE INSPEÇÃO</h1><p>Laminação a Frio Central • Fechamento de Turno</p></div></header><section className="print-meta"><div><span>Data</span><strong>{formatDate(report.reportDate)}</strong></div><div><span>Turno</span><strong>{report.shift}</strong></div><div><span>Responsável</span><strong>{report.reporter}</strong></div><div><span>Status</span><strong>Finalizado</strong></div></section><h2>Resumo operacional</h2><div className="print-summary"><div><b>04</b><span>Gerências</span></div><div><b>18</b><span>Equipamentos</span></div><div><b>{report.deviationCount}</b><span>Desvios</span></div></div><h2>Ocorrências registradas</h2>{report.payload.deviations.length ? <table><thead><tr><th>Gerência</th><th>Passagem / cód.</th><th>Destino / cód.</th><th>UM</th><th>Cód. defeito</th><th>Defeito</th><th>Observação</th></tr></thead><tbody>{report.payload.deviations.map((d) => <tr key={d.id}><td>{d.area}</td><td>{d.equipment} / {d.equipmentCode || EQUIPMENT_CODE_BY_NAME[d.equipment] || "N/I"}</td><td>{d.divertedToEquipment || "Não informado"} / {d.divertedToEquipmentCode || "—"}</td><td>{d.um}</td><td>{d.defectCode || "—"}</td><td>{d.defectName || d.reason}</td><td>{d.observation || "—"}</td></tr>)}</tbody></table> : <div className="print-clear">✓ Todos os equipamentos revisados, sem desvios.</div>}{report.payload.generalObservation && <section className="print-observation"><h2>Observação geral</h2><p>{report.payload.generalObservation}</p></section>}<footer><span>IMQ - Inspeção</span><span>Gerado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}</span></footer></article>;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
