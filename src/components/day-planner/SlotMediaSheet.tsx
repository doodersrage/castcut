'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError, TextInput } from '@/components/ui/Field';
import SideSheet from '@/components/ui/SideSheet';
import { RELIGHT_LOOKS } from '@/lib/relight';

export type SlotMediaSheetKind = 'moves' | 'lip-sync' | 'relight';

const COPY: Record<SlotMediaSheetKind, { title: string; description: string }> = {
  moves: {
    title: 'Copy moves from a video',
    description:
      'Film yourself (or pick any video of one person): the still’s person does the same moves — body, hands and face. Up to 30 seconds; a few minutes to render.',
  },
  'lip-sync': {
    title: 'Lip-sync to a recording',
    description:
      'Record a line or pick an audio file (your voice, a TTS file, a song): the still’s person says it. Up to 30 seconds; a few minutes to render.',
  },
  relight: {
    title: 'Relight',
    description:
      'The same picture in a different light — everything else kept. The original stays in the Gallery.',
  },
};

type SlotMediaSheetProps = {
  kind: SlotMediaSheetKind | null;
  onClose: () => void;
  onMoves: (video: Blob, options: { motion?: string; keepSound?: boolean }) => void;
  onLipSync: (audio: Blob) => void;
  onRelight: (look: string) => void;
};

/** Day slot finishing tools that need something from the player first (useDaySlotMediaTools). */
export default function SlotMediaSheet(props: SlotMediaSheetProps) {
  // Keyed by the tool: closing unmounts it, so a new open starts empty.
  return props.kind ? <SlotMediaSheetOpen key={props.kind} {...props} kind={props.kind} /> : null;
}

function SlotMediaSheetOpen({
  kind,
  onClose,
  onMoves,
  onLipSync,
  onRelight,
}: SlotMediaSheetProps & { kind: SlotMediaSheetKind }) {
  const testId = 'slot-media-sheet';
  const [file, setFile] = useState<File | null>(null);
  const [motion, setMotion] = useState('');
  const [keepSound, setKeepSound] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // Closing mid-recording lets go of the microphone.
  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach(track => track.stop());
    },
    []
  );

  const record = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        setRecorded(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecorded(null);
      setFile(null);
      // The model takes 30 seconds at most.
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 30_000);
    } catch {
      setError('The microphone is not available here — pick an audio file instead.');
    }
  };

  const copy = COPY[kind];
  const audio = recorded ?? file;

  return (
    <SideSheet
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      testId={testId}
      footer={
        kind === 'relight' ? (
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={kind === 'moves' ? !file : !audio || recording}
              data-testid={`${testId}-start`}
              onClick={() => {
                if (kind === 'moves' && file) onMoves(file, { motion, keepSound });
                if (kind === 'lip-sync' && audio) onLipSync(audio);
                onClose();
              }}
            >
              {kind === 'moves' ? 'Copy the moves' : 'Lip-sync'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {kind === 'relight' ? (
          <div className="grid grid-cols-2 gap-2" data-testid={`${testId}-looks`}>
            {RELIGHT_LOOKS.map(look => (
              <Button
                key={look.id}
                type="button"
                variant="secondary"
                title={look.light}
                data-testid={`${testId}-look-${look.id}`}
                onClick={() => {
                  onRelight(look.id);
                  onClose();
                }}
              >
                {look.label}
              </Button>
            ))}
          </div>
        ) : null}

        {kind === 'moves' ? (
          <>
            <label className="block space-y-1">
              <span className="type-label">Video</span>
              <input
                type="file"
                accept="video/*"
                capture="user"
                className="block w-full text-sm"
                data-testid={`${testId}-video`}
                onChange={event => setFile(event.target.files?.[0] ?? null)}
              />
              <span className="type-caption block text-[var(--text-muted)]">
                Frame it like the still — full body to full body, head and shoulders to head and
                shoulders. 80 MB at most.
              </span>
            </label>
            <label className="block space-y-1">
              <span className="type-label">What happens in it (optional)</span>
              <TextInput
                value={motion}
                maxLength={200}
                placeholder="A woman dancing to music, spinning and waving her arms"
                onChange={event => setMotion(event.target.value)}
                data-testid={`${testId}-motion`}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={keepSound}
                onChange={event => setKeepSound(event.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Keep the video’s sound (talking, music)
            </label>
          </>
        ) : null}

        {kind === 'lip-sync' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => (recording ? recorderRef.current?.stop() : void record())}
                data-testid={`${testId}-record`}
              >
                {recording ? 'Stop recording' : recorded ? 'Record again' : 'Record a line'}
              </Button>
              <span className="type-caption text-[var(--text-muted)]">
                {recording
                  ? 'Recording… (30 seconds at most)'
                  : recorded
                    ? 'Recorded — ready.'
                    : 'or pick a file below.'}
              </span>
            </div>
            <label className="block space-y-1">
              <span className="type-label">Audio file</span>
              <input
                type="file"
                accept="audio/*,video/*"
                className="block w-full text-sm"
                data-testid={`${testId}-audio`}
                onChange={event => {
                  setFile(event.target.files?.[0] ?? null);
                  setRecorded(null);
                }}
              />
            </label>
          </>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </SideSheet>
  );
}
