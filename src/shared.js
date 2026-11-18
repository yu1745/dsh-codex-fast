export const packageName = '@yu1745/dsh-codex-fast';
export const remoteName = 'yuStandaloneCodexSpeed';
export function isCodex(selection) {
  return selection?.provider === 'openai-codex' ||
    (selection?.provider === 'magpie-responses' && selection.model?.startsWith('codex/'));
}
