import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { CASTCUT_NODE_TYPES } from './castcut-nodes';
import {
  CASTCUT_NODES_BUNDLED_VERSION,
  buildCastcutInstallCommands,
  castcutNodesStatusFromObjectInfo,
  castcutRestartGate,
  chooseCastcutNodesAction,
  compareCastcutVersions,
  describeCastcutNodesStatus,
  inferComfyUiLayout,
  parseCastcutNodesVersion,
  parseComfyUiSystemStats,
  type ComfyUiSystemInfo,
} from './castcut-nodes-setup';

function nodes(description: string, module = 'custom_nodes.castcut_nodes', omit: string[] = []) {
  return Object.fromEntries(
    CASTCUT_NODE_TYPES.filter(type => !omit.includes(type)).map(type => [
      type,
      { description, python_module: module },
    ])
  );
}

function system(partial: Partial<ComfyUiSystemInfo>): ComfyUiSystemInfo {
  return {
    os: 'linux',
    comfyuiVersion: '0.37.0',
    pythonVersion: '3.14.7',
    embeddedPython: false,
    deployEnvironment: 'local-git',
    argv: [],
    ...partial,
  };
}

describe('castcut nodes version', () => {
  it('matches the pack this app ships (castcut_nodes.py CASTCUT_VERSION)', () => {
    const source = readFileSync(
      new URL('../../comfyui-nodes/castcut/castcut_nodes.py', import.meta.url),
      'utf8'
    );
    assert.equal(/^CASTCUT_VERSION = "([^"]+)"/m.exec(source)?.[1], CASTCUT_NODES_BUNDLED_VERSION);
  });

  it('parses the description marker and compares versions', () => {
    assert.equal(parseCastcutNodesVersion('Scores poses. [castcut-nodes 1.1.0]'), '1.1.0');
    assert.equal(parseCastcutNodesVersion(''), null);
    assert.equal(parseCastcutNodesVersion(undefined), null);
    assert.equal(compareCastcutVersions('1.0.9', '1.1.0'), -1);
    assert.equal(compareCastcutVersions('1.10.0', '1.9.0'), 1);
    assert.equal(compareCastcutVersions('1.1', '1.1.0'), 0);
  });
});

describe('castcutNodesStatusFromObjectInfo', () => {
  it('missing when no node answers', () => {
    const status = castcutNodesStatusFromObjectInfo({});
    assert.equal(status.state, 'missing');
    assert.equal(status.installedAs, null);
    assert.match(describeCastcutNodesStatus(status), /Not installed/);
  });

  it('current / outdated / newer from the marker', () => {
    assert.equal(
      castcutNodesStatusFromObjectInfo(nodes('x [castcut-nodes 1.1.0]'), '1.1.0').state,
      'current'
    );
    const old = castcutNodesStatusFromObjectInfo(nodes('x [castcut-nodes 1.0.5]'), '1.1.0');
    assert.equal(old.state, 'outdated');
    assert.equal(old.installedVersion, '1.0.5');
    assert.equal(castcutNodesStatusFromObjectInfo(nodes('x [castcut-nodes 2.0.0]'), '1.1.0').state, 'newer');
  });

  it('a pack from before version markers (empty description) is outdated, version unknown', () => {
    const status = castcutNodesStatusFromObjectInfo(nodes(''), '1.1.0');
    assert.equal(status.state, 'outdated');
    assert.equal(status.installedVersion, null);
    assert.equal(status.installedAs, 'file');
    assert.match(describeCastcutNodesStatus(status), /older version/);
  });

  it('partial when some nodes are missing; a folder install is told apart from the file', () => {
    const status = castcutNodesStatusFromObjectInfo(
      nodes('x [castcut-nodes 1.1.0]', 'custom_nodes.castcut', ['CastcutMaskRepair']),
      '1.1.0'
    );
    assert.equal(status.state, 'partial');
    assert.deepEqual(status.missingNodes, ['CastcutMaskRepair']);
    assert.equal(status.installedAs, 'folder');
  });
});

