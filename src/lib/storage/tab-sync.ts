const CHANNEL = 'comfy-prompt-studio-sync-v1';

export type TabSyncMessage =
  | { type: 'gallery-updated' }
  | { type: 'history-updated' }
  | { type: 'settings-updated' }
  | { type: 'avoided-tokens-updated' };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  // Node 22+ exposes BroadcastChannel globally; only wire cross-tab sync in browsers.
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof BroadcastChannel === 'undefined'
  ) {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL);
  }
  return channel;
}

export function broadcastTabSync(message: TabSyncMessage): void {
  getChannel()?.postMessage(message);
}

export function subscribeTabSync(handler: (message: TabSyncMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) {
    return () => undefined;
  }
  const listener = (event: MessageEvent<TabSyncMessage>) => {
    if (event.data?.type) {
      handler(event.data);
    }
  };
  ch.addEventListener('message', listener);
  return () => ch.removeEventListener('message', listener);
}
