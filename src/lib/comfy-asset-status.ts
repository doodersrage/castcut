import {
  COMFY_ASSET_CATALOG,
  assetIsDownloadable,
  catalogAssetsForModel,
  type ComfyCatalogAsset,
} from './comfy-asset-catalog';
import {
  assetFileExistsOnDisk,
  canWriteComfyModelsRoot,
  getComfyUiRoot,
  type ComfyAssetKind,
} from './comfy-asset-paths';

export type ComfyAssetInventory = {
  checkpoints?: string[];
  unets?: string[];
  vaes?: string[];
  loras?: string[];
  upscaleModels?: string[];
  clips?: string[];
  controlNets?: string[];
  faceRestoreModels?: string[];
};

export type ComfyAssetStatus = 'installed' | 'missing' | 'docs-only' | 'root-missing';

export type ComfyAssetStatusRow = {
  id: string;
  label: string;
  kind: ComfyAssetKind;
  filename: string;
  modelIds: string[];
  status: ComfyAssetStatus;
  downloadable: boolean;
  onDisk: boolean;
  inInventory: boolean;
  notes?: string;
  urlHost?: string;
  requiresHfToken?: boolean;
  /** Download size when the catalog knows it. */
  bytes?: number;
};

function inventoryListForKind(
  inventory: ComfyAssetInventory | null | undefined,
  kind: ComfyAssetKind
): string[] {
  if (!inventory) {
    return [];
  }
  switch (kind) {
    case 'checkpoint':
    case 'refiner':
      return inventory.checkpoints ?? [];
    case 'unet':
      return inventory.unets ?? [];
    case 'vae':
      return inventory.vaes ?? [];
    case 'lora':
      return inventory.loras ?? [];
    case 'upscale':
      return inventory.upscaleModels ?? [];
    case 'clip':
      return inventory.clips ?? [];
    case 'controlnet':
      return inventory.controlNets ?? [];
    case 'facerestore':
      return inventory.faceRestoreModels ?? [];
    default:
      return [];
  }
}

export function inventoryHasFilename(list: string[], filename: string): boolean {
  const trimmed = filename.trim();
  if (!trimmed) {
    return false;
  }
  const base = trimmed.split(/[/\\]/).pop() ?? trimmed;
  return list.some(entry => {
    const item = entry.trim();
    if (!item) {
      return false;
    }
    if (item === trimmed || item === base) {
      return true;
    }
    return item.endsWith(`/${base}`) || item.endsWith(`\\${base}`);
  });
}

export function buildComfyAssetStatusRows(input?: {
  inventory?: ComfyAssetInventory | null;
  modelId?: string;
  root?: string | null;
  catalog?: ComfyCatalogAsset[];
}): {
  rootConfigured: boolean;
  rootPath: string | null;
  rootWritable: boolean;
  rows: ComfyAssetStatusRow[];
} {
  const root = input?.root !== undefined ? input.root : getComfyUiRoot();
  const rootConfigured = Boolean(root);
  const rootWritable = canWriteComfyModelsRoot(root);
  const catalog = input?.modelId?.trim()
    ? catalogAssetsForModel(input.modelId)
    : (input?.catalog ?? COMFY_ASSET_CATALOG);

  const rows = catalog.map(asset => {
    const list = inventoryListForKind(input?.inventory, asset.kind);
    const inInventory = inventoryHasFilename(list, asset.filename);
    const onDisk =
      rootConfigured && root
        ? assetFileExistsOnDisk({
            root,
            kind: asset.kind,
            filename: asset.filename,
          })
        : false;
    const downloadable = assetIsDownloadable(asset);
    let status: ComfyAssetStatus;
    if (inInventory || onDisk) {
      status = 'installed';
    } else if (!rootConfigured) {
      status = downloadable ? 'root-missing' : 'docs-only';
    } else if (!downloadable) {
      status = 'docs-only';
    } else {
      status = 'missing';
    }

    let urlHost: string | undefined;
    if (asset.url) {
      try {
        urlHost = new URL(asset.url).hostname;
      } catch {
        urlHost = undefined;
      }
    }

    return {
      id: asset.id,
      label: asset.label,
      kind: asset.kind,
      ...(asset.bytes ? { bytes: asset.bytes } : {}),
      filename: asset.filename,
      modelIds: asset.modelIds.map(String),
      status,
      downloadable,
      onDisk,
      inInventory,
      notes: asset.notes,
      urlHost,
      requiresHfToken: asset.requiresHfToken,
    };
  });

  return { rootConfigured, rootPath: root, rootWritable, rows };
}
