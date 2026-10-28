import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

// M7 T4: a finished graph — as a render was submitted — is queued exactly as it is.
describe('a finished graph (workflowFinal)', async () => {
  const { hasWorkflowPlaceholders } = await import('./client');
  const { stripEmptyComfyUiRuntime } = await import('./config');

  it('a graph with placeholders is a template, never treated as finished', () => {
    assert.equal(
      hasWorkflowPlaceholders({ '6': { class_type: 'CLIPTextEncode', inputs: { text: '{{PROMPT}}' } } }),
      true
    );
    assert.equal(
      hasWorkflowPlaceholders({ '6': { class_type: 'CLIPTextEncode', inputs: { text: 'she reads' } } }),
      false
    );
    // Braces in a prompt are not a placeholder.
    assert.equal(hasWorkflowPlaceholders({ '6': { inputs: { text: 'a {cozy} room' } } }), false);
  });

  it('the server keeps the flag only with a graph', () => {
    assert.equal(stripEmptyComfyUiRuntime({ workflowJson: '{"1":{}}', workflowFinal: true })?.workflowFinal, true);
    assert.equal(stripEmptyComfyUiRuntime({ workflowFinal: true })?.workflowFinal, undefined);
    assert.equal(stripEmptyComfyUiRuntime({ workflowJson: '{"1":{}}' })?.workflowFinal, undefined);
  });
});
