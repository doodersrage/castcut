'use client';

import EngineKeyCheckButton, { useEngineKeyCheck } from '@/components/settings/EngineKeyCheck';
import { useState } from 'react';
import type { SharedToolSettings } from '@/lib/settings-cache';
import {
  CLOUD_ENGINE_OPTIONS,
  DEFAULT_FAL_EXTEND_MODEL,
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_T2V_MODEL,
  DEFAULT_REPLICATE_I2V_MODEL,
  DEFAULT_REPLICATE_T2V_MODEL,
  DEFAULT_LUMA_I2V_MODEL,
  DEFAULT_LUMA_T2V_MODEL,
  DEFAULT_RUNWAY_EXTEND_MODEL,
  DEFAULT_RUNWAY_I2V_MODEL,
  DEFAULT_RUNWAY_T2V_MODEL,
  LUMA_I2V_MODEL_PRESETS,
  LUMA_T2V_MODEL_PRESETS,
  FAL_EXTEND_MODEL_PRESETS,
  FAL_I2V_MODEL_PRESETS,
  FAL_T2V_MODEL_PRESETS,
  REPLICATE_I2V_MODEL_PRESETS,
  REPLICATE_T2V_MODEL_PRESETS,
  RUNWAY_EXTEND_MODEL_PRESETS,
  RUNWAY_I2V_MODEL_PRESETS,
  RUNWAY_T2V_MODEL_PRESETS,
  normalizeEngineId,
  parseEngineId,
  type CloudEngineId,
} from '@/lib/engine/capabilities';
import { ToolSection } from '@/components/ui/ToolPageShell';

const FIELD_CLASS =
  'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-inner transition focus-visible:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]';

export type SettingsInferenceEnginePanelProps = {
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
};

