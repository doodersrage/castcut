import {
  loadLocationBlocklist,
  saveLocationBlocklist,
  loadPromptHistoryStore,
  savePromptHistoryStore,
  PROMPT_HISTORY_LIMIT,
  type PromptHistoryEntry,
} from '@/lib/prompt-history';
import {
  loadSettingsCache,
  saveSettingsCache,
  SETTINGS_CACHE_KEY,
  type SettingsCache,
} from '@/lib/settings-cache';
import { loadScenePresets, saveScenePresets, type ScenePreset } from '@/lib/scene-presets';
import {
  loadUserTemplates,
  saveUserTemplates,
  type UserPromptTemplate,
} from '@/lib/user-templates';
import {
  loadComfyGallery,
  saveComfyGallery,
  type ComfyGalleryEntry,
} from '@/lib/gallery/comfyui-gallery';
import {
  loadComfyUiSettings,
  saveComfyUiSettings,
  type ComfyUiSettings,
} from '@/lib/comfyui/settings';
import {
  loadComfyWorkflowFiles,
  saveComfyWorkflowFiles,
  type ComfyWorkflowFile,
} from '@/lib/comfyui/workflow-files';
import {
  loadComfyWorkflowPresets,
  saveComfyWorkflowPresets,
  type ComfyWorkflowPreset,
} from '@/lib/comfyui/workflow-presets';
import { exportAvoidedTokenList, saveAvoidedTokens } from '@/lib/avoided-tokens';
import { WEBHOOK_LOG_KEY, loadWebhookLog, type WebhookLogEntry } from '@/lib/webhook-log';
import { writeBrowserValue } from '@/lib/browser-storage';
import {
  loadActiveProjectId,
  loadPromptProjects,
  savePromptProjects,
  setActiveProjectId,
  type PromptProject,
} from '@/lib/prompt-projects';
import {
  loadScheduledBatchConfig,
  saveScheduledBatchConfig,
  type ScheduledBatchConfig,
} from '@/lib/scheduled-batch';
import {
  loadWebhookSettings,
  saveWebhookSettings,
  type WebhookSettings,
} from '@/lib/webhook-settings';
import { loadSessionRecipes, saveSessionRecipes, type SessionRecipe } from '@/lib/session-recipes';
import {
  loadUserNsfwGeneratorPresets,
  loadNsfwPresetPrefs,
  saveNsfwPresetPrefs,
  saveUserNsfwGeneratorPresets,
  type NsfwPresetPrefs,
  type UserNsfwGeneratorPreset,
} from '@/lib/user-nsfw-generator-presets';
import {
  applyStudioExtras,
  collectStudioExtras,
  type StudioExtrasPayload,
} from '@/lib/studio-extras';

export type StudioBackupV1 = {
  version: 1;
  exportedAt: string;
  history: PromptHistoryEntry[];
  locationBlocklist: string[];
  settings: SettingsCache;
  scenePresets?: ScenePreset[];
  userTemplates?: UserPromptTemplate[];
};

export type StudioBackupV2 = Omit<StudioBackupV1, 'version'> & {
  version: 2;
  comfyUiSettings?: ComfyUiSettings;
  comfyGallery?: ComfyGalleryEntry[];
  comfyWorkflowPresets?: ComfyWorkflowPreset[];
  comfyWorkflowFiles?: ComfyWorkflowFile[];
};

export type StudioBackupV3 = Omit<StudioBackupV2, 'version'> & {
  version: 3;
  avoidedTokens?: string[];
  webhookLog?: WebhookLogEntry[];
  promptProjects?: PromptProject[];
  activeProjectId?: string;
  scheduledBatch?: ScheduledBatchConfig;
  webhookSettings?: WebhookSettings;
};

export type StudioBackupV4 = Omit<StudioBackupV3, 'version'> & {
  version: 4;
  sessionRecipes?: SessionRecipe[];
  userNsfwGeneratorPresets?: UserNsfwGeneratorPreset[];
  nsfwPresetPrefs?: NsfwPresetPrefs;
};

export type StudioBackupV5 = Omit<StudioBackupV4, 'version'> & {
  version: 5;
  extras?: StudioExtrasPayload;
};

export type StudioBackup =
  StudioBackupV1 | StudioBackupV2 | StudioBackupV3 | StudioBackupV4 | StudioBackupV5;

export const STUDIO_BACKUP_VERSIONS = [1, 2, 3, 4, 5] as const;

export function isSupportedStudioBackupVersion(
  version: unknown
): version is (typeof STUDIO_BACKUP_VERSIONS)[number] {
  return version === 1 || version === 2 || version === 3 || version === 4 || version === 5;
}

