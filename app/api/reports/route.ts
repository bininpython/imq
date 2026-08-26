import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { shiftReports } from "../../../db/schema";

export async function GET() {
  try {
    const rows = await getDb().select().from(shiftReports).orderBy(desc(shiftReports.createdAt)).limit(100);
    return Response.json({ reports: rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os relatórios." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string; reportDate?: string; shift?: string; reporter?: string; status?: string;
      deviations?: unknown[]; payload?: Record<string, unknown>;
    };
    if (!body.reportDate || !body.shift || !body.reporter) {
      return Response.json({ error: "Data, turno e responsável são obrigatórios." }, { status: 400 });
    }
    const id = body.id || crypto.randomUUID();
    const deviations = Array.isArray(body.deviations) ? body.deviations : [];
    const payload = { ...(body.payload || {}), deviations };
    const [report] = await getDb().insert(shiftReports).values({
      id,
      reportDate: body.reportDate,
      shift: body.shift,
      reporter: body.reporter.trim(),
      status: body.status || "finalizado",
      payload: JSON.stringify(payload),
      deviationCount: deviations.length,
    }).returning();
    return Response.json({ report: { ...report, payload } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o relatório." }, { status: 500 });
  }
}
