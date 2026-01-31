#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
function getLancedbModule(): typeof import("@lancedb/lancedb") | null {
  try {
    // require lazily so tests can mock/replace the module at runtime
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@lancedb/lancedb");
  } catch (err) {
    return null;
  }
}

function getOpenAIModule(): typeof import("openai") | null {
  try {
    // require lazily so tests can mock/replace the module at runtime
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("openai");
  } catch (err) {
    return null;
  }
}

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

function defaultSessionsDir(agentId = "main") {
  return path.join(os.homedir(), ".openclaw", "agents", agentId, "agent", "sessions");
}

function resolveDefaultDbPath() {
  return path.join(os.homedir(), ".openclaw", "memory", "lancedb");
}

async function ensureTable(dbPath: string, tableName: string, dim: number) {
  // If lancedb is not available, fall back to a JSONL file-based index
  const lancedb = getLancedbModule();
  if (!lancedb) {
    fs.mkdirSync(dbPath, { recursive: true });
    return null;
  }

  const db = await lancedb.connect(dbPath);
  console.debug('ensureTable: connected to lancedb mock');
  const tables = await db.tableNames();
  if (!tables.includes(tableName)) {
    const dummy = Array.from({ length: dim }).fill(0);
    await db.createTable(tableName, [{ id: "__schema__", text: "", vector: dummy, importance: 0, category: "session", createdAt: 0 }]);
    const t = await db.openTable(tableName);
    await t.delete("id = '__schema__'");
  }
  return db;
}

async function embedTextOpenAI(apiKey: string, model: string, text: string): Promise<number[]> {
  const OpenAI = getOpenAIModule();
  if (!OpenAI) throw new Error("OpenAI module not installed");
  const client = new OpenAI({ apiKey });
  const res = await client.embeddings.create({ model, input: text });
  return res.data[0].embedding as number[];
}

function mockEmbed(text: string, dim = 1536): number[] {
  // deterministic pseudo-embedding: use char codes
  const out = new Array(dim).fill(0);
  for (let i = 0; i < text.length && i < dim; i++) {
    out[i] = text.charCodeAt(i) % 256 / 255;
  }
  return out;
}

function chunkTextByChars(text: string, size = 1000, overlap = 128): string[] {
  const chunks: string[] = [];
  if (!Number.isFinite(size) || size <= 0) size = 1000;
  if (!Number.isFinite(overlap) || overlap < 0) overlap = 0;
  if (overlap >= size) overlap = Math.max(0, Math.floor(size / 10));
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + size, text.length);
    // push the chunk
    chunks.push(text.slice(i, end));

    // If we've reached the end of the text, stop to avoid repeating the last short chunk
    if (end >= text.length) break;

    const next = end - overlap;
    // Ensure progress: if next does not advance i, move forward by 1 to avoid infinite loops
    if (next <= i) {
      i = end; // jump to end and break on next loop iteration
    } else {
      i = next;
    }

    // Safety cap
    if (chunks.length > 10000) break;
  }
  return chunks;
}

export type IndexOptions = {
  agentId?: string;
  sessionsDir?: string;
  // optional in-memory sessions array for tests / e2e so we can avoid filesystem dependency
  sessions?: Array<{ name: string; content: string; mtimeMs?: number }>;
  dbPath?: string;
  embeddingModel?: string;
  openaiKey?: string;
  chunkSize?: number;
  overlap?: number;
  tableName?: string;
  maxAgeDays?: number | null;
  summarize?: boolean;
};

