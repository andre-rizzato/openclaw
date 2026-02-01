import { performance } from "node:perf_hooks";
function getOpenAIModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("openai");
  } catch (err) {
    return null;
  }
}

export type EmbedOptions = {
  apiKey?: string;
  model?: string;
  dim?: number;
  // TTL in ms
  ttlMs?: number;
  // Minimum interval between outbound OpenAI calls in ms (rate limit throttle)
  minIntervalMs?: number;
  // optional injection for tests
  openaiModule?: any;
};

const defaultOpts: Partial<EmbedOptions> = {
  dim: 1536,
  ttlMs: 1000 * 60 * 60, // 1h
  minIntervalMs: 200, // 5 req/sec
};

type CacheEntry = { vec: number[]; ts: number };

const cache = new Map<string, CacheEntry>();
let lastCallTs = 0;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function getEmbedding(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  const o = { ...defaultOpts, ...opts } as EmbedOptions;
  const key = `e:${o.model ?? "default"}:${text}`;
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && now - existing.ts < (o.ttlMs ?? 0)) {
    return existing.vec;
  }

  const OpenAI = o.openaiModule ?? getOpenAIModule();
  if (!OpenAI) {
    // deterministic fallback
    const vec = new Array(o.dim ?? 1536).fill(0);
    for (let i = 0; i < text.length && i < vec.length; i++)
      vec[i] = (text.charCodeAt(i) % 256) / 255;
    cache.set(key, { vec, ts: now });
    return vec;
  }

  // throttle to respect minIntervalMs
  const since = now - lastCallTs;
  const wait = (o.minIntervalMs ?? 0) - since;
  if (wait > 0) await sleep(wait);

  lastCallTs = Date.now();

  // perform embedding
  // OpenAI may be a constructor or a pre-instantiated client (in tests)
  let client: any;
  if (typeof OpenAI === "function") {
    client = new OpenAI({ apiKey: o.apiKey });
  } else {
    client = OpenAI;
  }
  const res = await client.embeddings.create({ model: o.model, input: text });
  const vec = (res.data && res.data[0] && (res.data[0] as any).embedding) as number[];
  cache.set(key, { vec, ts: Date.now() });
  return vec;
}

// Helper for testability
export function _clearCache() {
  cache.clear();
}

export function _getCacheSize() {
  return cache.size;
}