describe('chooseCastcutNodesAction / castcutRestartGate', () => {
  const missing = castcutNodesStatusFromObjectInfo({});
  const fileOld = castcutNodesStatusFromObjectInfo(nodes(''));
  const current = castcutNodesStatusFromObjectInfo(nodes(`x [castcut-nodes ${CASTCUT_NODES_BUNDLED_VERSION}]`));

  it('one primary action', () => {
    assert.equal(chooseCastcutNodesAction({ status: current, managerPresent: true }), 'none');
    assert.equal(chooseCastcutNodesAction({ status: missing, managerPresent: true }), 'manager');
    assert.equal(chooseCastcutNodesAction({ status: missing, managerPresent: false }), 'copy');
    assert.equal(
      chooseCastcutNodesAction({ status: missing, managerPresent: true, managerRefused: true }),
      'copy'
    );
    // Installed as the single file: replace the file, don't clone a second copy beside it.
    assert.equal(chooseCastcutNodesAction({ status: fileOld, managerPresent: true }), 'copy');
    assert.equal(chooseCastcutNodesAction({ status: null, managerPresent: true }), 'none');
  });

  it('restart waits for ComfyUI’s queue', () => {
    assert.deepEqual(castcutRestartGate({ running: 1, pending: 2 }), {
      allowed: false,
      label: 'Wait for 3 jobs',
    });
    assert.equal(castcutRestartGate({ running: 1, pending: 0 }).label, 'Wait for 1 job');
    assert.equal(castcutRestartGate({ running: 0, pending: 0 }).allowed, true);
    assert.equal(castcutRestartGate(null).allowed, true);
  });
});

describe('ComfyUI layout from /system_stats', () => {
  it('parses system_stats', () => {
    const parsed = parseComfyUiSystemStats({
      system: {
        os: 'linux',
        comfyui_version: '0.37.0',
        python_version: '3.14.7 (main, Aug 10 2026) [GCC]',
        embedded_python: false,
        deploy_environment: 'local-git',
        argv: ['/opt/comfyui/main.py', '--listen', '127.0.0.1'],
      },
    });
    assert.equal(parsed?.pythonVersion, '3.14.7');
    assert.deepEqual(parsed?.argv, ['/opt/comfyui/main.py', '--listen', '127.0.0.1']);
    assert.equal(parseComfyUiSystemStats({}), null);
  });

  it('a system service under /opt needs sudo', () => {
    const layout = inferComfyUiLayout(
      system({ argv: ['/opt/comfyui/main.py', '--input-directory', '/var/lib/comfyui/input'] })
    );
    assert.equal(layout.platform, 'linux');
    assert.equal(layout.customNodesDir, '/opt/comfyui/custom_nodes');
    assert.equal(layout.userDir, '/opt/comfyui/user');
    assert.equal(layout.needsSudo, true);
  });

  it('--base-directory and --user-directory win', () => {
    const layout = inferComfyUiLayout(
      system({
        os: 'darwin',
        argv: ['/Applications/ComfyUI.app/main.py', '--base-directory', '/Users/a/ComfyUI', '--user-directory=/Users/a/u'],
      })
    );
    assert.equal(layout.platform, 'mac');
    assert.equal(layout.customNodesDir, '/Users/a/ComfyUI/custom_nodes');
    assert.equal(layout.userDir, '/Users/a/u');
    assert.equal(layout.needsSudo, false);
  });

  it('Windows portable (python_embeded, relative main.py)', () => {
    const layout = inferComfyUiLayout(
      system({ os: 'nt', embeddedPython: true, argv: ['ComfyUI\\main.py', '--windows-standalone-build'] })
    );
    assert.equal(layout.platform, 'windows');
    assert.equal(layout.portable, true);
    assert.equal(layout.customNodesDir, 'ComfyUI\\custom_nodes');
  });

  it('unknown layout', () => {
    const layout = inferComfyUiLayout(null);
    assert.equal(layout.customNodesDir, null);
    assert.equal(layout.platform, 'linux');
  });
});

