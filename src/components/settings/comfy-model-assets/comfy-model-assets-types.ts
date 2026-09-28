import type { ComfyAssetKind } from '@/lib/comfy-asset-kinds';

export type AssetRow = {
  id: string;
  label: string;
  kind: ComfyAssetKind | string;
  filename: string;
  modelIds: string[];
  status: 'installed' | 'missing' | 'docs-only' | 'root-missing';
  downloadable: boolean;
  onDisk: boolean;
  inInventory: boolean;
  notes?: string;
  urlHost?: string;
  requiresHfToken?: boolean;
  bytes?: number;
};

export type AssetJob = {
  id: string;
  assetId: string;
  label: string;
  filename: string;
  status: string;
  progress: number;
  bytesReceived: number;
  bytesTotal: number | null;
  error?: string;
  attempt?: number;
  runAttempt?: number;
};

export type AssetsResponse = {
  ok?: boolean;
  rootConfigured?: boolean;
  rootWritable?: boolean;
  rootPath?: string | null;
  rootHint?: string;
  rows?: AssetRow[];
  jobs?: AssetJob[];
  error?: string;
};

export type ComfyModelAssetsPanelProps = {
  onStatus?: (message: string) => void;
  onInstalled?: () => void;
  /** When set, only show assets for this model and hide the current-model toggle. */
  modelId?: string;
  /** Tighter layout for embedding on a tool page. */
  compact?: boolean;
};
