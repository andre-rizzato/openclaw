Pair Programmer agent skill (PoC)

This skill will accept `openclaw agent --agent pair --message "..."` messages for PoC and perform simple actions:
- On `Problema detectado: ...` => speak via TTS using existing TTS utils and optionally create a session.
- On `pega o controle` => create a branch, apply a tiny patch (demo), and commit (PoC uses local git commands).

Files to add:
- `src/agents/pair-programmer/index.ts` (skill handler)
- Unit tests in `src/agents/pair-programmer.test.ts`
