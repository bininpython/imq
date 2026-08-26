import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lqadpxkngnryrfalrrjv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_dEOw8CNPoB0Y7FQe_-y71w_LAHXcYxY";
const EVIDENCE_BUCKET = "imq-evidencias";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type AttachmentRef = {
  id?: string;
  name: string;
  type: string;
  size: number;
  storagePath?: string;
};

export type Deviation = {
  id: string;
  area: string;
  equipment: string;
  um: string;
  reason: string;
  equipmentCode?: string;
  defectCode?: string;
  defectName?: string;
  divertedToEquipment?: string;
  divertedToEquipmentCode?: string;
  observation: string;
  files: File[];
  attachments?: AttachmentRef[];
};

export type ReportPayload = {
  deviations: Omit<Deviation, "files">[];
  reviewed?: string[];
  generalObservation?: string;
};

export type StoredReport = {
  id: string;
  reportDate: string;
  shift: string;
  reporter: string;
  status: string;
  deviationCount: number;
  createdAt: string;
  payload: ReportPayload;
};

type ReportRow = {
  id: string;
  report_date: string;
  shift: string;
  reporter: string;
  status: string;
  reviewed: unknown;
  general_observation: string;
  deviation_count: number;
  created_at: string;
  deviations?: Array<{
    id: string;
    area: string;
    passage_equipment: string;
    passage_equipment_code: string;
    destination_equipment: string;
    destination_equipment_code: string;
    um: string;
    defect_code: string;
    defect_name: string;
    observation: string;
    attachments?: Array<{
      id: string;
      storage_path: string;
      file_name: string;
      content_type: string;
      size_bytes: number;
    }>;
  }>;
};

export async function fetchReports(): Promise<StoredReport[]> {
  const { data, error } = await supabase
    .from("imq_reports")
    .select(`
      id, report_date, shift, reporter, status, reviewed,
      general_observation, deviation_count, created_at,
      deviations:imq_deviations(
        id, area, passage_equipment, passage_equipment_code,
        destination_equipment, destination_equipment_code, um,
        defect_code, defect_name, observation,
        attachments:imq_attachments(
          id, storage_path, file_name, content_type, size_bytes
        )
      )
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return ((data || []) as ReportRow[]).map(mapReportRow);
}

export async function saveReport(input: {
  id: string;
  reportDate: string;
  shift: string;
  reporter: string;
  reviewed: string[];
  generalObservation: string;
  deviations: Deviation[];
}): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sua sessão expirou. Entre novamente.");

  const uploadedPaths: string[] = [];
  try {
    const deviations = [] as Array<Record<string, unknown>>;

    for (const deviation of input.deviations) {
      const attachments = [] as Array<Record<string, unknown>>;
      for (const file of deviation.files) {
        const attachmentId = crypto.randomUUID();
        const safeName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-");
        const storagePath = `reports/${userData.user.id}/${input.id}/${deviation.id}/${attachmentId}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(EVIDENCE_BUCKET)
          .upload(storagePath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
        if (uploadError) throw new Error(`Falha ao enviar ${file.name}: ${uploadError.message}`);
        uploadedPaths.push(storagePath);
        attachments.push({
          id: attachmentId,
          storage_path: storagePath,
          file_name: file.name,
          content_type: file.type,
          size_bytes: file.size,
        });
      }

      deviations.push({
        id: deviation.id,
        area: deviation.area,
        passage_equipment: deviation.equipment,
        passage_equipment_code: deviation.equipmentCode || "N/I",
        destination_equipment: deviation.divertedToEquipment,
        destination_equipment_code: deviation.divertedToEquipmentCode,
        um: deviation.um,
        defect_code: deviation.defectCode,
        defect_name: deviation.defectName || deviation.reason,
        observation: deviation.observation,
        attachments,
      });
    }

    const { error } = await supabase.rpc("create_imq_report", {
      p_report: {
        id: input.id,
        report_date: input.reportDate,
        shift: input.shift,
        reporter: input.reporter,
        status: "finalizado",
        reviewed: input.reviewed,
        general_observation: input.generalObservation,
        deviations,
      },
    });
    if (error) throw error;
  } catch (error) {
    if (uploadedPaths.length) {
      await supabase.storage.from(EVIDENCE_BUCKET).remove(uploadedPaths);
    }
    throw error;
  }
}

