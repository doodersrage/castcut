'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import { runGalleryImageImport } from '@/components/gallery/GalleryUploadButton';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import { type ParamExperimentAxis } from '@/lib/experiment/param-experiment-queue';

export type GalleryPanelUiState = {
  downloadError: string | null;
  setDownloadError: Dispatch<SetStateAction<string | null>>;
  requeueStatus: string | null;
  setRequeueStatus: Dispatch<SetStateAction<string | null>>;
  compareOpen: boolean;
  setCompareOpen: Dispatch<SetStateAction<boolean>>;
  openCompare: () => void;
  capWizardOpen: boolean;
  setCapWizardOpen: (value: boolean) => void;
  visionInboxOpen: boolean;
  setVisionInboxOpen: (value: boolean) => void;
  visionInboxSkipIds: Set<string>;
  setVisionInboxSkipIds: Dispatch<SetStateAction<Set<string>>>;
  loraExportOpen: boolean;
  setLoraExportOpen: (value: boolean) => void;
  loraExportScope: 'favorites' | 'selected';
  setLoraExportScope: (value: 'favorites' | 'selected') => void;
  workflowEntry: ComfyGalleryEntry | null;
  setWorkflowEntry: (value: ComfyGalleryEntry | null) => void;
  collapsedLineageGroups: Set<string>;
  collapsedExperimentGroups: Set<string>;
  toggleLineageGroup: (rootId: string) => void;
  toggleExperimentGroup: (groupId: string) => void;
  paramAxis: ParamExperimentAxis;
  setParamAxis: (value: ParamExperimentAxis) => void;
  galleryEntriesSettled: boolean;
  setGalleryEntriesSettled: (value: boolean) => void;
  uploadingImages: boolean;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  importDroppedImages: (files: File[]) => Promise<void>;
};

export function useGalleryPanelUiState(searchParams: ReadonlyURLSearchParams): GalleryPanelUiState {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [requeueStatus, setRequeueStatus] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const openCompare = useCallback(() => setCompareOpen(true), []);
  const [capWizardOpen, setCapWizardOpen] = useState(false);
  const [visionInboxOpen, setVisionInboxOpen] = useState(false);
  const [visionInboxSkipIds, setVisionInboxSkipIds] = useState<Set<string>>(() => new Set());
  const [loraExportOpen, setLoraExportOpen] = useState(false);
  const [loraExportScope, setLoraExportScope] = useState<'favorites' | 'selected'>('favorites');
  const [workflowEntry, setWorkflowEntry] = useState<ComfyGalleryEntry | null>(null);
  const [collapsedLineageGroups, setCollapsedLineageGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedExperimentGroups, setCollapsedExperimentGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [paramAxis, setParamAxis] = useState<ParamExperimentAxis>('cfg');
  const [galleryEntriesSettled, setGalleryEntriesSettled] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const importDroppedImages = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setUploadingImages(true);
    try {
      const result = await runGalleryImageImport(files);
      if (result.failed > 0 && result.imported === 0) {
        setRequeueStatus(result.errors[0] ?? 'Could not import those images.');
      }
    } finally {
      setUploadingImages(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get('upload') !== '1') {
      return;
    }
    uploadInputRef.current?.click();
    const url = new URL(window.location.href);
    if (url.searchParams.has('upload')) {
      url.searchParams.delete('upload');
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`
      );
    }
  }, [searchParams]);

  const toggleLineageGroup = useCallback((rootId: string) => {
    setCollapsedLineageGroups(previous => {
      const next = new Set(previous);
      if (next.has(rootId)) {
        next.delete(rootId);
      } else {
        next.add(rootId);
      }
      return next;
    });
  }, []);

  const toggleExperimentGroup = useCallback((groupId: string) => {
    setCollapsedExperimentGroups(previous => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  return {
    downloadError,
    setDownloadError,
    requeueStatus,
    setRequeueStatus,
    compareOpen,
    setCompareOpen,
    openCompare,
    capWizardOpen,
    setCapWizardOpen,
    visionInboxOpen,
    setVisionInboxOpen,
    visionInboxSkipIds,
    setVisionInboxSkipIds,
    loraExportOpen,
    setLoraExportOpen,
    loraExportScope,
    setLoraExportScope,
    workflowEntry,
    setWorkflowEntry,
    collapsedLineageGroups,
    collapsedExperimentGroups,
    toggleLineageGroup,
    toggleExperimentGroup,
    paramAxis,
    setParamAxis,
    galleryEntriesSettled,
    setGalleryEntriesSettled,
    uploadingImages,
    uploadInputRef,
    importDroppedImages,
  };
}
