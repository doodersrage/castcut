'use client';

import { useEffect, useRef, useState } from 'react';
import { TextInput } from '@/components/ui/Field';
import {
  normalizeSpokenLine,
  SPOKEN_LINE_MAX_CHARS,
  SPOKEN_LINE_TONES,
  type SpokenLineTone,
} from '@/lib/ltx25-renderer';

/**
 * What the lead says in a clip (Story scene / Day slot). A line makes Animate render a talking
 * clip on LTX-2.5 — the words spoken to the camera, lip-synced, saved with sound. Saves on blur
 * or Enter. A suggestion (the Story writer's, or "Suggest a line" from the LLM) is one tap — a
 * clip only talks when the player puts a line in.
 */
export default function SpokenLineField({
  line,
  disabled = false,
  onSave,
  testId = 'spoken-line',
  hasVoice = false,
  suggestion,
  onSuggest,
  note,
  fullFrame = false,
  onFullFrameChange,
  reply,
  onReplySave,
  onSuggestReply,
  tone,
  onToneChange,
}: {
  line?: string;
  disabled?: boolean;
  onSave: (line: string) => void;
  testId?: string;
  /** The Cast has a voice sample — say the line will use it. */
  hasVoice?: boolean;
  /** A line already written for this scene (Story's writer). */
  suggestion?: string;
  /** Ask for a fresh line (LLM). Rejects with a message to show. */
  onSuggest?: () => Promise<string>;
  /** A caveat under the field (e.g. clips here render without sound). */
  note?: string;
  /** Keep the whole still for the talking clip (else it starts chest-up when the face is small). */
  fullFrame?: boolean;
  onFullFrameChange?: (fullFrame: boolean) => void;
  /** Two-person stills: what the other person answers (a one-shot conversation). */
  reply?: string;
  onReplySave?: (reply: string) => void;
  /** Ask for the other person's answer to the line (LLM). */
  onSuggestReply?: (line: string) => Promise<string>;
  /** How the line is said (unset = natural). */
  tone?: SpokenLineTone;
  onToneChange?: (tone: SpokenLineTone) => void;
}) {
  const [value, setValue] = useState(line ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const replyRef = useRef<HTMLInputElement>(null);
  const [replyValue, setReplyValue] = useState(reply ?? '');
  const commitReply = (raw = replyValue) => {
    const next = normalizeSpokenLine(raw);
    setReplyValue(next);
    if (next !== (reply ?? '')) onReplySave?.(next);
  };
  const askReply = async () => {
    if (!onSuggestReply || !value.trim()) return;
    setAsking(true);
    setError(null);
    try {
      commitReply(await onSuggestReply(value.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not suggest a reply.');
    } finally {
      refocusRef.current = replyRef;
      setAsking(false);
    }
  };
  const [asking, setAsking] = useState(false);
  // Focus to restore after writing: done after the re-render that enables the field (a
  // requestAnimationFrame could run first and focus a still-disabled input).
  const refocusRef = useRef<typeof inputRef | null>(null);
  useEffect(() => {
    if (asking || !refocusRef.current) return;
    refocusRef.current.current?.focus();
    refocusRef.current = null;
  }, [asking]);
  const [error, setError] = useState<string | null>(null);
  const commit = (raw = value) => {
    const next = normalizeSpokenLine(raw);
    setValue(next);
    if (next !== (line ?? '')) onSave(next);
  };
  const offered = suggestion?.trim() && suggestion.trim() !== value.trim() ? suggestion.trim() : '';
  const ask = async () => {
    if (!onSuggest) return;
    setAsking(true);
    setError(null);
    try {
      commit(await onSuggest());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not suggest a line.');
    } finally {
      // The tapped button was disabled while writing, which drops focus out of the sheet (and
      // Escape stops closing it) — put it back in the field once it is enabled again.
      refocusRef.current = inputRef;
      setAsking(false);
    }
  };
  return (
    <div className="space-y-1" data-testid={testId}>
      <label className="type-caption block text-[var(--text-muted)]" htmlFor={`${testId}-input`}>
        Line in the clip (optional)
      </label>
      <TextInput
        ref={inputRef}
        id={`${testId}-input`}
        value={value}
        disabled={disabled || asking}
        maxLength={SPOKEN_LINE_MAX_CHARS + 10}
        placeholder="Honestly? Best part of my day."
        data-testid={`${testId}-input`}
        onChange={event => setValue(event.target.value)}
        onBlur={() => commit()}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      {offered || onSuggest ? (
        <div className="flex flex-wrap items-center gap-2">
          {offered ? (
            <button
              type="button"
              className="ui-chip max-w-full truncate text-left"
              disabled={disabled || asking}
              title="Use this line"
              data-testid={`${testId}-use-suggestion`}
              onClick={() => commit(offered)}
            >
              Use “{offered}”
            </button>
          ) : null}
          {onSuggest ? (
            <button
              type="button"
              className="ui-chip"
              disabled={disabled || asking}
              data-testid={`${testId}-suggest`}
              onClick={() => void ask()}
            >
              {asking ? 'Writing a line…' : value.trim() ? 'Another line' : 'Suggest a line'}
            </button>
          ) : null}
          {value.trim() ? (
            <button
              type="button"
              className="ui-chip"
              disabled={disabled || asking}
              data-testid={`${testId}-clear`}
              onClick={() => commit('')}
            >
              No line
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="type-caption text-[var(--tint-danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
      {note ? <p className="type-caption text-[var(--text-muted)]">{note}</p> : null}
      {onToneChange && value.trim() ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="How it is said"
          data-testid={`${testId}-tone`}
        >
          <span className="type-caption text-[var(--text-muted)]">How</span>
          {SPOKEN_LINE_TONES.map(option => {
            const active = (tone ?? 'natural') === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className="ui-chip"
                data-active={active ? 'true' : 'false'}
                aria-pressed={active}
                disabled={disabled || asking}
                data-testid={`${testId}-tone-${option.id}`}
                onClick={() => onToneChange(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {onReplySave && value.trim() ? (
        <div className="space-y-1">
          <label
            className="type-caption block text-[var(--text-muted)]"
            htmlFor={`${testId}-reply-input`}
          >
            Their reply (two-person stills — a conversation in one shot)
          </label>
          <TextInput
            ref={replyRef}
            id={`${testId}-reply-input`}
            value={replyValue}
            disabled={disabled || asking}
            maxLength={SPOKEN_LINE_MAX_CHARS + 10}
            placeholder="Only because you were snoring."
            data-testid={`${testId}-reply-input`}
            onChange={event => setReplyValue(event.target.value)}
            onBlur={() => commitReply()}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitReply();
              }
            }}
          />
          {onSuggestReply ? (
            <button
              type="button"
              className="ui-chip"
              disabled={disabled || asking}
              data-testid={`${testId}-suggest-reply`}
              onClick={() => void askReply()}
            >
              {asking ? 'Writing…' : replyValue.trim() ? 'Another reply' : 'Suggest a reply'}
            </button>
          ) : null}
        </div>
      ) : null}
      {onFullFrameChange && value.trim() ? (
        <label className="type-caption flex items-center gap-2 text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={fullFrame}
            disabled={disabled}
            data-testid={`${testId}-full-frame`}
            onChange={event => onFullFrameChange(event.target.checked)}
          />
          Keep the full frame (a small face lip-syncs less clearly)
        </label>
      ) : null}
      <p className="type-caption text-[var(--text-muted)]">
        {value.trim()
          ? `Animate makes a talking clip: they say this to the camera, with sound (LTX-2.5, about 5 s)${hasVoice ? ', in their voice' : ''}. ${fullFrame ? 'Starts from the whole still.' : 'Starts chest-up when the face is small in the still, so the lips can be read.'}`
          : 'Add a few words and Animate makes a talking clip with sound.'}
      </p>
    </div>
  );
}
