import { execSync } from "child_process";

export async function handlePairAgentMessage(message: string) {
  if (message.startsWith("Problema detectado:")) {
    const text = message.replace("Problema detectado:", "").trim();
    // PoC: use openclaw TTS via CLI for now
    try {
      execSync(`node /root/clawdbot-local/openclaw.mjs tts speak --text "Detectei: ${text}"`, {
        stdio: "inherit",
      });
    } catch (err) {
      console.error("Failed to call TTS", err);
    }
    return { status: "notified" };
  }

  if (/pega o controle/i.test(message)) {
    try {
      // Create a branch and commit a small change as PoC
      execSync("git checkout -b pair/takeover-poc", { stdio: "inherit" });
      execSync("printf '\n// fix applied by pair PoC\n' >> demo-poc.txt", { stdio: "inherit" });
      execSync('git add demo-poc.txt && git commit -m "PoC: takeover applied"', {
        stdio: "inherit",
      });
      execSync("git rev-parse --abbrev-ref HEAD", { stdio: "inherit" });
      execSync(
        `node /root/clawdbot-local/openclaw.mjs tts speak --text "Tomei o controle e apliquei a correção de demonstração"`,
        { stdio: "inherit" },
      );
    } catch (err) {
      console.error("pair takeover failed", err);
    }
    return { status: "took-control" };
  }

  return { status: "noop" };
}
