import { getDb } from "../../../db";
import { attachments } from "../../../db/schema";
import { getCloudflareEnv } from "../../../lib/cloudflare-env";

const MAX_SIZE = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const reportId = String(form.get("reportId") || "");
    if (!(file instanceof File) || !reportId) {
      return Response.json({ error: "Arquivo e relatório são obrigatórios." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return Response.json({ error: "O arquivo deve ter no máximo 50 MB." }, { status: 400 });
    }
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      return Response.json({ error: "Envie somente foto ou vídeo." }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const objectKey = `reports/${reportId}/${id}-${safeName}`;
    const env = await getCloudflareEnv();
    if (!env.BUCKET) throw new Error("O armazenamento de evidências não está configurado.");
    await env.BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
    const db = await getDb();
    const [attachment] = await db.insert(attachments).values({
      id, reportId, objectKey, fileName: file.name, contentType: file.type, size: file.size,
    }).returning();
    return Response.json({ attachment }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao enviar arquivo." }, { status: 500 });
  }
}
