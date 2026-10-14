/**
 * Outfit 3D view: TRELLIS.2 (Microsoft, MIT) image → textured GLB, the TRELLIS.2 branch of
 * Comfy-Org's "Pixal3D & TRELLIS.2: Image to Model" template (2026-10), converted to an API graph:
 * background removal (BiRefNet) and a square crop, structure → shape (upsampled to 1536) →
 * texture, remesh, decimate to 700k faces, UV unwrap, baked colour / normal / AO, saved as GLB.
 * Live on a plate and a dressed still: body, clothes, shoes and back view convincing; the face is
 * the weak part (2026-10-14). ~70 s for a plate, ~3.5 min for a busy still on the 4090.
 */

export const OUTFIT_3D_LOAD_NODE = '122';
export const OUTFIT_3D_SAVE_NODE = '900';
export const OUTFIT_3D_SEED_NODES = ['23', '12', '18', '3'] as const;

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

const TEMPLATE: Graph = {
  '23': {
    class_type: 'KSampler',
    inputs: {
      model: ['126', 0],
      seed: 42,
      steps: 12,
      cfg: 7.5,
      sampler_name: 'euler',
      scheduler: 'simple',
      positive: ['94', 0],
      negative: ['94', 1],
      latent_image: ['94', 2],
      denoise: 1,
    },
  },
  '196': {
    class_type: 'UnwrapMesh',
    inputs: {
      mesh: ['238', 0],
      segmenter: 'pec',
      resolution: 2048,
      padding: 1,
      weld_distance: 0.0002,
    },
  },
  '186': {
    class_type: 'DecimateMesh',
    inputs: {
      mesh: ['241', 0],
      target_face_count: 200000,
      placement_mode: 'midpoint',
    },
  },
  '92': {
    class_type: 'VaeDecodeShapeTrellis',
    inputs: {
      samples: ['23', 0],
      vae: ['117', 0],
    },
  },
  '119': {
    class_type: 'VaeDecodeStructureTrellis2',
    inputs: {
      samples: ['3', 0],
      vae: ['117', 0],
      resolution: '32',
    },
  },
  '125': {
    class_type: 'RescaleCFG',
    inputs: {
      model: ['199', 0],
      multiplier: 0.7,
    },
  },
  '93': {
    class_type: 'VaeDecodeTextureTrellis',
    inputs: {
      samples: ['12', 0],
      vae: ['118', 0],
      shape_subdivides: ['92', 1],
    },
  },
  '312': {
    class_type: 'ImageCropToMask',
    inputs: {
      images: ['122', 0],
      masks: ['192', 0],
      width: 1024,
      height: 1024,
      pad_factor: 1.1,
      grow_mask: 0,
      background: '#000000',
    },
  },
  '233': {
    class_type: 'BakeAmbientOcclusion',
    inputs: {
      low_poly: ['196', 0],
      high_poly: ['241', 0],
      resolution: 1024,
      samples: 64,
      max_distance: 0.71,
      strength: 1,
      bias: 0.01,
    },
  },
  '117': {
    class_type: 'VAELoader',
    inputs: {
      vae_name: 'trellis_2_shape_vae_bf16.safetensors',
    },
  },
  '202': {
    class_type: 'GetMeshInfo',
    inputs: {
      mesh: ['92', 0],
    },
  },
  '199': {
    class_type: 'CFGOverride',
    inputs: {
      model: ['40', 0],
      cfg: 1,
      start_percent: 0.667,
      end_percent: 1,
    },
  },
  '118': {
    class_type: 'VAELoader',
    inputs: {
      vae_name: 'trellis_2_texture_vae_bf16.safetensors',
    },
  },
  '192': {
    class_type: 'RemoveBackground',
    inputs: {
      bg_removal_model: ['193', 0],
      image: ['122', 0],
    },
  },
  '87': {
    class_type: 'EmptyTrellis2LatentStructure',
    inputs: {
      batch_size: 1,
    },
  },
  '40': {
    class_type: 'UNETLoader',
    inputs: {
      unet_name: 'trellis_2_int8_convrot.safetensors',
      weight_dtype: 'default',
    },
  },
  '147': {
    class_type: 'BakeTextureFromVoxel',
    inputs: {
      mesh: ['196', 0],
      voxel_colors: ['93', 0],
      texture_size: ['288', 0],
      reference_mesh: ['92', 0],
    },
  },
  '91': {
    class_type: 'Trellis2ShapeStage',
    inputs: {
      positive: ['299', 0],
      negative: ['299', 1],
      voxel: ['119', 0],
    },
  },
  '108': {
    class_type: 'ModelSamplingSD3',
    inputs: {
      model: ['125', 0],
      shift: 5,
    },
  },
  '12': {
    class_type: 'KSampler',
    inputs: {
      model: ['40', 0],
      seed: 43,
      steps: 12,
      cfg: 1,
      sampler_name: 'euler',
      scheduler: 'normal',
      positive: ['98', 0],
      negative: ['98', 1],
      latent_image: ['98', 2],
      denoise: 1,
    },
  },
  '122': {
    class_type: 'LoadImage',
    inputs: {
      image: 'PLATE.png',
    },
  },
  '285': {
    class_type: 'MeshToFile3D',
    inputs: {
      mesh: ['260', 0],
    },
  },
  '279': {
    class_type: 'CFGOverride',
    inputs: {
      model: ['40', 0],
      cfg: 1,
      start_percent: 0.769,
      end_percent: 1,
    },
  },
  '224': {
    class_type: 'BakeNormalMapFromMesh',
    inputs: {
      low_poly: ['196', 0],
      high_poly: ['241', 0],
      resolution: 2048,
      cage_distance: 0.05,
      ignore_backfaces: true,
    },
  },
  '94': {
    class_type: 'Trellis2UpsampleStage',
    inputs: {
      positive: ['91', 0],
      negative: ['91', 1],
      shape_latent: ['18', 0],
      vae: ['117', 0],
      target_resolution: '1536',
    },
  },
  '900': {
    class_type: 'SaveGLB',
    inputs: {
      mesh: ['285', 0],
      filename_prefix: '3d/castcut-plate',
    },
  },
  '15': {
    class_type: 'CLIPVisionLoader',
    inputs: {
      clip_name: 'dino_v3_vit_l.safetensors',
    },
  },
  '98': {
    class_type: 'Trellis2TextureStage',
    inputs: {
      positive: ['94', 0],
      negative: ['94', 1],
      shape_latent: ['23', 0],
    },
  },
  '210': {
    class_type: 'ApplyTextureToMesh',
    inputs: {
      mesh: ['196', 0],
      base_color: ['147', 0],
      metallic: ['147', 1],
      roughness: ['147', 2],
      occlusion: ['233', 0],
      normal_map: ['224', 0],
    },
  },
  '193': {
    class_type: 'LoadBackgroundRemovalModel',
    inputs: {
      bg_removal_name: 'birefnet.safetensors',
    },
  },
  '299': {
    class_type: 'Trellis2Conditioning',
    inputs: {
      clip_vision_model: ['15', 0],
      image: ['312', 0],
    },
  },
  '238': {
    class_type: 'MeshSmoothNormals',
    inputs: {
      mesh: ['186', 0],
      crease_angle: 180,
    },
  },
  '241': {
    class_type: 'RemeshMesh',
    inputs: {
      mesh: ['202', 0],
      resolution: 768,
      sign_mode: 'udf',
      'sign_mode.qef': false,
      'sign_mode.drop_inverted_components': false,
      'sign_mode.drop_enclosed_components': false,
      band: 1.0,
      project_back: 0.0,
      fix_poles: false,
      smooth_iters: 20,
      drop_small_components: 0.01,
      precluster_max_verts: 20000000,
    },
  },
  '288': {
    class_type: 'PrimitiveInt',
    inputs: {
      value: 2048,
    },
  },
  '126': {
    class_type: 'RescaleCFG',
    inputs: {
      model: ['279', 0],
      multiplier: 0.5,
    },
  },
  '18': {
    class_type: 'KSampler',
    inputs: {
      model: ['126', 0],
      seed: 42,
      steps: 20,
      cfg: 7.5,
      sampler_name: 'euler',
      scheduler: 'normal',
      positive: ['91', 0],
      negative: ['91', 1],
      latent_image: ['91', 2],
      denoise: 1,
    },
  },
  '260': {
    class_type: 'MeshSmoothNormals',
    inputs: {
      mesh: ['210', 0],
      crease_angle: 180,
    },
  },
  '3': {
    class_type: 'KSampler',
    inputs: {
      model: ['108', 0],
      seed: 56,
      steps: 12,
      cfg: 7.5,
      sampler_name: 'euler',
      scheduler: 'normal',
      positive: ['299', 0],
      negative: ['299', 1],
      latent_image: ['87', 0],
      denoise: 1,
    },
  },
};

/** The graph for one picture (a ComfyUI input file name), saved under 3d/<prefix>. */
export function buildOutfit3dGraph(input: { image: string; prefix: string; seed: number }): Graph {
  const graph = JSON.parse(JSON.stringify(TEMPLATE)) as Graph;
  graph[OUTFIT_3D_LOAD_NODE]!.inputs.image = input.image;
  graph[OUTFIT_3D_SAVE_NODE]!.inputs.filename_prefix = `3d/${input.prefix}`;
  for (const [index, id] of OUTFIT_3D_SEED_NODES.entries()) {
    graph[id]!.inputs.seed = input.seed + index;
  }
  return graph;
}
