import * as vscode from 'vscode';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('pair.detect', () => {
    vscode.window.showInformationMessage('Pair.detect command triggered');
  });

  // Simple watcher: notify agent when a line contains BUG: or TODO:
  const disposableWatcher = vscode.workspace.onDidChangeTextDocument((e) => {
    for (const change of e.contentChanges) {
      if (/\b(BUG:|TODO:)\b/.test(change.text)) {
        const message = `Problema detectado: ${change.text.split('\n')[0].slice(0,200)}`;
        // NOTE: adjust the path to openclaw.mjs if needed
        exec(`node /root/clawdbot-local/openclaw.mjs agent --agent pair --message "${message}"`, (err, stdout, stderr) => {
          if (err) {
            console.error('Failed to notify agent', err, stderr);
            return;
          }
          console.log(stdout);
        });
        vscode.window.showInformationMessage('Pair: detected potential issue (sent to agent)');
      }
    }
  });

  context.subscriptions.push(disposable, disposableWatcher);
}

export function deactivate() {}
