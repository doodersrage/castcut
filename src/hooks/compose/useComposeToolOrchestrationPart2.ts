'use client';

import { useCallback, useMemo } from 'react';
import {
  isBooguEditModel,
  isFluxKleinModel,
  isQwenEditModel,
  isZImageModel,
} from '@/lib/model/denoise-defaults';
import {
  COMPOSE_MODIFY_TEMPLATE_GROUPS,
  COMPOSE_TRANSFER_TEMPLATE_GROUPS,
  isAggressiveComposeInstruction,
  type ComposeStarterTemplate,
} from '@/lib/prompt/compose-prompt';
import {
  formatComposeIdentityLockHint,
  formatKleinEnhancerComposeHint,
  formatKleinEnhancerIdentityHint,
  normalizeComposeIdentityKind,
  normalizeComposeIdentityLockStrength,
  DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH,
} from '@/lib/prompt/compose-identity-lock';
import { createDefaultRegionalSlots } from '@/lib/prompt/regional-prompt-slots';
import { regionalSlotsQueueExtras } from '@/components/RegionalEditPanel';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from '@/lib/edit/isolate-subject';
import {
  CLOUD_COMPOSE_TRANSFER_BLOCKED,
  cloudComposeBlocksTransfer,
  formatCloudComposeIdentityHint,
  isCloudMultiRefEditModel,
} from '@/lib/cloud/cloud-compose-refs';
import { isCloudEngine } from '@/lib/engine/capabilities';
import type { ComposeToolOrchestrationCore } from '@/hooks/compose/useComposeToolOrchestrationCore';