export async function downloadEvidence(attachment: AttachmentRef): Promise<void> {
  if (!attachment.storagePath) throw new Error("Caminho da evidência indisponível.");
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).download(attachment.storagePath);
  if (error) throw error;
  downloadBlob(data, attachment.name);
}

export async function downloadReportPdf(report: StoredReport): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const purple: [number, number, number] = [100, 32, 111];
  const orange: [number, number, number] = [243, 111, 33];

  doc.setFillColor(...purple);
  doc.rect(0, 0, 297, 27, "F");
  doc.setFillColor(...orange);
  doc.rect(0, 27, 297, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("IMQ | RELATORIO DE INSPECAO", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Laminacao a Frio Central - Fechamento de Turno", 14, 19);

  doc.setTextColor(25, 25, 25);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Data: ${formatDate(report.reportDate)}`, 14, 39);
  doc.text(`Turno: ${report.shift}`, 72, 39);
  doc.text(`Responsavel: ${report.reporter}`, 112, 39);
  doc.text(`Desvios: ${report.deviationCount}`, 250, 39);

  const body = report.payload.deviations.length
    ? report.payload.deviations.map((item) => [
        item.area,
        `${item.equipment} (${item.equipmentCode || "N/I"})`,
        `${item.divertedToEquipment || "-"} (${item.divertedToEquipmentCode || "-"})`,
        item.um,
        item.defectCode || "-",
        item.defectName || item.reason,
        item.observation || "-",
        String(item.attachments?.length || 0),
      ])
    : [["-", "-", "-", "-", "-", "Turno sem desvios", report.payload.generalObservation || "-", "0"]];

  autoTable(doc, {
    startY: 47,
    head: [["Gerencia", "Passagem / cod.", "Destino / cod.", "UM", "Cod. defeito", "Defeito", "Observacao", "Evidencias"]],
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.2, valign: "middle", lineColor: [180, 180, 180], lineWidth: 0.15 },
    headStyles: { fillColor: purple, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 242, 247] },
    columnStyles: {
      0: { cellWidth: 16 }, 1: { cellWidth: 30 }, 2: { cellWidth: 32 },
      3: { cellWidth: 28 }, 4: { cellWidth: 20 }, 5: { cellWidth: 42 },
      6: { cellWidth: 78 }, 7: { cellWidth: 17, halign: "center" },
    },
    didDrawPage: ({ pageNumber }) => {
      doc.setFontSize(7);
      doc.setTextColor(90, 90, 90);
      doc.text(`IMQ - Inspecao | Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 204);
      doc.text(`Pagina ${pageNumber}`, 279, 204, { align: "right" });
    },
  });

  const finalY = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 55;
  if (report.payload.generalObservation && finalY < 185) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...purple);
    doc.text("Observacao geral", 14, finalY + 9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    doc.text(doc.splitTextToSize(report.payload.generalObservation, 265), 14, finalY + 15);
  }

  doc.save(`IMQ_${report.reportDate}_${report.shift}.pdf`);
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mapReportRow(row: ReportRow): StoredReport {
  return {
    id: row.id,
    reportDate: row.report_date,
    shift: row.shift,
    reporter: row.reporter,
    status: row.status,
    deviationCount: row.deviation_count,
    createdAt: row.created_at,
    payload: {
      reviewed: Array.isArray(row.reviewed) ? row.reviewed.filter((item): item is string => typeof item === "string") : [],
      generalObservation: row.general_observation,
      deviations: (row.deviations || []).map((item) => ({
        id: item.id,
        area: item.area,
        equipment: item.passage_equipment,
        equipmentCode: item.passage_equipment_code,
        divertedToEquipment: item.destination_equipment,
        divertedToEquipmentCode: item.destination_equipment_code,
        um: item.um,
        defectCode: item.defect_code,
        defectName: item.defect_name,
        reason: item.defect_name,
        observation: item.observation,
        attachments: (item.attachments || []).map((attachment) => ({
          id: attachment.id,
          name: attachment.file_name,
          type: attachment.content_type,
          size: attachment.size_bytes,
          storagePath: attachment.storage_path,
        })),
      })),
    },
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));
}
