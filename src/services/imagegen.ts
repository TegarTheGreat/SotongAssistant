import { getCatalog } from "./catalog.js";
import { resolveApiKey } from "./ai/index.js";

/**
 * Image generation via the OpenAI images endpoint (the one models.dev
 * provider with a stable, widely-available image API). Tries gpt-image-1
 * first, falls back to dall-e-3 for accounts without access to it.
 * Returns undefined when no OpenAI key is configured.
 */

export async function generateImage(prompt: string): Promise<Buffer | undefined> {
  const provider = (await getCatalog())["openai"];
  const apiKey = provider ? resolveApiKey(provider) : undefined;
  if (!apiKey) return undefined;
  const base = (provider!.api ?? "https://api.openai.com/v1").replace(/\/$/, "");

  const request = async (model: string, extra: Record<string, unknown>) => {
    const res = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt: prompt.slice(0, 3000), n: 1, size: "1024x1024", ...extra }),
      signal: AbortSignal.timeout(120_000),
    });
    return res;
  };

  let res = await request("gpt-image-1", {});
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Accounts without gpt-image-1 access get a model/verification error.
    if (res.status === 400 || res.status === 403 || res.status === 404) {
      res = await request("dall-e-3", { response_format: "b64_json" });
    }
    if (!res.ok) {
      throw new Error(`image API ${res.status}: ${body.slice(0, 200)}`);
    }
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("image API returned no image data");
  return Buffer.from(b64, "base64");
}
