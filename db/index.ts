import { drizzle } from "drizzle-orm/d1";
import { getCloudflareEnv } from "../lib/cloudflare-env";
import * as schema from "./schema";

export async function getDb() {
  const env = await getCloudflareEnv();
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB as Parameters<typeof drizzle>[0], { schema });
}
