/**
 * A Story as production sheets (print-sheets.ts): its script in screenplay form — each scene a
 * heading, its blurb the action, the lead's line and the answer as dialogue, narration as the
 * lead's voice-over — and its storyboard, each scene's still with its notes. Pure.
 */

import type { ScriptBlock, StoryboardFrame } from '../film/print-sheets';
import { cameraChoiceSummary } from '../pose/camera-shot';
import { lastCompletedRoleplayStillUrl, type RoleplayStoryBeat } from './roleplay';

export type StorySheetNames = {
  /** Who says the lines (the Story's Cast). */
  lead: string;
  /** Who answers (a reply line); "Partner" when unknown. */
  partner?: string;
};

/** The Story as screenplay blocks, scene by scene. */
export function storyScriptBlocks(
  beats: readonly RoleplayStoryBeat[],
  names: StorySheetNames
): ScriptBlock[] {
  const lead = names.lead.trim() || 'She';
  const partner = names.partner?.trim() || 'Partner';
  const blocks: ScriptBlock[] = [];
  beats.forEach((beat, index) => {
    blocks.push({ kind: 'heading', text: `${index + 1}. ${beat.title?.trim() || 'Scene'}` });
    if (beat.blurb?.trim()) blocks.push({ kind: 'action', text: beat.blurb.trim() });
    if (beat.narration?.trim()) {
      blocks.push({ kind: 'dialogue', character: `${lead} (V.O.)`, text: beat.narration.trim() });
    }
    if (beat.line?.trim()) {
      blocks.push({
        kind: 'dialogue',
        character: lead,
        text: beat.line.trim(),
        ...(beat.lineTone && beat.lineTone !== 'natural'
          ? { parenthetical: String(beat.lineTone) }
          : {}),
      });
    }
    if (beat.replyLine?.trim()) {
      blocks.push({ kind: 'dialogue', character: partner, text: beat.replyLine.trim() });
    }
  });
  if (blocks.length) blocks.push({ kind: 'transition', text: 'Fade out.' });
  return blocks;
}

/** The Story's storyboard frames: each scene's still (the kept take) and its words. */
export function storyStoryboardFrames(beats: readonly RoleplayStoryBeat[]): StoryboardFrame[] {
  return beats.map((beat, index) => ({
    number: String(index + 1),
    image: lastCompletedRoleplayStillUrl(beat) || beat.imageUrl?.trim() || undefined,
    heading: beat.title?.trim() || `Scene ${index + 1}`,
    notes: [
      ['What happens', beat.blurb],
      ['Line', beat.line ? `“${beat.line}”${beat.replyLine ? ` / “${beat.replyLine}”` : ''}` : ''],
      ['Narration', beat.narration],
      ['Camera', cameraChoiceSummary(beat.poseCamera)],
      ['Clip', beat.clipStatus === 'completed' ? 'Yes' : ''],
    ],
  }));
}
