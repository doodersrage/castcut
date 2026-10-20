import type { DiffusersCheckpointOption } from '@/components/DiffusersCheckpointSelector';

type InventoryLists = {
  models?: DiffusersCheckpointOption[];
  checkpoints?: DiffusersCheckpointOption[];
  diffusionModels?: DiffusersCheckpointOption[];
  loras?: DiffusersCheckpointOption[];
};

function hasId(
  items: DiffusersCheckpointOption[],
  predicate: (id: string) => boolean
): DiffusersCheckpointOption | undefined {
  return items.find(item => predicate(item.id.toLowerCase()));
}

/**
 * Lightning is a LoRA + step preset on the same Qwen UNET — synthesize picker
 * rows so Diffusers mode keeps Lightning-4 / Lightning-8 options.
 */
export function buildDiffusersLightningPresets(
  inventory: InventoryLists
): DiffusersCheckpointOption[] {
  const weights = [
    ...(inventory.diffusionModels ?? []),
    ...(inventory.checkpoints ?? []),
    ...(inventory.models ?? []),
  ];
  const loras = inventory.loras ?? [];

  // Prefer 2512 fp8 when present — fits 24GB resident; bf16 forces PCIe thrash.
  const qwen2512 =
    hasId(
      weights,
      id => id.includes('qwen_image_2512') && id.includes('fp8') && id.endsWith('.safetensors')
    ) ||
    hasId(
      weights,
      id => id.includes('qwen_image_2512') && id.includes('bf16') && id.endsWith('.safetensors')
    ) ||
    hasId(
      weights,
      id =>
        id.includes('qwen_image_2512') ||
        (id.includes('qwen_image') &&
          !id.includes('edit') &&
          !id.includes('rapid') &&
          id.endsWith('.safetensors'))
    );
  const lightning4 = hasId(
    loras,
    id =>
      id.includes('lightning') &&
      (id.includes('4step') || id.includes('4-step') || /lightning[\s_-]*4/.test(id)) &&
      !id.includes('edit') &&
      !id.includes('wan')
  );
  const lightning8 = hasId(
    loras,
    id =>
      id.includes('lightning') &&
      (id.includes('8step') || id.includes('8-step') || /lightning[\s_-]*8/.test(id)) &&
      !id.includes('edit') &&
      !id.includes('wan')
  );
  // Broader fallbacks when step count isn't in the filename.
  const anyT2iLightning =
    lightning4 ||
    lightning8 ||
    hasId(
      loras,
      id =>
        id.includes('lightning') &&
        !id.includes('edit') &&
        !id.includes('wan') &&
        id.includes('qwen')
    );

  const presets: DiffusersCheckpointOption[] = [];
  if (qwen2512 && (lightning4 || anyT2iLightning)) {
    presets.push({
      id: 'qwen-image-2512-lightning-4',
      label: 'Qwen Image 2512 Lightning 4-step',
      kind: 'single_file',
      family: 'qwen',
      default: false,
      bucket: 'preset',
      weightId: qwen2512.id,
      studioModelId: 'qwen-image-2512-lightning-4',
      variant: 'lightning-4',
    });
  }
  if (qwen2512 && (lightning8 || anyT2iLightning)) {
    presets.push({
      id: 'qwen-image-2512-lightning-8',
      label: 'Qwen Image 2512 Lightning 8-step',
      kind: 'single_file',
      family: 'qwen',
      default: false,
      bucket: 'preset',
      weightId: qwen2512.id,
      studioModelId: 'qwen-image-2512-lightning-8',
      variant: 'lightning-8',
    });
  }

  const qwenEdit = hasId(
    weights,
    id => id.includes('qwen_image_edit_2511') || id.includes('qwen-image-edit-2511')
  );
  const editLightning4 = hasId(
    loras,
    id =>
      id.includes('edit') &&
      id.includes('lightning') &&
      (id.includes('4step') || id.includes('4-step') || /lightning[\s_-]*4/.test(id))
  );
  const editLightning8 = hasId(
    loras,
    id =>
      id.includes('edit') &&
      id.includes('lightning') &&
      (id.includes('8step') || id.includes('8-step') || /lightning[\s_-]*8/.test(id))
  );
  const anyEditLightning =
    editLightning4 ||
    editLightning8 ||
    hasId(loras, id => id.includes('edit') && id.includes('lightning'));

  if (qwenEdit && (editLightning4 || anyEditLightning)) {
    presets.push({
      id: 'qwen-image-edit-2511-lightning-4',
      label: 'Qwen Edit 2511 Lightning 4-step',
      kind: 'single_file',
      family: 'qwen',
      default: false,
      bucket: 'preset',
      weightId: qwenEdit.id,
      studioModelId: 'qwen-image-edit-2511-lightning-4',
      variant: 'lightning-4',
    });
  }
  if (qwenEdit && (editLightning8 || anyEditLightning)) {
    presets.push({
      id: 'qwen-image-edit-2511-lightning-8',
      label: 'Qwen Edit 2511 Lightning 8-step',
      kind: 'single_file',
      family: 'qwen',
      default: false,
      bucket: 'preset',
      weightId: qwenEdit.id,
      studioModelId: 'qwen-image-edit-2511-lightning-8',
      variant: 'lightning-8',
    });
  }

  return presets;
}
