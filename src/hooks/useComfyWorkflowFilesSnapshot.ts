'use client';

import { useEffect, useState } from 'react';
import {
  COMFY_WORKFLOW_FILES_UPDATED_EVENT,
  loadComfyWorkflowFiles,
  type ComfyWorkflowFile,
} from '@/lib/comfyui-workflow-files';

/** The workflow library, re-read whenever it is saved in this tab. */
export function useComfyWorkflowFilesSnapshot(): ComfyWorkflowFile[] {
  const [files, setFiles] = useState<ComfyWorkflowFile[]>([]);
  useEffect(() => {
    const refresh = () => setFiles(loadComfyWorkflowFiles());
    refresh();
    window.addEventListener(COMFY_WORKFLOW_FILES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COMFY_WORKFLOW_FILES_UPDATED_EVENT, refresh);
  }, []);
  return files;
}