export function useComposeToolOrchestrationPart2(ctx: ComposeToolOrchestrationCore) {
  const {
    shared,
    toolSettings,
    slots,
    maskFile,
    maskPreviewUrl,
    showMaskEditor,
    handoffQueueParams,
    output,
    setError,
    setCopied,
    isolating,
    instruction,
    setInstruction,
    mode,
    isolateSubject,
    filledCount,
    extraFilledCount,
    cloudComposeModelId,
    autoIsolateAttemptedRef,
    assignFigure,
  } = ctx;

  const identityLock = toolSettings.identityLock === true;
  const identityLockStrength = normalizeComposeIdentityLockStrength(
    toolSettings.identityLockStrength ?? DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH
  );
  const identityKind = normalizeComposeIdentityKind(toolSettings.identityKind);
  const cloudEngine = isCloudEngine(shared.inferenceEngine);
  const cloudMultiRef = isCloudMultiRefEditModel(shared.inferenceEngine, cloudComposeModelId);
  const hasSessionFace = Boolean(
    shared.ipAdapterImageFilename?.trim() || shared.ipAdapterImageUrl?.trim()
  );
  const kleinEnhancerActive =
    isFluxKleinModel(shared.model) && shared.kleinEnhancerEnabled !== false;
  const identityLockHint = useMemo(() => {
    if (cloudEngine) {
      return formatCloudComposeIdentityHint({
        enabled: identityLock,
        strength: identityLockStrength,
        multiRef: cloudMultiRef,
        hasSessionFace,
      });
    }
    if (kleinEnhancerActive && identityLock) {
      return formatKleinEnhancerIdentityHint({
        enabled: shared.kleinEnhancerEnabled,
        identityLockStrength,
        preset: shared.kleinEnhancerIdentityPreset,
        textEnhancerEnabled: shared.kleinEnhancerTextEnabled,
        colorAnchorEnabled: shared.kleinEnhancerColorAnchorEnabled,
        model: shared.model,
      });
    }
    if (kleinEnhancerActive) {
      return formatKleinEnhancerComposeHint({
        enabled: shared.kleinEnhancerEnabled,
        textEnhancerEnabled: shared.kleinEnhancerTextEnabled,
        colorAnchorEnabled: shared.kleinEnhancerColorAnchorEnabled,
      });
    }
    return formatComposeIdentityLockHint({
      enabled: identityLock,
      strength: identityLockStrength,
      identityKind,
    });
  }, [
    cloudEngine,
    cloudMultiRef,
    hasSessionFace,
    identityKind,
    identityLock,
    identityLockStrength,
    kleinEnhancerActive,
    shared.kleinEnhancerColorAnchorEnabled,
    shared.kleinEnhancerEnabled,
    shared.kleinEnhancerIdentityPreset,
    shared.kleinEnhancerTextEnabled,
    shared.model,
  ]);
  const regionalSlots = toolSettings.regionalSlots ?? createDefaultRegionalSlots();
  const regionalQueue = useMemo(() => regionalSlotsQueueExtras(regionalSlots), [regionalSlots]);

  const queueImageOptions = useMemo(() => {
    const fig1 = slots[0];
    return {
      inputImage: fig1?.file ?? null,
      inputImageUrl: !fig1?.file ? (fig1?.previewUrl ?? undefined) : undefined,
      inputImages: slots.map(slot => slot.file),
      inputImageUrls: slots.map(slot => (!slot.file ? (slot.previewUrl ?? undefined) : undefined)),
      maskImage: showMaskEditor ? maskFile : undefined,
      maskImageUrl: showMaskEditor && !maskFile ? (maskPreviewUrl ?? undefined) : undefined,
      queueParamsBase: handoffQueueParams,
      identityLock,
      identityLockStrength,
      identityKind,
      customTokens: regionalQueue.customTokens,
      regionalSlots: regionalQueue.regionalSlots,
    };
  }, [
    handoffQueueParams,
    identityKind,
    identityLock,
    identityLockStrength,
    maskFile,
    maskPreviewUrl,
    regionalQueue,
    showMaskEditor,
    slots,
  ]);

  const assertReadyToQueue = useCallback(() => {
    if (isolating) {
      setError('Wait for Image 1 to finish isolating.');
      return false;
    }
    const fig1 = slots[0];
    if (!fig1?.file && !fig1?.previewUrl) {
      setError('Upload Image 1 (base image) before queueing.');
      return false;
    }
    if (isolateSubject && fig1 && !fig1.isolated) {
      autoIsolateAttemptedRef.current = false;
      const original = fig1.originalFile ?? fig1.file ?? null;
      const preview = fig1.originalPreviewUrl || fig1.previewUrl || null;
      if (original || preview) {
        setError('Isolating subject on white…');
        void assignFigure(0, original, {
          isolate: true,
          previewUrl: original ? undefined : preview,
        });
        return false;
      }
      setError(ISOLATE_QUEUE_BLOCKED_MESSAGE);
      return false;
    }
    if (mode === 'transfer' && filledCount < 2) {
      setError('Transfer mode needs at least Image 1 and Image 2.');
      return false;
    }
    if (
      cloudComposeBlocksTransfer({
        engine: shared.inferenceEngine,
        modelId: cloudComposeModelId,
        mode,
        extraFilled: extraFilledCount > 0,
      })
    ) {
      setError(CLOUD_COMPOSE_TRANSFER_BLOCKED);
      return false;
    }
    if (!output.trim()) {
      setError('Add an edit instruction before queueing.');
      return false;
    }
    setError(null);
    return true;
  }, [
    assignFigure,
    cloudComposeModelId,
    extraFilledCount,
    filledCount,
    isolateSubject,
    isolating,
    mode,
    output,
    shared.inferenceEngine,
    slots,
  ]);

  const applyTemplate = useCallback(
    (text: string) => {
      setInstruction(text);
    },
    [setInstruction]
  );

  const copyOutput = useCallback(async () => {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [output]);

  const templateGroups =
    mode === 'transfer' ? COMPOSE_TRANSFER_TEMPLATE_GROUPS : COMPOSE_MODIFY_TEMPLATE_GROUPS;
  const defaultTransferMinFigures = mode === 'transfer' ? 2 : 1;
  const fig1Preview = slots[0]?.previewUrl ?? null;

  const templateMinFigures = useCallback(
    (template: ComposeStarterTemplate) => template.minFigures ?? defaultTransferMinFigures,
    [defaultTransferMinFigures]
  );
  const qwenEditModel = isQwenEditModel(shared.model);
  const booguEditModel = isBooguEditModel(shared.model);
  const zImageModel = isZImageModel(shared.model);
  const aggressiveInstruction = isAggressiveComposeInstruction(instruction);
  const showPoseUnlockHint =
    (qwenEditModel || booguEditModel) &&
    (aggressiveInstruction ||
      (mode === 'modify' && /refactor|beast mode|replace everything/i.test(instruction)));

  return {
    identityLock,
    identityLockStrength,
    identityKind,
    identityLockHint,
    regionalSlots,
    queueImageOptions,
    assertReadyToQueue,
    applyTemplate,
    copyOutput,
    templateGroups,
    fig1Preview,
    templateMinFigures,
    booguEditModel,
    zImageModel,
    showPoseUnlockHint,
  };
}
