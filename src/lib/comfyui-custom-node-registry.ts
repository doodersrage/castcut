export type ComfyManagerPackSpec = {
  name: string;
  files: string[];
  install_type: 'git-clone' | 'copy' | 'unzip';
  title?: string;
  id?: string;
  /** What the pack adds, for install prompts (optional packs say what works without them). */
  description?: string;
};

const IMPACT_PACK: ComfyManagerPackSpec = {
  name: 'comfyui-impact-pack',
  title: 'ComfyUI Impact Pack',
  files: ['https://github.com/ltdrdata/ComfyUI-Impact-Pack'],
  install_type: 'git-clone',
};

const IPADAPTER_PLUS: ComfyManagerPackSpec = {
  name: 'comfyui_ipadapter_plus',
  title: 'ComfyUI IPAdapter Plus',
  files: ['https://github.com/cubiq/ComfyUI_IPAdapter_plus'],
  install_type: 'git-clone',
};

const INSTANTID: ComfyManagerPackSpec = {
  name: 'comfyui_instantid',
  title: 'ComfyUI InstantID',
  files: ['https://github.com/cubiq/ComfyUI_InstantID'],
  install_type: 'git-clone',
};

const PULID: ComfyManagerPackSpec = {
  name: 'pulid_comfyui',
  title: 'PuLID ComfyUI',
  files: ['https://github.com/cubiq/PuLID_ComfyUI'],
  install_type: 'git-clone',
};

const ULTIMATE_SD_UPSCALE: ComfyManagerPackSpec = {
  name: 'comfyui_ultimate_sd_upscale',
  title: 'Ultimate SD Upscale',
  files: ['https://github.com/ssitu/ComfyUI_UltimateSDUpscale'],
  install_type: 'git-clone',
};

const SAVE_IMAGE_EXTENDED: ComfyManagerPackSpec = {
  name: 'comfyui-saveimageextended',
  title: 'Save Image Extended',
  files: ['https://github.com/audioscavenger/ComfyUI-SaveImageExtended'],
  install_type: 'git-clone',
};

const ATTENTION_COUPLE: ComfyManagerPackSpec = {
  name: 'comfyui-attention-couple',
  title: 'Attention Couple',
  files: ['https://github.com/laksjdjf/attention-couple-ComfyUI'],
  install_type: 'git-clone',
};

/** DWPose / OpenPose preprocessors — Play's pose check reads stills back with these. */
const CONTROLNET_AUX: ComfyManagerPackSpec = {
  name: 'comfyui_controlnet_aux',
  title: 'ComfyUI ControlNet Auxiliary Preprocessors',
  files: ['https://github.com/Fannovel16/comfyui_controlnet_aux'],
  install_type: 'git-clone',
};

/** InsightFace embeddings — Play's face check measures Cast identity with these. */
const FACE_ANALYSIS: ComfyManagerPackSpec = {
  name: 'comfyui_faceanalysis',
  title: 'ComfyUI FaceAnalysis',
  files: ['https://github.com/cubiq/ComfyUI_FaceAnalysis'],
  install_type: 'git-clone',
};

/**
 * Castcut's own node pack (comfyui-nodes/castcut in this repo) — optional. The Manager clones the
 * repo (its root __init__.py loads the pack); copying the one file castcut_nodes.py into
 * custom_nodes/ does the same with less on disk (comfyui-nodes/castcut/README.md).
 */
export const CASTCUT_PACK: ComfyManagerPackSpec = {
  name: 'castcut',
  title: 'Castcut checks',
  files: ['https://github.com/doodersrage/castcut'],
  install_type: 'git-clone',
  description:
    "Optional. Runs Castcut's post-render checks inside the job: Best of two for hard poses in one job (both takes, the pose check, the closer one kept) and the cut-out repair beside the BiRefNet matte. Without it the same checks run as separate ComfyUI calls.",
};

/** Well-known class_type → Manager pack, used when getmappings has no hit. */
export const KNOWN_COMFY_NODE_PACK_BY_CLASS: Record<string, ComfyManagerPackSpec> = {
  FaceDetailer: IMPACT_PACK,
  DWPreprocessor: CONTROLNET_AUX,
  OpenposePreprocessor: CONTROLNET_AUX,
  FaceAnalysisModels: FACE_ANALYSIS,
  FaceEmbedDistance: FACE_ANALYSIS,
  SAMLoader: IMPACT_PACK,
  ImpactWildcardProcessor: IMPACT_PACK,
  UltralyticsDetectorProvider: IMPACT_PACK,
  BboxDetectorSEGS: IMPACT_PACK,
  SegsToCombinedMask: IMPACT_PACK,
  IPAdapterApply: IPADAPTER_PLUS,
  IPAdapterApplyEncoded: IPADAPTER_PLUS,
  IPAdapterModelLoader: IPADAPTER_PLUS,
  IPAdapterEncoder: IPADAPTER_PLUS,
  IPAdapterUnifiedLoader: IPADAPTER_PLUS,
  ApplyInstantID: INSTANTID,
  InstantIDModelLoader: INSTANTID,
  InstantIDFaceAnalysis: INSTANTID,
  ApplyPulid: PULID,
  ApplyPulidFlux: PULID,
  PulidModelLoader: PULID,
  PulidEvaClipLoader: PULID,
  UltimateSDUpscale: ULTIMATE_SD_UPSCALE,
  SaveImageExtended: SAVE_IMAGE_EXTENDED,
  AttentionCouple: ATTENTION_COUPLE,
  RegionalPrompt: ATTENTION_COUPLE,
  CastcutPoseScore: CASTCUT_PACK,
  CastcutPickBest: CASTCUT_PACK,
  CastcutFaceDistance: CASTCUT_PACK,
  CastcutMaskRepair: CASTCUT_PACK,
  CastcutReport: CASTCUT_PACK,
};

export function lookupKnownComfyNodePack(classType: string): ComfyManagerPackSpec | null {
  return KNOWN_COMFY_NODE_PACK_BY_CLASS[classType.trim()] ?? null;
}

export function uniquePackSpecs(packs: ComfyManagerPackSpec[]): ComfyManagerPackSpec[] {
  const seen = new Set<string>();
  const unique: ComfyManagerPackSpec[] = [];
  for (const pack of packs) {
    const key = (pack.files[0] ?? pack.name).trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(pack);
  }
  return unique;
}
