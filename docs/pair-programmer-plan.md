Plan: Pair Programmer — implementação completa

TL;DR — O objetivo é um Pair Programmer que observa edições (qualitativas, não cada tecla), avisa por voz sobre problemas, aceita “pega o controle e implemente”, cria branch e implementa a correção enquanto fala e simula digitação em paralelo. Entregaremos um PoC rápido (local), depois uma versão Standard e depois a versão Full (streaming, full duplex).

### Steps (fases principais)
1. PoC: implementar extensão VS Code mínima e skill agent (novo `extensions/pair-programmer-vscode/` + `src/agents/pair-programmer`) — detecta problema simples, chama `openclaw agent` e faz TTS de alerta; aceita comando “pega o controle” simulado e aplica um patch simples em branch.
2. Standard: adicionar typing-simulator integrado (usar `TextEditor.edit` em VS Code), iniciar TTS em paralelo ao aplicar edições, adicionar STT/VAD cliente básico (WebSpeech/whisper.cpp) para reconhecer a frase de takeover e confirmação.
3. Safety + Git flow: branch por takeover, commits incrementais, rodar `dotnet build`/`test` antes de commit final; permitir undo/revert e política de confirmação para mudanças destrutivas.
4. Streaming & UX polish: se provider + infra permitirem, migrar para streaming tokens/TTS e streaming STT (WebSocket/WebRTC) para ter fala em tempo real enquanto o agente digita (Full).
5. Testes & E2E: adicionar testes unitários para a skill e mocks de STT/TTS; E2E que simula edição → takeover → teste/commit → handoff.

### Requisitos funcionais (versão inicial + evolução)
- Observar edições do usuário (VSCode) e detectar problemas por heurística/linter.
- Alertar por voz quando detectar problema (TTS).
- Aceitar comando de voz “pega o controle e implemente” (STT with VAD) e confirmar.
- Criar branch, aplicar patch incremental (WorkspaceEdit/git) e commitar; persistir histórico.
- Enquanto implementa, simular digitação e falar explicando em paralelo.
- Suportar hand-off: usuário pode interromper e reassumir o controle.
- Rodar testes (`dotnet build/test`) e não commitar se falharem.

### Requisitos não-funcionais
- Baixa latência para trigger de voz (VAD + quick STT).
- Segurança: gating de ações automáticas (confirmação), branch/undo obrigatório.
- Cross-platform (Windows/macOS/Linux + WSL caveats): áudio e GUI testing.
- Observabilidade e testes automáticos (ex.: Vitest e E2E).
- Privacidade: opção local-only (whisper.cpp, local TTS) ou cloud (cost + latency tradeoffs).

### Arquitetura proposta (componentes)
- VSCode extension (`extensions/pair-programmer-vscode`): captura eventos de edição, UI de confirmação, aplica typing-sim local ou recebe typing instructions do agent.
- Agent skill (`src/agents/pair-programmer`): lógica de detecção, policy, git branching, apply-patch tool, e orquestração de TTS/STT calls.
- Electron app (optional): voice bridge for continuous STT/VAD + plays TTS; útil para cross-IDE and system-wide voice.
- TTS / STT providers: Edge/OpenAI/ElevenLabs for TTS; WebSpeech or whisper/Deepgram for STT (poC: WebSpeech/whisper.cpp).
- Gateway integration: use existing `openclaw agent` RPC, `apply_patch` tool and `models` & `auth` plumbing.

### Testes recomendados
- Unit: skill agent logic + apply_patch behavior, stubs for STT/TTS.
- Integration: VSCode extension → agent CLI path (simulate `onDidChangeTextDocument` + `openclaw agent`).
- E2E: voice command → takeover → code change → run `dotnet build/test` (sandboxed), verify commit/branch.
- Mocks for STT/TTS providers in CI.

### Riscos & bloqueios
- Cliente (Electron + VSCode extension) está atualmente em repositório separado (coordenação necessária).
- Real-time STT/VAD + audio in WSL/Electron requires host audio integration (PulseAudio or host-level audio).
- Cost/licensing for cloud STT/TTS providers.
- Need strict safety (branch + confirmation) to avoid accidental destructive edits committed.

### Provedores & recomendações
- TTS: Edge TTS (já no repo), OpenAI TTS, ElevenLabs. Edge é um bom ponto de partida para baixa latência.
- STT: Deepgram (streaming, paid), OpenAI transcription (file-based), whisper.cpp (offline, local).
- VAD: `webrtcvad` or simple RMS threshold for PoC.

### Estimativas
- PoC (local, simulated STT, TTS): 1–2 semanas.
- Standard (integrated VSCode extension + agent skill + parallel TTS+typing sim + basic STT): 4–8 semanas.
- Full (streaming STT/TTS, robust cross-platform audio, E2E & infra): 12–16 semanas.

### Repositório: recomendado workflow
- Manter core agent infra (apply_patch, TTS providers, session storage) neste repo e desenvolver VSCode extension + Electron app em repositórios separados (como já é hoje). Integração via E2E tests e pipelines cross-repo.

### Próximo passo prático sugerido (PoC)
- Criar extensão mínima `extensions/pair-programmer-vscode/` que: registra comando `pair.detect` e ouve `workspace.onDidChangeTextDocument`; ao detectar uma regra simples (regex), chama `child_process.exec('openclaw agent --agent pair --message "Problema detectado: ..."')`. No agente criar um handler que chama TTS via utilitários já existentes para validar integração TTS → voz e caminho CLI → agent com o mínimo de infra.

Se você quiser, posso gerar o esqueleto do PoC (extensão VS Code + skill agent + teste unitário) agora — quer que eu gere os arquivos iniciais?
