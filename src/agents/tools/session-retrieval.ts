import { searchSessions } from "../session-search.js";
import { incrementSearchCount } from "../session-metrics.js";

export type SessionRetrievalParams = {
  query: string;
  k?: number;
  dbPath?: string;
  tableName?: string;
};

export async function fetchSessionContext(params: SessionRetrievalParams) {
  const start = Date.now();
  const hits = await searchSessions({
    query: params.query,
    k: params.k ?? 5,
    dbPath: params.dbPath,
    tableName: params.tableName,
  });
  const duration = Date.now() - start;
  incrementSearchCount(1, duration);
  return hits;
}
