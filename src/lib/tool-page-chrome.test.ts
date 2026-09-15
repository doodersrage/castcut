import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HUB_PAGE_DESCRIPTIONS,
  TOOL_SETUP_LABELS,
  TOOL_SIDEBAR_DESCRIPTION,
  TOOL_SIDEBAR_TITLE,
  descriptionForWorkspace,
  sectionDescriptionForWorkspace,
} from './tool-page-chrome';

describe('tool-page-chrome', () => {
  it('exposes shared sidebar defaults', () => {
    assert.equal(TOOL_SIDEBAR_TITLE, 'Settings');
    assert.match(TOOL_SIDEBAR_DESCRIPTION, /Advanced/);
  });

  it('picks simple descriptions in simple workspace', () => {
    assert.equal(descriptionForWorkspace('simple', 'Full copy', 'Short copy'), 'Short copy');
    assert.equal(descriptionForWorkspace('studio', 'Full copy', 'Short copy'), 'Full copy');
    assert.equal(descriptionForWorkspace('full', 'Full copy', 'Short copy'), 'Full copy');
  });

  it('aligns setup banner labels with nav names', () => {
    assert.equal(TOOL_SETUP_LABELS.format, 'Format');
    assert.equal(TOOL_SETUP_LABELS.topics, 'Topics');
    assert.equal(TOOL_SETUP_LABELS.imagePrompt, 'Image → Prompt');
    assert.equal(TOOL_SETUP_LABELS.gallery, 'Gallery');
    assert.equal(TOOL_SETUP_LABELS.queue, 'Queue');
    assert.equal(TOOL_SETUP_LABELS.moodboard, 'Look');
    assert.equal(TOOL_SETUP_LABELS.fitting, 'Outfit');
    assert.equal(TOOL_SETUP_LABELS.day, 'Day');
    assert.equal(TOOL_SETUP_LABELS.roleplay, 'Story');
  });

  it('exposes hub page descriptions', () => {
    assert.match(HUB_PAGE_DESCRIPTIONS.gallery.full, /experiments/);
    assert.match(HUB_PAGE_DESCRIPTIONS.gallery.simple, /Browse/);
    assert.match(HUB_PAGE_DESCRIPTIONS.settings.simple, /Essentials/);
    assert.match(HUB_PAGE_DESCRIPTIONS.profile.simple, /Appearance/);
  });

  it('omits section descriptions in simple workspace', () => {
    assert.equal(sectionDescriptionForWorkspace('simple', 'Verbose'), undefined);
    assert.equal(sectionDescriptionForWorkspace('studio', 'Verbose'), 'Verbose');
  });
});
