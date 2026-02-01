import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function getLancedbModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@lancedb/lancedb");
  } catch (err) {
    return null;
  }
}

function getOpenAIModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("openai");
  } catch (err) {
    return null;
  }
}

function mockEmbed(text: string, dim = 1536): number[] {
  const out = new Array(dim).fill(0);
  for (let i = 0; i < text.length && i < dim; i++) {
    out[i] = (text.charCodeAt(i) % 256) / 255;
  }
  return out;
}

// Use embedding cache with rate-limit and TTL
import { getEmbedding } from "./embed-cache.js";

async function embedTextOpenAI(
  apiKey: string | undefined,
  model: string,
  text: string,
  dim = 1536,
): Promise<number[]> {
  try {
    const vec = await getEmbedding(text, { apiKey, model, dim });
    return vec;
  } catch (err) {
    return mockEmbed(text, dim);
  }
}

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
}
function norm(a: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

export type SearchResult = {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, any>;
};

export type SearchOptions = {
  query: string;
  k?: number;
  dbPath?: string;
  tableName?: string;
  openaiKey?: string;
  embeddingModel?: string;
  embeddingDim?: number;
  // optional override to inject a LanceDB-like module (useful for tests)
  lancedbModule?: any;
};

export async function searchSessions(opts: SearchOptions): Promise<SearchResult[]> {
  const k = opts.k ?? 5;
  const dbPath = opts.dbPath ?? path.join(os.homedir(), ".openclaw", "memory", "lancedb");
  const tableName = opts.tableName ?? "session_index";
  const openaiKey = opts.openaiKey ?? process.env.OPENAI_API_KEY;
  const embeddingModel =
    opts.embeddingModel ?? process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const dim = opts.embeddingDim ?? 1536;

  const start = Date.now();
  const qvec = await embedTextOpenAI(openaiKey, embeddingModel, opts.query, dim);

  // allow injection for deterministic tests
  const lancedb = opts.lancedbModule ?? getLancedbModule();
  if (lancedb) {
    try {
      const db = await lancedb.connect(dbPath);
      const table = await db.openTable(tableName);
      // If the table provides a search method, use it.
      if (typeof (table as any).search === "function") {
        const hits = await (table as any).search({ vector: qvec, k });
        const out = (hits as any[]).map((h: any) => ({
          id: h.id,
          text: h.text ?? "",
          score: h.score ?? 0,
          metadata: h,
        }));
        try {
          const metrics = require("./session-metrics.js");
          if (metrics && typeof metrics.incrementSearchCount === "function")
            metrics.incrementSearchCount(1, Date.now() - start);
        } catch (e) {}
        return out;
      }
      // else, fall through to JSONL fallback
    } catch (err) {
      // swallow and fallback to JSONL
      console.debug("LanceDB search failed, falling back to JSONL", err);
    }
  }

  // JSONL fallback
  const outFile = path.join(dbPath, `${tableName}.jsonl`);
  if (!fs.existsSync(outFile)) return [];
  const lines = fs.readFileSync(outFile, "utf-8").split(/\r?\n/).filter(Boolean);
  const parsed = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean) as Array<{ id: string; text: string; vector: number[]; [k: string]: any }>;

  const results = parsed.map((entry) => {
    const v = entry.vector || [];
    let score = 0;
    if (v.length === qvec.length && v.length > 0) {
      const denom = norm(v) * norm(qvec);
      score = denom === 0 ? 0 : dot(v, qvec) / denom;
    }
    return { id: entry.id, text: entry.text ?? "", score, metadata: entry };
  });

  results.sort((a, b) => b.score - a.score);
  const out = results.slice(0, k);
  try {
    const metrics = require("./session-metrics.js");
    if (metrics && typeof metrics.incrementSearchCount === "function")
      metrics.incrementSearchCount(1, Date.now() - start);
  } catch (e) {}
  return out;
}