export function exportStudioBackup(): StudioBackupV5 {
  return {
    version: 5,
    exportedAt: new Date().toISOString(),
    history: loadHistoryFromStorage(),
    locationBlocklist: loadLocationBlocklist(),
    settings: loadSettingsCache(),
    scenePresets: loadScenePresets(),
    userTemplates: loadUserTemplates(),
    comfyUiSettings: loadComfyUiSettings(),
    comfyGallery: loadComfyGallery(),
    comfyWorkflowPresets: loadComfyWorkflowPresets(),
    comfyWorkflowFiles: loadComfyWorkflowFiles(),
    avoidedTokens: exportAvoidedTokenList(),
    webhookLog: loadWebhookLog(),
    promptProjects: loadPromptProjects(),
    activeProjectId: loadActiveProjectId(),
    scheduledBatch: loadScheduledBatchConfig(),
    webhookSettings: loadWebhookSettings(),
    sessionRecipes: loadSessionRecipes(),
    userNsfwGeneratorPresets: loadUserNsfwGeneratorPresets(),
    nsfwPresetPrefs: loadNsfwPresetPrefs(),
    extras: collectStudioExtras(),
  };
}

export function importStudioBackup(backup: StudioBackup): void {
  if (!isSupportedStudioBackupVersion(backup.version)) {
    throw new Error('Unsupported backup version.');
  }

  const version = backup.version;
  const payload = backup as StudioBackupV5;

  savePromptHistoryStore(payload.history.slice(0, PROMPT_HISTORY_LIMIT));
  saveLocationBlocklist(payload.locationBlocklist);
  saveSettingsCache(payload.settings);
  if (payload.scenePresets) {
    saveScenePresets(payload.scenePresets);
  }
  if (payload.userTemplates) {
    saveUserTemplates(payload.userTemplates);
  }

  if (version >= 2) {
    if (payload.comfyUiSettings) {
      saveComfyUiSettings(payload.comfyUiSettings);
    }
    if (payload.comfyGallery) {
      saveComfyGallery(payload.comfyGallery);
    }
    if (payload.comfyWorkflowPresets) {
      saveComfyWorkflowPresets(payload.comfyWorkflowPresets);
    }
    if (payload.comfyWorkflowFiles) {
      saveComfyWorkflowFiles(payload.comfyWorkflowFiles, { fromSync: true });
    }
  }

  if (version >= 3) {
    if (payload.avoidedTokens) {
      saveAvoidedTokens(payload.avoidedTokens);
    }
    if (payload.webhookLog) {
      writeBrowserValue(WEBHOOK_LOG_KEY, payload.webhookLog);
    }
    if (payload.promptProjects) {
      savePromptProjects(payload.promptProjects);
    }
    if (payload.activeProjectId) {
      setActiveProjectId(payload.activeProjectId);
    } else {
      setActiveProjectId(undefined);
    }
    if (payload.scheduledBatch) {
      saveScheduledBatchConfig(payload.scheduledBatch);
    }
    if (payload.webhookSettings) {
      saveWebhookSettings(payload.webhookSettings);
    }
  }

  if (version >= 4) {
    if (payload.sessionRecipes) {
      saveSessionRecipes(payload.sessionRecipes);
    }
    if (payload.userNsfwGeneratorPresets) {
      saveUserNsfwGeneratorPresets(payload.userNsfwGeneratorPresets);
    }
    if (payload.nsfwPresetPrefs) {
      saveNsfwPresetPrefs(payload.nsfwPresetPrefs);
    }
  }

  if (version >= 5 && payload.extras) {
    applyStudioExtras(payload.extras);
  }
}

export function downloadStudioBackup(): void {
  const payload = JSON.stringify(exportStudioBackup(), null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `prompt-studio-backup-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function loadHistoryFromStorage(): PromptHistoryEntry[] {
  try {
    return loadPromptHistoryStore();
  } catch {
    return [];
  }
}

export function parseStudioBackupFile(raw: string): StudioBackup {
  const parsed = JSON.parse(raw) as StudioBackup;
  if (
    !parsed ||
    !isSupportedStudioBackupVersion(parsed.version) ||
    !Array.isArray(parsed.history)
  ) {
    throw new Error('Invalid studio backup file.');
  }
  return parsed;
}

export function downloadHistoryExport(entries: PromptHistoryEntry[]): void {
  const payload = JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
    },
    null,
    2
  );
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `prompt-history-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { SETTINGS_CACHE_KEY };
