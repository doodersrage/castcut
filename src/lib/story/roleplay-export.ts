import { buildZipBlob } from '../gallery-zip-export';
import {
  galleryEntryLightboxUrls,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '../comfyui-gallery';
import {
  formatRoleplayStoryMarkdown,
  lastCompletedRoleplayStillUrl,
  roleplayBeatPromptIds,
  roleplayStillBasename,
  slugRoleplayExportPart,
  type RoleplayBio,
  type RoleplayStoryBeat,
} from './roleplay';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function extFromResponse(contentType: string | null, url: string, fallback: string): string {
  const type = contentType?.toLowerCase() ?? '';
  if (type.includes('jpeg') || type.includes('jpg')) {
    return 'jpg';
  }
  if (type.includes('webp')) {
    return 'webp';
  }
  if (type.includes('gif')) {
    return 'gif';
  }
  if (type.startsWith('video/webm') || /\.webm(\?|#|$)/i.test(url)) {
    return 'webm';
  }
  if (type.startsWith('video/mp4') || type.includes('mp4') || /\.mp4(\?|#|$)/i.test(url)) {
    return 'mp4';
  }
  if (type.startsWith('video/quicktime') || /\.mov(\?|#|$)/i.test(url)) {
    return 'mov';
  }
  if (/\.jpe?g(\?|$)/i.test(url)) {
    return 'jpg';
  }
  if (/\.webp(\?|$)/i.test(url)) {
    return 'webp';
  }
  if (/\.gif(\?|$)/i.test(url)) {
    return 'gif';
  }
  return fallback;
}

function galleryUrlForPromptId(promptId: string | undefined): string | null {
  const id = promptId?.trim();
  if (!id) {
    return null;
  }
  const entry = loadComfyGallery().find(item => item.promptId === id);
  if (!entry) {
    return null;
  }
  return (
    galleryEntryLightboxUrls(entry)[0]?.trim() || galleryEntryPrimaryViewUrl(entry)?.trim() || null
  );
}

function clipUrlForBeat(beat: RoleplayStoryBeat): string | null {
  if (beat.clipStatus === 'completed' && beat.clipUrl?.trim()) {
    return beat.clipUrl.trim();
  }
  return galleryUrlForPromptId(beat.clipPromptId);
}

function stillUrlForBeat(beat: RoleplayStoryBeat): string | null {
  const shown = galleryUrlForPromptId(beat.promptId);
  if (shown) {
    return shown;
  }
  if (beat.stillStatus === 'completed' && beat.imageUrl?.trim()) {
    return beat.imageUrl.trim();
  }
  for (const promptId of [...roleplayBeatPromptIds(beat)].reverse()) {
    const url = galleryUrlForPromptId(promptId);
    if (url) {
      return url;
    }
  }
  return lastCompletedRoleplayStillUrl(beat);
}

export async function downloadRoleplayUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  triggerDownload(blob, filename);
}

export async function downloadRoleplayStoryBundle(input: {
  bio?: RoleplayBio | null;
  story: RoleplayStoryBeat[];
  tone?: string;
  content?: string;
  personaLabel?: string;
  film?: { filename: string; data: Uint8Array } | null;
}): Promise<{ files: number; stills: number; clips: number }> {
  const stillFilenames: Array<string | null> = [];
  const clipFilenames: Array<string | null> = [];
  const files: Array<{ filename: string; data: Uint8Array }> = [];

  for (const [index, beat] of input.story.entries()) {
    const url = stillUrlForBeat(beat);
    if (!url) {
      stillFilenames.push(null);
    } else {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          stillFilenames.push(null);
        } else {
          const ext = extFromResponse(response.headers.get('content-type'), url, 'png');
          const name = `${roleplayStillBasename(beat.title, index)}.${ext}`;
          files.push({
            filename: `stills/${name}`,
            data: new Uint8Array(await response.arrayBuffer()),
          });
          stillFilenames.push(name);
        }
      } catch {
        stillFilenames.push(null);
      }
    }

    const clipUrl = clipUrlForBeat(beat);
    if (!clipUrl) {
      clipFilenames.push(null);
      continue;
    }
    try {
      const response = await fetch(clipUrl);
      if (!response.ok) {
        clipFilenames.push(null);
        continue;
      }
      const ext = extFromResponse(response.headers.get('content-type'), clipUrl, 'mp4');
      const name = `${roleplayStillBasename(beat.title, index)}.${ext}`;
      files.push({
        filename: `clips/${name}`,
        data: new Uint8Array(await response.arrayBuffer()),
      });
      clipFilenames.push(name);
    } catch {
      clipFilenames.push(null);
    }
  }

  const filmFilename = input.film?.filename?.trim() || null;
  if (input.film?.data.length) {
    files.push({
      filename: input.film.filename.trim(),
      data: input.film.data,
    });
  }

  const markdown = formatRoleplayStoryMarkdown({
    bio: input.bio,
    story: input.story,
    tone: input.tone,
    content: input.content,
    personaLabel: input.personaLabel,
    stillFilenames,
    clipFilenames,
    filmFilename,
  });
  files.unshift({
    filename: 'story.md',
    data: new TextEncoder().encode(markdown),
  });

  const blob = buildZipBlob(files);
  const who = slugRoleplayExportPart(input.bio?.name || 'story', 'story');
  const day = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `roleplay-${who}-${day}.zip`);
  return {
    files: files.length,
    stills: stillFilenames.filter(Boolean).length,
    clips: clipFilenames.filter(Boolean).length,
  };
}