export default function SettingsInferenceEnginePanel({
  sharedSettings,
  updateSharedSettings,
}: SettingsInferenceEnginePanelProps) {
  const [diffusersEnsureStatus, setDiffusersEnsureStatus] = useState<string | null>(null);
  const activeEngine = parseEngineId(sharedSettings.inferenceEngine) ?? 'comfyui';
  const activeCloud = CLOUD_ENGINE_OPTIONS.find(option => option.id === activeEngine);

  return (
    <ToolSection
      id="settings-comfyui-inference-engine"
      title="Inference engine"
      description="ComfyUI is the default generate path. Pick another engine below — only that engine’s keys and models appear."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="inference-engine" className="text-xs text-[var(--text-secondary)]">
            Active engine
          </label>
          <select
            id="inference-engine"
            value={activeEngine}
            onChange={event => {
              const next = normalizeEngineId(event.target.value);
              updateSharedSettings({
                inferenceEngine: next,
              });
              if (next === 'diffusers') {
                setDiffusersEnsureStatus('Ensuring Diffusers engine…');
                void fetch('/api/diffusers/ensure', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    engineUrl: sharedSettings.diffusersApiUrl?.trim() || undefined,
                    autoStart: sharedSettings.diffusersAutoStart !== false,
                  }),
                })
                  .then(async response => {
                    const data = (await response.json().catch(() => null)) as {
                      ok?: boolean;
                      started?: boolean;
                      alreadyRunning?: boolean;
                      error?: string;
                    } | null;
                    if (!response.ok) {
                      setDiffusersEnsureStatus(
                        data?.error || `Diffusers ensure failed (HTTP ${response.status}).`
                      );
                      return;
                    }
                    if (data?.alreadyRunning) {
                      setDiffusersEnsureStatus('Diffusers already running.');
                    } else if (data?.started) {
                      setDiffusersEnsureStatus('Diffusers started.');
                    } else {
                      setDiffusersEnsureStatus('Diffusers ready.');
                    }
                  })
                  .catch(error => {
                    setDiffusersEnsureStatus(
                      error instanceof Error ? error.message : 'Diffusers ensure failed.'
                    );
                  });
              } else {
                setDiffusersEnsureStatus(null);
              }
            }}
            className={FIELD_CLASS}
          >
            <option value="comfyui">ComfyUI (primary generate)</option>
            <option value="diffusers">Diffusers (stills only)</option>
            {CLOUD_ENGINE_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {diffusersEnsureStatus ? (
            <p className="text-xs text-[var(--text-muted)]">{diffusersEnsureStatus}</p>
          ) : null}
        </div>

        {activeEngine === 'comfyui' ? (
          <p className="text-xs text-[var(--text-muted)] sm:col-span-2">
            Connection, workflows, and loader maps live in the ComfyUI sections below. Cloud keys
            stay saved — switch Active engine to edit them.
          </p>
        ) : null}

        {activeEngine === 'diffusers' ? (
          <>
            <div className="space-y-1">
              <label htmlFor="diffusers-url" className="text-xs text-[var(--text-secondary)]">
                Diffusers API URL
              </label>
              <input
                id="diffusers-url"
                value={sharedSettings.diffusersApiUrl ?? ''}
                onChange={event => updateSharedSettings({ diffusersApiUrl: event.target.value })}
                placeholder="http://127.0.0.1:8190"
                className={FIELD_CLASS}
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="diffusers-workshop-crop"
                className="text-xs text-[var(--text-secondary)]"
              >
                Workshop crop (hide hands)
              </label>
              <select
                id="diffusers-workshop-crop"
                value={sharedSettings.diffusersWorkshopCrop ?? 'auto'}
                onChange={event => {
                  const value = event.target.value;
                  updateSharedSettings({
                    diffusersWorkshopCrop: value === 'always' || value === 'never' ? value : 'auto',
                  });
                }}
                className={FIELD_CLASS}
              >
                <option value="auto">Auto (glassblower / blacksmith / …)</option>
                <option value="always">Always crop hands</option>
                <option value="never">Allow hands in frame</option>
              </select>
            </div>
            <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
              <input
                type="checkbox"
                checked={sharedSettings.diffusersAutoStart !== false}
                onChange={event =>
                  updateSharedSettings({
                    diffusersAutoStart: event.target.checked,
                  })
                }
                className="mt-0.5 rounded border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-primary)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              />
              <span className="space-y-0.5">
                <span className="block text-sm text-[var(--text-primary)]">
                  Auto-start Diffusers when offline
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Spawns{' '}
                  <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
                    services/diffusers-engine
                  </code>{' '}
                  for localhost URLs. Kill-switch:{' '}
                  <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
                    DIFFUSERS_AUTOSTART=0
                  </code>
                  .
                </span>
              </span>
            </label>
          </>
        ) : null}

        {activeCloud ? (
          <CloudEngineFields
            engineId={activeCloud.id}
            sharedSettings={sharedSettings}
            updateSharedSettings={updateSharedSettings}
            tokenLabel={activeCloud.tokenLabel}
            tokenPlaceholder={activeCloud.tokenPlaceholder}
            sessionTokenField={activeCloud.sessionTokenField}
            modelField={activeCloud.modelField}
            img2imgField={activeCloud.img2imgField}
            shortLabel={activeCloud.shortLabel}
            defaultTxt2Img={activeCloud.defaultTxt2Img}
            defaultImg2Img={activeCloud.defaultImg2Img}
            presets={activeCloud.presets}
          />
        ) : null}
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Server env keys (
        <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
          FAL_KEY
        </code>
        ,{' '}
        <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
          REPLICATE_API_TOKEN
        </code>
        ,{' '}
        <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
          OPENAI_API_KEY
        </code>
        ,{' '}
        <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
          GEMINI_API_KEY
        </code>
        ,{' '}
        <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
          XAI_API_KEY
        </code>
        ,{' '}
        <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
          RUNWAY_API_KEY
        </code>
        ,{' '}
        <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
          LUMA_API_KEY
        </code>
        ) apply when the matching Settings field is empty. Default engine via{' '}
        <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
          PROMPT_ENGINE
        </code>
        .
      </p>
    </ToolSection>
  );
}

type CloudEngineOption = (typeof CLOUD_ENGINE_OPTIONS)[number];

