Pair Programmer Electron App — PoC

What: Simple Electron app that shows a floating avatar window and connects to gateway for TTS and STT. For PoC it just shows the window and supports a toggle button.

Bootstrap

1. cd apps/pair-programmer-app
2. pnpm install
3. pnpm start

Notes
- This is a starter; integrate STT/TTS and IPC with the gateway or use the existing `openclaw.mjs agent` CLI for probing.
