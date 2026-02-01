import { Type } from "@sinclair/typebox";

import { loadConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";
import {
  createAgentToAgentPolicy,
  resolveMainSessionAlias,
  resolveInternalSessionKey,
  resolveSessionReference,
  isSubagentSessionKey,
  resolveAgentIdFromSessionKey,
} from "./sessions-helpers.js";
import { fetchSessionContext } from "./session-retrieval.js";

const SessionRetrievalSchema = Type.Object({
  query: Type.String({ description: "Search query string." }),
  k: Type.Optional(Type.Number({ minimum: 1 })),
  sessionKey: Type.Optional(
    Type.String({ description: "Optional session key or session id to restrict search." }),
  ),
});

function resolveSessionRetrievalEnabled(cfg: ReturnType<typeof loadConfig>) {
  return Boolean(cfg.tools?.sessions?.retrieval?.enabled === true);
}

export function createSessionRetrievalTool(opts?: {
  agentSessionKey?: string;
  sandboxed?: boolean;
  config?: ReturnType<typeof loadConfig>;
}): AnyAgentTool | null {
  const cfg = opts?.config ?? loadConfig();
  if (!resolveSessionRetrievalEnabled(cfg)) return null;

  return {
    label: "Session Search",
    name: "sessions_search",
    description:
      "Search indexed session transcripts. Use a sessionKey to restrict results to a specific session id or key.",
    parameters: SessionRetrievalSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true });
      const k = readNumberParam(params, "k");
      const sessionKeyParam = readStringParam(params, "sessionKey");

      const { mainKey, alias } = resolveMainSessionAlias(cfg);
      const requesterInternalKey =
        typeof opts?.agentSessionKey === "string" && opts.agentSessionKey.trim()
          ? resolveInternalSessionKey({ key: opts?.agentSessionKey, alias, mainKey })
          : undefined;

      const restrictToSpawned = false; // For now, do not restrict by spawned visibility here.

      if (sessionKeyParam) {
        const resolved = await resolveSessionReference({
          sessionKey: sessionKeyParam,
          alias,
          mainKey,
          requesterInternalKey,
          restrictToSpawned,
        });
        if (!resolved.ok) {
          return jsonResult({ status: resolved.status, error: resolved.error });
        }
        const displayKey = resolved.displayKey;
        const resolvedKey = resolved.key;

        const a2aPolicy = createAgentToAgentPolicy(cfg);
        const requesterAgentId = resolveAgentIdFromSessionKey(requesterInternalKey);
        const targetAgentId = resolveAgentIdFromSessionKey(resolvedKey);
        const isCrossAgent = requesterAgentId !== targetAgentId;
        if (isCrossAgent) {
          if (!a2aPolicy.enabled) {
            return jsonResult({
              status: "forbidden",
              error: "Agent-to-agent session search is disabled.",
            });
          }
          if (!a2aPolicy.isAllowed(requesterAgentId, targetAgentId)) {
            return jsonResult({
              status: "forbidden",
              error: "Agent-to-agent session search denied by policy.",
            });
          }
        }
      }

      try {
        const hits = await fetchSessionContext({ query, k: k ?? undefined });
        return jsonResult({ results: hits });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ results: [], status: "error", error: message });
      }
    },
  };
}