function CloudEngineFields(props: {
  engineId: CloudEngineId;
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  tokenLabel: string;
  tokenPlaceholder: string;
  sessionTokenField: CloudEngineOption['sessionTokenField'];
  modelField: CloudEngineOption['modelField'];
  img2imgField: CloudEngineOption['img2imgField'];
  shortLabel: string;
  defaultTxt2Img: string;
  defaultImg2Img: string;
  presets: CloudEngineOption['presets'];
}) {
  const {
    engineId,
    sharedSettings,
    updateSharedSettings,
    tokenLabel,
    tokenPlaceholder,
    sessionTokenField,
    modelField,
    img2imgField,
    shortLabel,
    defaultTxt2Img,
    defaultImg2Img,
    presets,
  } = props;
  const tokenValue = sharedSettings[sessionTokenField] ?? '';
  const modelValue = sharedSettings[modelField] ?? '';
  const img2imgValue = sharedSettings[img2imgField] ?? '';
  const listId = `${engineId}-model-presets`;
  const showStills = engineId !== 'luma';
  const keyCheck = useEngineKeyCheck(engineId);

  return (
    <>
      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={`${engineId}-api-token`} className="text-xs text-[var(--text-secondary)]">
          {tokenLabel}
        </label>
        <input
          id={`${engineId}-api-token`}
          type="password"
          autoComplete="off"
          value={tokenValue}
          onChange={event => {
            keyCheck.clear();
            updateSharedSettings({
              [sessionTokenField]: event.target.value.trim() || undefined,
            });
          }}
          onPaste={event => {
            // A pasted key is checked right away.
            const pasted = event.clipboardData.getData('text').trim();
            if (pasted) void keyCheck.check(pasted);
          }}
          placeholder={tokenPlaceholder}
          className={FIELD_CLASS}
        />
        <EngineKeyCheckButton
          engineId={engineId}
          result={keyCheck.result}
          checking={keyCheck.checking}
          onCheck={() => void keyCheck.check(tokenValue)}
        />
      </div>
      {showStills ? (
        <>
          <div className="space-y-1">
            <label htmlFor={`${engineId}-model`} className="text-xs text-[var(--text-secondary)]">
              {shortLabel} txt2img model
            </label>
            <input
              id={`${engineId}-model`}
              list={listId}
              value={modelValue}
              onChange={event =>
                updateSharedSettings({
                  [modelField]: event.target.value,
                })
              }
              placeholder={defaultTxt2Img}
              className={FIELD_CLASS}
            />
            <datalist id={listId}>
              {presets.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <label
              htmlFor={`${engineId}-img2img-model`}
              className="text-xs text-[var(--text-secondary)]"
            >
              {shortLabel} image-to-image model
            </label>
            <input
              id={`${engineId}-img2img-model`}
              list={listId}
              value={img2imgValue}
              onChange={event =>
                updateSharedSettings({
                  [img2imgField]: event.target.value,
                })
              }
              placeholder={defaultImg2Img}
              className={FIELD_CLASS}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-[var(--text-muted)] sm:col-span-2">
          Luma is clips only (Ray). Stills queue returns an error so you can switch engines.
        </p>
      )}

      {engineId === 'fal' ? (
        <>
          <VideoModelField
            id="fal-i2v-model"
            label="Fal image-to-video model"
            listId="fal-i2v-model-presets"
            value={sharedSettings.falI2vModel ?? ''}
            placeholder={DEFAULT_FAL_I2V_MODEL}
            presets={FAL_I2V_MODEL_PRESETS}
            onChange={value => updateSharedSettings({ falI2vModel: value })}
          />
          <VideoModelField
            id="fal-t2v-model"
            label="Fal text-to-video model"
            listId="fal-t2v-model-presets"
            value={sharedSettings.falT2vModel ?? ''}
            placeholder={DEFAULT_FAL_T2V_MODEL}
            presets={FAL_T2V_MODEL_PRESETS}
            onChange={value => updateSharedSettings({ falT2vModel: value })}
          />
          <VideoModelField
            id="fal-extend-model"
            label="Fal extend-video model"
            listId="fal-extend-model-presets"
            value={sharedSettings.falExtendModel ?? ''}
            placeholder={DEFAULT_FAL_EXTEND_MODEL}
            presets={FAL_EXTEND_MODEL_PRESETS}
            onChange={value => updateSharedSettings({ falExtendModel: value })}
          />
        </>
      ) : null}

      {engineId === 'replicate' ? (
        <>
          <VideoModelField
            id="replicate-i2v-model"
            label="Replicate image-to-video model"
            listId="replicate-i2v-model-presets"
            value={sharedSettings.replicateI2vModel ?? ''}
            placeholder={DEFAULT_REPLICATE_I2V_MODEL}
            presets={REPLICATE_I2V_MODEL_PRESETS}
            onChange={value => updateSharedSettings({ replicateI2vModel: value })}
          />
          <VideoModelField
            id="replicate-t2v-model"
            label="Replicate text-to-video model"
            listId="replicate-t2v-model-presets"
            value={sharedSettings.replicateT2vModel ?? ''}
            placeholder={DEFAULT_REPLICATE_T2V_MODEL}
            presets={REPLICATE_T2V_MODEL_PRESETS}
            onChange={value => updateSharedSettings({ replicateT2vModel: value })}
          />
        </>
      ) : null}

      {engineId === 'runway' ? (
        <>
          <VideoModelField
            id="runway-i2v-model"
            label="Runway image-to-video model"
            listId="runway-i2v-model-presets"
            value={sharedSettings.runwayI2vModel ?? ''}
            placeholder={DEFAULT_RUNWAY_I2V_MODEL}
            presets={RUNWAY_I2V_MODEL_PRESETS}
            onChange={value => updateSharedSettings({ runwayI2vModel: value })}
          />
          <VideoModelField
            id="runway-t2v-model"
            label="Runway text-to-video model"
            listId="runway-t2v-model-presets"
            value={sharedSettings.runwayT2vModel ?? ''}
            placeholder={DEFAULT_RUNWAY_T2V_MODEL}
            presets={RUNWAY_T2V_MODEL_PRESETS}
            onChange={value => updateSharedSettings({ runwayT2vModel: value })}
          />
          <VideoModelField
            id="runway-extend-model"
            label="Runway video-to-video / extend model"
            listId="runway-extend-model-presets"
            value={sharedSettings.runwayExtendModel ?? ''}
            placeholder={DEFAULT_RUNWAY_EXTEND_MODEL}
            presets={RUNWAY_EXTEND_MODEL_PRESETS}
            onChange={value => updateSharedSettings({ runwayExtendModel: value })}
          />
        </>
      ) : null}

      {engineId === 'luma' ? (
        <>
          <VideoModelField
            id="luma-i2v-model"
            label="Luma image-to-video model"
            listId="luma-i2v-model-presets"
            value={sharedSettings.lumaI2vModel ?? ''}
            placeholder={DEFAULT_LUMA_I2V_MODEL}
            presets={LUMA_I2V_MODEL_PRESETS}
            onChange={value => updateSharedSettings({ lumaI2vModel: value })}
          />
          <VideoModelField
            id="luma-t2v-model"
            label="Luma text-to-video model"
            listId="luma-t2v-model-presets"
            value={sharedSettings.lumaT2vModel ?? ''}
            placeholder={DEFAULT_LUMA_T2V_MODEL}
            presets={LUMA_T2V_MODEL_PRESETS}
            onChange={value => updateSharedSettings({ lumaT2vModel: value })}
          />
        </>
      ) : null}
    </>
  );
}

function VideoModelField(props: {
  id: string;
  label: string;
  listId: string;
  value: string;
  placeholder: string;
  presets: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1 sm:col-span-2">
      <label htmlFor={props.id} className="text-xs text-[var(--text-secondary)]">
        {props.label}
      </label>
      <input
        id={props.id}
        list={props.listId}
        value={props.value}
        onChange={event => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className={FIELD_CLASS}
      />
      <datalist id={props.listId}>
        {props.presets.map(preset => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
      </datalist>
    </div>
  );
}
