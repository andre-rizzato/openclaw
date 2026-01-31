# Session retrieval & search

This document describes how session indexing and retrieval works (Step 11 MVP).

## Overview

- The agent can index session content into a vector index (LanceDB) via the opt-in indexer (`scripts/rag/index-sessions.ts`).
- When LanceDB is not available, the indexer falls back to writing a JSONL file at `<dbPath>/session_index.jsonl`.
- The retrieval API (`src/agents/session-search.ts`) provides a simple search interface that uses LanceDB when available and performs a linear cosine-similarity scan over the JSONL fallback file otherwise.

## Usage (programmatic)

Import the search helper:

```ts
import { searchSessions } from "src/agents/session-search";

const hits = await searchSessions({
  query: "remember that I like cats",
  k: 5,
  dbPath: "/tmp/lancedb-test",
  tableName: "session_index",
});

// hits -> [{ id, text, score, metadata }, ...]
```

## Notes

- The function attempts to use an OpenAI embedding (via the optional `openai` package) to embed queries; it falls back to a deterministic mock embedding when OpenAI is not available.
- Tests include both a mocked LanceDB path and a JSONL fallback path for deterministic behavior in CI.
