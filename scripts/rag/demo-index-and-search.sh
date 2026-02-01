#!/usr/bin/env bash
set -eu

tmpdir=$(mktemp -d)
table=session_index
outfile="$tmpdir/${table}.jsonl"

node - <<'NODE'
const fs = require('fs');
const t1 = 'hello demo';
const t2 = 'unrelated';
function vec(text, dim=10){ const out = new Array(dim).fill(0); for(let i=0;i<text.length&&i<dim;i++) out[i] = (text.charCodeAt(i)%256)/255; return out }
const a = { id: 's-demo-1', text: t1, vector: vec(t1) };
const b = { id: 's-demo-2', text: t2, vector: vec(t2) };
fs.writeFileSync(process.argv[1], JSON.stringify(a) + '\n' + JSON.stringify(b) + '\n');
NODE

echo "Wrote demo index to $outfile"

echo "Running search-sessions for 'hello demo'..."
pnpm -w -s tsx scripts/rag/search-sessions.ts "hello demo" 1 "$tmpdir"

echo "Done."