describe('buildCastcutInstallCommands', () => {
  const origin = 'http://192.168.1.5:3000';

  it('Linux service: curl to /tmp then sudo install into custom_nodes, systemd restart hint', () => {
    const commands = buildCastcutInstallCommands({
      system: system({ argv: ['/opt/comfyui/main.py'] }),
      appOrigin: origin,
    });
    const curl = commands.find(command => command.id === 'curl');
    assert.equal(curl?.recommended, true);
    assert.equal(
      curl?.command,
      'curl -fsSL "http://192.168.1.5:3000/api/castcut-nodes/file" -o /tmp/castcut_nodes.py \\\n  && sudo install -m 644 /tmp/castcut_nodes.py "/opt/comfyui/custom_nodes/castcut_nodes.py"'
    );
    assert.match(curl?.note ?? '', /systemctl restart comfyui/);
    assert.deepEqual(
      commands.map(command => command.id),
      ['curl', 'wget', 'git', 'comfy-cli', 'docker']
    );
    assert.match(commands.find(command => command.id === 'comfy-cli')?.command ?? '', /^comfy node install castcut-nodes$/);
  });

  it('home install: straight into custom_nodes; auth adds the header placeholder', () => {
    const commands = buildCastcutInstallCommands({
      system: system({ argv: ['/home/me/ComfyUI/main.py'] }),
      appOrigin: origin,
      needsAuth: true,
    });
    assert.equal(
      commands[0]?.command,
      'curl -fsSL -H "Authorization: Bearer <API key>" "http://192.168.1.5:3000/api/castcut-nodes/file" -o "/home/me/ComfyUI/custom_nodes/castcut_nodes.py"'
    );
    assert.match(commands.find(command => command.id === 'wget')?.command ?? '', /--header="Authorization: Bearer <API key>"/);
  });

  it('Windows portable: PowerShell first, run from the portable folder', () => {
    const commands = buildCastcutInstallCommands({
      system: system({ os: 'nt', embeddedPython: true, argv: ['ComfyUI\\main.py'] }),
      appOrigin: origin,
      needsAuth: true,
    });
    const first = commands[0];
    assert.equal(first?.id, 'powershell');
    assert.equal(first?.shell, 'powershell');
    assert.equal(
      first?.command,
      'Invoke-WebRequest -Uri "http://192.168.1.5:3000/api/castcut-nodes/file" -Headers @{ Authorization = "Bearer <API key>" } -OutFile "ComfyUI\\custom_nodes\\castcut_nodes.py"'
    );
    assert.match(first?.note ?? '', /ComfyUI_windows_portable/);
    assert.match(first?.note ?? '', /python_embeded/);
    assert.match(commands.find(command => command.id === 'git')?.command ?? '', /"ComfyUI\\custom_nodes\\castcut"$/);
  });

  it('container: Docker command recommended with the container path', () => {
    const commands = buildCastcutInstallCommands({
      system: system({ argv: ['/app/main.py'] }),
      appOrigin: origin,
    });
    const docker = commands.find(command => command.id === 'docker');
    assert.equal(docker?.recommended, true);
    assert.match(docker?.command ?? '', /docker cp castcut_nodes\.py <container>:\/app\/custom_nodes\/castcut_nodes\.py/);
    assert.equal(commands.find(command => command.id === 'curl')?.recommended, false);
  });

  it('unknown layout uses a placeholder custom_nodes path and says so', () => {
    const commands = buildCastcutInstallCommands({ system: null, appOrigin: origin });
    assert.match(commands[0]?.command ?? '', /-o "ComfyUI\/custom_nodes\/castcut_nodes\.py"$/);
    assert.match(commands[0]?.note ?? '', /changed to your ComfyUI's custom_nodes folder/);
  });
});