export async function indexSessions(opts: IndexOptions = {}) {
  const agentId = opts.agentId ?? "main";
  const sessionsDir = opts.sessionsDir ?? defaultSessionsDir(agentId);
  const dbPath = opts.dbPath ?? resolveDefaultDbPath();
  const chunkSize = opts.chunkSize ?? 1000;
  const overlap = opts.overlap ?? 128;
  const tableName = opts.tableName ?? "session_index";

  const openaiKey = opts.openaiKey ?? process.env.OPENAI_API_KEY;
  const embeddingModel = opts.embeddingModel ?? process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

  // If options provide an in-memory sessions array, use it (fast, test-friendly)
  let files: string[] = [];
  const inMemorySessions = opts.sessions && Array.isArray(opts.sessions) ? opts.sessions : null;
  if (inMemorySessions) {
    console.debug(`indexSessions: using inMemory sessions (${inMemorySessions.length})`);
    files = inMemorySessions.map((s) => s.name).filter((n) => n.endsWith(".jsonl"));
  } else {
    console.debug(`indexSessions: no inMemory sessions provided`);
    // Ensure sessions dir exists
    if (!fs.existsSync(sessionsDir)) {
      console.warn(`sessions directory not found: ${sessionsDir}`);
      return { indexed: 0 };
    }

    files = (await readdir(sessionsDir)).filter((f) => f.endsWith(".jsonl"));
    console.debug(`indexSessions: found ${files.length} session files in ${sessionsDir}`);
  }

  let indexed = 0;

  // Simple embedding dim selection (model -> dim). For safety choose common dim 1536.
  const embeddingDim = 1536;
  const db = await ensureTable(dbPath, tableName, embeddingDim);
  // db may be null when LanceDB isn't installed; only open tables when db is available.
  // We'll open the table lazily inside the per-chunk loop when needed.

  for (const file of files) {
    const full = path.join(sessionsDir, file);
    console.log(`indexSessions: processing file ${full}`);

    let raw: string;
    let st: { mtimeMs: number };

    if (inMemorySessions) {
      const sess = inMemorySessions.find((s) => s.name === file)!;
      raw = sess.content;
      st = { mtimeMs: typeof sess.mtimeMs === "number" ? sess.mtimeMs : Date.now() };
    } else {
      st = await stat(full);
      if (opts.maxAgeDays && opts.maxAgeDays > 0) {
        const ageMs = Date.now() - st.mtimeMs;
        if (ageMs > opts.maxAgeDays * 24 * 3600 * 1000) {
          // skip old sessions
          continue;
        }
      }

      raw = await readFile(full, "utf-8");
    }
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const msgs: string[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        // Expect { role: 'user'|'assistant'|'system', text: '...' }
        if (obj && typeof obj === "object") {
          const role = String(obj.role || obj.from || "").toLowerCase();
          if (role === "user" || role === "assistant") {
            const text = typeof obj.text === "string" ? obj.text : String(obj.content || "");
            msgs.push(`${role}: ${text}`);
          }
        }
      } catch (err) {
        // ignore malformed lines
      }
    }

    if (msgs.length === 0) {
      continue;
    }

    // For now summarize by taking last N messages if requested
    const sessionText = opts.summarize ? msgs.slice(-6).join("\n") : msgs.join("\n");

    const chunks = chunkTextByChars(sessionText, chunkSize, overlap);

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      let vector: number[];
      if (openaiKey) {
        try {
          vector = await embedTextOpenAI(openaiKey, embeddingModel, text);
        } catch (err) {
          console.warn("OpenAI embedding failed, falling back to mock embedding", err);
          vector = mockEmbed(text, embeddingDim);
        }
      } else {
        vector = mockEmbed(text, embeddingDim);
      }

      const entry = {
        id: `${path.basename(file, ".jsonl")}-${i}`,
        text,
        vector,
        importance: 0.5,
        category: "session",
        createdAt: st.mtimeMs,
      } as const;

          if (db) {
        console.debug(`indexSessions: adding entry ${entry.id} to LanceDB`);
        const table = await db.openTable(tableName);
        await table.add([entry]);
      } else {
        // fallback: write to JSONL file
        const outFile = path.join(dbPath, `${tableName}.jsonl`);
        fs.appendFileSync(outFile, JSON.stringify(entry) + "\n");
      }
      indexed++;
    }
  }

  return { indexed };
}

if (require.main === module) {
  (async () => {
    try {
      const argv = process.argv.slice(2);
      const params: IndexOptions = {};
      for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if ((a === "-a" || a === "--agent") && argv[i + 1]) {
          params.agentId = argv[++i];
        }
        if ((a === "-d" || a === "--db") && argv[i + 1]) {
          params.dbPath = argv[++i];
        }
        if (a === "--summarize") {
          params.summarize = true;
        }
        if (a === "--maxAgeDays" && argv[i + 1]) {
          params.maxAgeDays = Number(argv[++i]);
        }
      }

      const res = await indexSessions(params);
      console.log(`Indexed: ${res.indexed}`);
      process.exit(0);
    } catch (err) {
      console.error("Indexing failed:", err);
      process.exit(2);
    }
  })();
}
