#!/usr/bin/env node
/**
 * Smoke-check docker/compose.yml + docker/.env.example without the Compose plugin: the port is
 * published on the same address the app's startup check is told (PROMPT_BIND_HOST), so a LAN
 * publish with sign-in off fails closed; data lives in a volume; the example turns sign-in on
 * for its LAN default; nothing switches the startup check off.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compose = readFileSync(resolve(root, 'docker/compose.yml'), 'utf8');
const example = readFileSync(resolve(root, 'docker/.env.example'), 'utf8');

function fail(message) {
  console.error(`validate-compose: ${message}`);
  process.exit(1);
}

const bindHost = compose.match(/PROMPT_BIND_HOST:\s*\$\{CASTCUT_BIND:-([^}]+)\}/);
if (!bindHost) fail('castcut must set PROMPT_BIND_HOST: ${CASTCUT_BIND:-…}');
const port = compose.match(/-\s*'\$\{CASTCUT_BIND:-([^}]+)\}:\$\{CASTCUT_PORT:-\d+\}:47832'/);
if (!port) fail("castcut must publish '${CASTCUT_BIND:-…}:${CASTCUT_PORT:-…}:47832'");
if (bindHost[1] !== port[1]) {
  fail(`PROMPT_BIND_HOST default (${bindHost[1]}) differs from the published address (${port[1]})`);
}
if (/^\s*-\s*'?(?:0\.0\.0\.0:)?47832:47832/m.test(compose)) {
  fail('publish 47832 only through ${CASTCUT_BIND}, so the startup check sees the real address');
}
if (!/PROMPT_DATA_DIR:\s*\/data/.test(compose) || !/castcut_data:\/data/.test(compose)) {
  fail('castcut must keep PROMPT_DATA_DIR=/data on the castcut_data volume');
}
for (const [name, text] of [
  ['compose.yml', compose],
  ['.env.example', example],
]) {
  if (/PROMPT_ALLOW_INSECURE_AUTH/.test(text))
    fail(`${name} must not set PROMPT_ALLOW_INSECURE_AUTH`);
}

const value = key => example.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
const exampleBind = value('CASTCUT_BIND');
if (exampleBind && exampleBind !== '127.0.0.1' && value('PROMPT_AUTH_ENABLED') !== 'true') {
  fail('.env.example publishes beyond loopback, so it must set PROMPT_AUTH_ENABLED=true');
}

if (!/PROMPT_AUTH_ENABLED:\s*\$\{PROMPT_AUTH_ENABLED:-true\}/.test(compose)) {
  fail('castcut must default PROMPT_AUTH_ENABLED to true (the .env file is optional)');
}

console.log('validate-compose: ok');
