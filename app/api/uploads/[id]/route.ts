import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attachments } from "../../../../db/schema";
import { getCloudflareEnv } from "../../../../lib/cloudflare-env";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const db = await getDb();
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!attachment) return new Response("Arquivo não encontrado.", { status: 404 });
  const env = await getCloudflareEnv();
  if (!env.BUCKET) return new Response("Armazenamento não configurado.", { status: 503 });
  const object = await env.BUCKET.get(attachment.objectKey);
  if (!object) return new Response("Arquivo não encontrado.", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": attachment.contentType,
      "content-disposition": `inline; filename="${attachment.fileName.replace(/\"/g, "")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
}
