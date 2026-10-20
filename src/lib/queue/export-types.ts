export type StoredQueueExportConfig = {
  enabled?: boolean;
  dir?: string;
};

export type PublicQueueExportConfig = {
  persisted: boolean;
  enabled: boolean;
  dir: string;
  envDir: string;
  envWins: boolean;
};
