import { loadComfyWorkflowFiles } from './comfyui-workflow-files';
import { readCachedComfyObjectInfo } from './comfyui-object-info-cache';

export type IdentityPackKind = 'ipadapter' | 'instantid' | 'pulid';

export type IdentityPackHealthStatus = 'ready' | 'detected' | 'missing';

export type IdentityPackHealth = {
  kind: IdentityPackKind;
  status: IdentityPackHealthStatus;
  label: string;
  detail?: string;
};

const IPADAPTER_NODE_PATTERN =
  /ipadapter(model)?loader|ipadapterapply|ipadapterunifiedloader|ipadapteradvanced/i;
const INSTANTID_NODE_PATTERN = /applyinstantid|instantidmodelloader|instantidfaceanalysis/i;
const PULID_NODE_PATTERN = /applypulid|pulidmodelloader|pulidevacliploader/i;
const IPADAPTER_SCAFFOLD_PATTERN = /ip[-_]?adapter/i;
const INSTANTID_SCAFFOLD_PATTERN = /instantid/i;
const PULID_SCAFFOLD_PATTERN = /pulid/i;

const KIND_META: Record<
  IdentityPackKind,
  { label: string; nodePattern: RegExp; scaffoldPattern: RegExp }
> = {
  ipadapter: {
    label: 'IP-Adapter',
    nodePattern: IPADAPTER_NODE_PATTERN,
    scaffoldPattern: IPADAPTER_SCAFFOLD_PATTERN,
  },
  instantid: {
    label: 'InstantID',
    nodePattern: INSTANTID_NODE_PATTERN,
    scaffoldPattern: INSTANTID_SCAFFOLD_PATTERN,
  },
  pulid: {
    label: 'PuLID',
    nodePattern: PULID_NODE_PATTERN,
    scaffoldPattern: PULID_SCAFFOLD_PATTERN,
  },
};

function hasNodeMatch(nodeTypes: Iterable<string> | null | undefined, pattern: RegExp): boolean {
  if (!nodeTypes) {
    return false;
  }
  for (const name of nodeTypes) {
    if (pattern.test(name)) {
      return true;
    }
  }
  return false;
}

function findScaffoldName(kind: IdentityPackKind): string | undefined {
  const pattern = KIND_META[kind].scaffoldPattern;
  const files = loadComfyWorkflowFiles();
  const match = files.find(file => pattern.test(`${file.name} ${file.filename ?? ''}`));
  return match?.name;
}

/**
 * IP-Adapter / InstantID / PuLID health for Settings chips + Play Identity ready.
 * Prefers live ComfyUI object_info inventory when cached; otherwise scaffold
 * presence in the workflow library.
 */
export function getIdentityPackHealth(
  kind: IdentityPackKind,
  availableNodeTypes?: Iterable<string> | null
): IdentityPackHealth {
  const meta = KIND_META[kind];
  const inventory = availableNodeTypes ?? readCachedComfyObjectInfo()?.nodeTypes ?? null;

  if (inventory && hasNodeMatch(inventory, meta.nodePattern)) {
    return {
      kind,
      status: 'ready',
      label: 'Ready',
      detail: `${meta.label} nodes installed`,
    };
  }

  const scaffoldName = findScaffoldName(kind);
  if (scaffoldName) {
    return {
      kind,
      status: 'detected',
      label: 'Detected',
      detail: scaffoldName,
    };
  }

  return {
    kind,
    status: 'missing',
    label: 'Missing',
    detail:
      inventory == null
        ? `No ${meta.label} scaffold in library (and Comfy inventory unavailable)`
        : `${meta.label} nodes not in ComfyUI inventory`,
  };
}

export function getIpAdapterHealth(
  availableNodeTypes?: Iterable<string> | null
): IdentityPackHealth {
  return getIdentityPackHealth('ipadapter', availableNodeTypes);
}

export function getInstantIdHealth(
  availableNodeTypes?: Iterable<string> | null
): IdentityPackHealth {
  return getIdentityPackHealth('instantid', availableNodeTypes);
}

export function getPulidHealth(availableNodeTypes?: Iterable<string> | null): IdentityPackHealth {
  return getIdentityPackHealth('pulid', availableNodeTypes);
}

/** True when at least one local identity pack can lock a Cast face. */
export function isIdentityPackReady(availableNodeTypes?: Iterable<string> | null): boolean {
  return (
    getIpAdapterHealth(availableNodeTypes).status === 'ready' ||
    getInstantIdHealth(availableNodeTypes).status === 'ready' ||
    getPulidHealth(availableNodeTypes).status === 'ready'
  );
}

/** Face lock present but no identity pack Ready — warn before queueing. */
export function shouldWarnIdentityPackMissing(input: {
  hasFaceLock: boolean;
  availableNodeTypes?: Iterable<string> | null;
}): boolean {
  return input.hasFaceLock && !isIdentityPackReady(input.availableNodeTypes);
}
