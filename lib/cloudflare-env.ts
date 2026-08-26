type CloudflareBindings = {
  DB?: unknown;
  BUCKET?: {
    put: (key: string, value: ReadableStream, options?: unknown) => Promise<unknown>;
    get: (key: string) => Promise<{ body: BodyInit } | null>;
  };
};

export async function getCloudflareEnv(): Promise<CloudflareBindings> {
  const moduleName = "cloudflare:workers";
  const cloudflare = (await import(/* @vite-ignore */ moduleName)) as {
    env: CloudflareBindings;
  };

  return cloudflare.env;
}
