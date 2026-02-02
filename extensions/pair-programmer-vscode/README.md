Pair Programmer — VS Code extension (PoC)

What: Minimal PoC extension that watches edits and notifies the agent when a simple heuristic (e.g. `BUG:` or `TODO`) is detected.

Bootstrap

1. cd extensions/pair-programmer-vscode
2. pnpm install
3. pnpm build
4. Press F5 in VS Code to launch the extension host (development host)

PoC behavior

- Registers a `pair.detect` command and listens to `onDidChangeTextDocument`.
- On detection, runs `openclaw agent --agent pair --message "Problema detectado: <desc>"` (PoC uses a shell exec; adjust path to `openclaw.mjs`).

Notes

- This is intentionally minimal: the next step is to implement the `src/agents/pair-programmer` skill for the agent side.
