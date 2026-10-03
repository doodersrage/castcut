import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lookupKnownComfyNodePack } from './comfyui-custom-node-registry';
import {
  parseComfyManagerMappings,
  parseComfyManagerNodeList,
  resolvePacksForMissingNodeTypes,
} from './comfyui-manager-mappings';
import {
  collectMissingNodeTypesFromIssues,
  collectMissingWorkflowNodeTypes,
  extractMissingNodeTypesFromMessage,
  isMissingCustomNodeFailure,
} from './workflow-node-type-audit';

describe('parseComfyManagerMappings', () => {
  it('maps pack key → class types arrays', () => {
    const map = parseComfyManagerMappings({
      'https://github.com/ltdrdata/ComfyUI-Impact-Pack': [
        ['FaceDetailer', 'SAMLoader'],
        { title: 'Impact Pack' },
      ],
    });
    assert.equal(map.get('FaceDetailer'), 'https://github.com/ltdrdata/ComfyUI-Impact-Pack');
    assert.equal(map.get('SAMLoader'), 'https://github.com/ltdrdata/ComfyUI-Impact-Pack');
  });
});

describe('parseComfyManagerNodeList', () => {
  it('reads custom_nodes[]', () => {
    const packs = parseComfyManagerNodeList({
      custom_nodes: [
        {
          id: 'impact',
          name: 'comfyui-impact-pack',
          files: ['https://github.com/ltdrdata/ComfyUI-Impact-Pack'],
          install_type: 'git-clone',
        },
      ],
    });
    assert.equal(packs.length, 1);
    assert.equal(packs[0]?.name, 'comfyui-impact-pack');
  });

  it("reads V3 getlist's node_packs map (keyed by id) with the version", () => {
    const packs = parseComfyManagerNodeList({
      channel: 'default',
      node_packs: {
        'comfyui-impact-pack': {
          id: 'comfyui-impact-pack',
          title: 'ComfyUI Impact Pack',
          files: ['https://github.com/ltdrdata/ComfyUI-Impact-Pack'],
          version: '8.28.3',
        },
        'ComfyUI-Persona-Director': {
          files: ['https://github.com/18yz153/ComfyUI-Persona-Director'],
          version: 'unknown',
        },
      },
    });
    assert.equal(packs.length, 2);
    assert.equal(packs[0]?.version, '8.28.3');
    assert.equal(packs[1]?.id, 'ComfyUI-Persona-Director');
    assert.equal(packs[1]?.version, 'unknown');
  });
});

describe('resolvePacksForMissingNodeTypes', () => {
  it('falls back to the known class_type registry', () => {
    const resolved = resolvePacksForMissingNodeTypes({
      classTypes: ['FaceDetailer', 'MysteryNode'],
      mappings: new Map(),
      catalog: [],
    });
    assert.equal(resolved.packs.length, 1);
    assert.match(resolved.packs[0]?.files[0] ?? '', /Impact-Pack/);
    assert.deepEqual(resolved.unresolved, ['MysteryNode']);
  });

  it('prefers catalog matches from mappings', () => {
    const resolved = resolvePacksForMissingNodeTypes({
      classTypes: ['FaceDetailer'],
      mappings: new Map([['FaceDetailer', 'https://github.com/ltdrdata/ComfyUI-Impact-Pack']]),
      catalog: [
        {
          name: 'impact-from-catalog',
          files: ['https://github.com/ltdrdata/ComfyUI-Impact-Pack'],
          install_type: 'git-clone',
        },
      ],
    });
    assert.equal(resolved.packs[0]?.name, 'impact-from-catalog');
  });
});

describe('lookupKnownComfyNodePack', () => {
  it('maps IPAdapter nodes', () => {
    const pack = lookupKnownComfyNodePack('IPAdapterModelLoader');
    assert.ok(pack);
    assert.match(pack.files[0] ?? '', /IPAdapter_plus/i);
  });
});

describe('collectMissingWorkflowNodeTypes', () => {
  it('returns class types absent from object_info', () => {
    const missing = collectMissingWorkflowNodeTypes(
      [
        {
          workflow: {
            '1': { class_type: 'KSampler', inputs: {} },
            '2': { class_type: 'FaceDetailer', inputs: {} },
          },
        },
      ],
      new Set(['KSampler', 'CLIPTextEncode'])
    );
    assert.deepEqual(missing, ['FaceDetailer']);
  });

  it('returns [] when object_info is empty', () => {
    assert.deepEqual(
      collectMissingWorkflowNodeTypes([{ workflow: { '1': { class_type: 'X' } } }], []),
      []
    );
  });
});

describe('missing node message helpers', () => {
  it('detects unknown node type failures', () => {
    assert.equal(
      isMissingCustomNodeFailure('unknown node type: FaceDetailer is not installed'),
      true
    );
    assert.equal(isMissingCustomNodeFailure('CUDA out of memory'), false);
  });

  it('extracts quoted and known class types', () => {
    const types = extractMissingNodeTypesFromMessage(
      'Workflow node type “FaceDetailer” is not installed in ComfyUI'
    );
    assert.ok(types.includes('FaceDetailer'));
  });

  it('collects classType from structured issues', () => {
    assert.deepEqual(
      collectMissingNodeTypesFromIssues([
        { classType: 'IPAdapterApply', message: 'missing' },
        { message: 'unknown node type: UltimateSDUpscale' },
      ]),
      ['IPAdapterApply', 'UltimateSDUpscale']
    );
  });
});
