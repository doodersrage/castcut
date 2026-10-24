/**
 * The Switching ComfyUI assistant's report and job shapes (types only), shared by the server
 * (install-server.ts) and the Settings panel.
 */

import type { ComfyInstallInfo } from './install-info';
import type { ComfyNodePackState } from './node-pack-catalog';

export type FolderAccess = { path: string; exists: boolean; readable: boolean; writable: boolean };

export type ComfyInstallReport = {
  reachable: boolean;
  url: string;
  /** Same machine as the app (its folders can be checked and copied). */
  local: boolean;
  label?: string;
  info?: ComfyInstallInfo;
  identity?: string;
  folders?: { input?: FolderAccess; output?: FolderAccess; models?: FolderAccess };
  /** A different install than the one set up last (until the player marks it done). */
  isNew: boolean;
  previous?: {
    label: string;
    version?: string;
    seenAt: number;
    input?: FolderAccess & { files?: number; bytes?: number };
    output?: FolderAccess & { files?: number; bytes?: number };
  };
  downloads: {
    /** Where model downloads go now (`<root>/models`), and why. */
    root: string | null;
    source: 'saved' | 'env' | 'none';
    envRoot: string | null;
    /** The folder this ComfyUI reads models from says the root should be this. */
    suggestedRoot?: string;
    /** Downloads land where this ComfyUI looks. */
    matches: boolean | null;
  };
  kept: { files: number; bytes: number };
  packs: Array<{
    id: string;
    label: string;
    usedFor: string;
    state: ComfyNodePackState;
    fix?: { command: string; note: string };
  }>;
};

export type ComfyInstallJob = {
  id: string;
  kind: 'restore-pictures' | 'copy-folders';
  status: 'running' | 'completed' | 'error';
  done: number;
  total: number;
  /** Files put in place, and ones already there. */
  copied: number;
  skipped: number;
  failed: number;
  bytes: number;
  error?: string;
};
