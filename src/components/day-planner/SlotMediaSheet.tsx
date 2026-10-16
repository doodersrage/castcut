'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton, FieldError, TextInput } from '@/components/ui/Field';
import SideSheet from '@/components/ui/SideSheet';
import { MUSIC_DANCE_AMPLITUDES, MUSIC_DANCE_STYLES } from '@/lib/music-dance';
import { RELIGHT_LOOKS } from '@/lib/relight';

export type SlotMediaSheetKind = 'moves' | 'dance' | 'lip-sync' | 'relight';

const COPY: Record<SlotMediaSheetKind, { title: string; description: string }> = {
  moves: {
    title: 'Copy moves from a video',
    description:
      'Film yourself (or pick any video of one person): the still’s person does the same moves — body, hands and face. Up to 30 seconds; a few minutes to render.',
  },
  dance: {
    title: 'Dance to music',
    description:
      'Pick a song: the still’s person dances to it, on the beat. Up to 30 seconds from where you start; several minutes to render.',
  },
  'lip-sync': {
    title: 'Lip-sync to a recording',
    description:
      'Record a line or pick an audio file (your voice, a TTS file, a song): the still’s person says it. Two people in the still? Give the one on the right a recording too — they answer after the one on the left. Up to 30 seconds; a few minutes to render.',
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
  /** `audio2`: the right-hand person's recording, said after the left-hand person's. */
  onLipSync: (audio: Blob, audio2: Blob | null) => void;
  onDance?: (music: Blob, options: { style: string; amplitude: string; start?: number }) => void;
  onRelight: (look: string) => void;
};

/** Day slot / Story scene finishing tools that need something from the player first. */
export default function SlotMediaSheet(props: SlotMediaSheetProps) {
  // Keyed by the tool: closing unmounts it, so a new open starts empty.
  return props.kind ? <SlotMediaSheetOpen key={props.kind} {...props} kind={props.kind} /> : null;
}

/** Record a line in the browser or pick an audio file. */
function AudioPick({
  label,
  testId,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  value: Blob | null;
  onChange: (audio: Blob | null, recording: boolean) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(false);
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
        setRecording(false);
        setRecorded(true);
        onChange(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      onChange(null, true);
      // The model takes 30 seconds at most.
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 30_000);
    } catch {
      setError('The microphone is not available here — pick an audio file instead.');
    }
  };

  return (
    <div className="space-y-2">
      <span className="type-label block">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => (recording ? recorderRef.current?.stop() : void record())}
          data-testid={`${testId}-record`}
        >
          {recording ? 'Stop recording' : recorded && value ? 'Record again' : 'Record a line'}
        </Button>
        <span className="type-caption text-[var(--text-muted)]">
          {recording ? 'Recording… (30 seconds at most)' : value ? 'Ready.' : 'or pick a file:'}
        </span>
      </div>
      <input
        type="file"
        accept="audio/*,video/*"
        aria-label={`${label} — audio file`}
        className="block w-full text-sm"
        data-testid={testId}
        onChange={event => {
          setRecorded(false);
          onChange(event.target.files?.[0] ?? null, false);
        }}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

function SlotMediaSheetOpen({
  kind,
  onClose,
  onMoves,
  onLipSync,
  onDance,
  onRelight,
}: SlotMediaSheetProps & { kind: SlotMediaSheetKind }) {
  const [style, setStyle] = useState<string>('street');
  const [amplitude, setAmplitude] = useState<string>('medium');
  const [start, setStart] = useState('');
  const testId = 'slot-media-sheet';
  const [file, setFile] = useState<File | null>(null);
  const [motion, setMotion] = useState('');
  const [keepSound, setKeepSound] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audio2, setAudio2] = useState<Blob | null>(null);
  const [recording, setRecording] = useState({ first: false, second: false });
  const copy = COPY[kind];

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
              disabled={
                kind === 'moves' || kind === 'dance'
                  ? !file
                  : !audio || recording.first || recording.second
              }
              data-testid={`${testId}-start`}
              onClick={() => {
                if (kind === 'moves' && file) onMoves(file, { motion, keepSound });
                if (kind === 'lip-sync' && audio) onLipSync(audio, audio2);
                if (kind === 'dance' && file)
                  onDance?.(file, { style, amplitude, start: Number(start) || 0 });
                onClose();
              }}
            >
              {kind === 'moves' ? 'Copy the moves' : kind === 'dance' ? 'Dance' : 'Lip-sync'}
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

        {kind === 'dance' ? (
          <>
            <label className="block space-y-1">
              <span className="type-label">Song</span>
              <input
                type="file"
                accept="audio/*,video/*"
                className="block w-full text-sm"
                data-testid={`${testId}-music`}
                onChange={event => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block space-y-1">
              <span className="type-label">Start at (seconds into the song)</span>
              <TextInput
                inputMode="numeric"
                value={start}
                placeholder="0"
                onChange={event => setStart(event.target.value.replace(/[^0-9.]/g, ''))}
                data-testid={`${testId}-start-at`}
              />
            </label>
            <div className="space-y-1">
              <span className="type-label block">Style</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Dance style">
                {MUSIC_DANCE_STYLES.map(option => (
                  <ChipButton
                    key={option.id}
                    active={style === option.id}
                    data-testid={`${testId}-style-${option.id}`}
                    onClick={() => setStyle(option.id)}
                  >
                    {option.label}
                  </ChipButton>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <span className="type-label block">How big the moves are</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Move size">
                {MUSIC_DANCE_AMPLITUDES.map(option => (
                  <ChipButton
                    key={option.id}
                    active={amplitude === option.id}
                    onClick={() => setAmplitude(option.id)}
                  >
                    {option.label}
                  </ChipButton>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {kind === 'lip-sync' ? (
          <>
            <AudioPick
              label="What they say (with two people: the one on the left)"
              testId={`${testId}-audio`}
              value={audio}
              onChange={(next, live) => {
                setAudio(next);
                setRecording(state => ({ ...state, first: live }));
              }}
            />
            <AudioPick
              label="The person on the right answers (optional)"
              testId={`${testId}-audio-2`}
              value={audio2}
              onChange={(next, live) => {
                setAudio2(next);
                setRecording(state => ({ ...state, second: live }));
              }}
            />
          </>
        ) : null}
      </div>
    </SideSheet>
  );
}
