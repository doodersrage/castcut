'use client';

import ActionMenu, { ACTION_MENU_ITEM_CLASS } from '@/components/ui/ActionMenu';
import { scriptFountain, scriptHtml, storyboardHtml } from '@/lib/print/print-sheets';
import { downloadText, openPrintSheet, sheetFilename } from '@/lib/print/print-sheets-client';
import type { RoleplayStoryBeat } from '@/lib/story/roleplay';
import { storyScriptBlocks, storyStoryboardFrames } from '@/lib/story/story-sheets';

/**
 * Story → Sheets: the story as a script (screenplay layout, to print or save as PDF, or as a
 * Fountain file for a screenwriting app) and as a storyboard of its scenes' stills.
 */
export default function StorySheetsMenu({
  story,
  lead,
  title,
}: {
  story: readonly RoleplayStoryBeat[];
  lead: string;
  title: string;
}) {
  const name = title.trim() || (lead ? `${lead}'s story` : 'The story');
  const blocks = () => storyScriptBlocks(story, { lead });
  return (
    <ActionMenu label="Sheets" testId="story-sheets-menu">
      <button
        type="button"
        className={ACTION_MENU_ITEM_CLASS}
        disabled={story.length === 0}
        data-testid="story-sheet-script"
        title="The story as a screenplay — scenes, action, lines — to print or save as PDF"
        onClick={() => openPrintSheet(scriptHtml({ title: name, blocks: blocks() }))}
      >
        Script
      </button>
      <button
        type="button"
        className={ACTION_MENU_ITEM_CLASS}
        disabled={story.length === 0}
        data-testid="story-sheet-fountain"
        title="The script as a Fountain file — opens in Highland, Fade In, WriterSolo, Final Draft"
        onClick={() =>
          downloadText(
            scriptFountain({ title: name, blocks: blocks() }),
            sheetFilename(name, 'script.fountain')
          )
        }
      >
        Script (.fountain)
      </button>
      <button
        type="button"
        className={ACTION_MENU_ITEM_CLASS}
        disabled={story.length === 0}
        data-testid="story-sheet-storyboard"
        title="Every scene's still with what happens and its line — to print or save as PDF"
        onClick={() =>
          openPrintSheet(
            storyboardHtml({
              title: name,
              subtitle: `${story.length} scene${story.length === 1 ? '' : 's'}`,
              frames: storyStoryboardFrames(story),
              origin: window.location.origin,
            })
          )
        }
      >
        Storyboard
      </button>
    </ActionMenu>
  );
}
