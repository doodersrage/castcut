'use client';

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  loadWorkspaceMode,
  WORKSPACE_MODE_CHANGED_EVENT,
  type WorkspaceMode,
} from '@/lib/app/workspace-mode';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

const WorkspaceModeContext = createContext<WorkspaceMode>('simple');

export function WorkspaceModeProvider({
  initialMode,
  children,
}: {
  initialMode: WorkspaceMode;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<WorkspaceMode>(initialMode);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setMode(loadWorkspaceMode());
    });
    const sync = () => setMode(loadWorkspaceMode());
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    window.addEventListener(WORKSPACE_MODE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener(WORKSPACE_MODE_CHANGED_EVENT, sync);
    };
  }, []);

  return createElement(WorkspaceModeContext.Provider, { value: mode }, children);
}

/** Live workspace mode for progressive disclosure in tool chrome. */
export function useWorkspaceMode(): WorkspaceMode {
  return useContext(WorkspaceModeContext);
}
