import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attachments } from "../../../../db/schema";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [attachment] = await getDb().select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!attachment) return new Response("Arquivo não encontrado.", { status: 404 });
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
