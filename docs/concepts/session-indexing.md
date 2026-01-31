# Session Indexing (RAG)

This document describes the optional *session indexing* feature that enables Retrieval-Augmented Generation (RAG) over historical session transcripts.

Why enable
- Improves recall by letting retrievers search past conversations (useful for support, follow-ups, and multi-turn context).

Trade-offs
- Indexing increases storage, CPU and embedding API usage; prefer summaries and incremental indexing for low-resource hosts (WSL).
- Sessions may contain PII; configure retention and opt-out per agent.

How it works (MVP)
- A periodic job reads session JSONL files from `~/.openclaw/agents/<id>/agent/sessions/` and converts them into text chunks.
- Chunks are converted to embeddings and upserted into a vector store (LanceDB by default) under a `session_index` table.
- The retriever can optionally include `sessions` as a source during memory search.

Configuration (conceptual)
- `agents.<id>.memorySearch.sources` can include `"sessions"`.
- `agents.<id>.memorySearch.sync.sessions` controls delta thresholds and watch behavior.
- Use `--summarize` or `summarizeBeforeIndex=true` to only index the last N turns.

Safety + retention
- Index only agents that opt-in (per-agent flag).
- Apply TTLs / maxAgeDays during indexing to avoid indexing old sessions.

Command

- `node scripts/rag/index-sessions.ts --agent <id> [--db <path>] [--summarize] [--maxAgeDays N]`

Example

- `node scripts/rag/index-sessions.ts --agent main --summarize --maxAgeDays 365`

