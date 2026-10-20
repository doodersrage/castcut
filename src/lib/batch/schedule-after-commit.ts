/** Run after the current commit (avoids react-hooks/set-state-in-effect). */
export function scheduleAfterCommit(callback: () => void): void {
  queueMicrotask(callback);
}
