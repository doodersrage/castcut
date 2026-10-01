'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  COMFY_IMAGE_MODELS,
  type ComfyImageModel,
  type ComfyImageModelDefinition,
} from '@/lib/comfy-models/client';
import type { ComfyUiModelLists } from '@/lib/comfyui-object-info';
import {
  fetchComfyObjectInfoModelsCached,
  readCachedComfyObjectInfoModels,
} from '@/lib/comfyui-object-info-cache';
import {
  installedComfyModels,
  MODEL_PICKER_GROUPS,
  modelMatchesQuery,
  modelPickerGroup,
  modelPickerTags,
  pushRecentModel,
  toggleStarredModel,
} from '@/lib/model-picker';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  loadSettingsCache,
  notifySettingsCacheUpdated,
  saveSharedSettings,
} from '@/lib/settings-cache';

type ModelSelectorProps = {
  value: ComfyImageModel;
  onChange: (model: ComfyImageModel) => void;
  id?: string;
  allowedModels?: readonly ComfyImageModel[];
  /** Why the list is limited to this tool's models (shown as a caption in the list). */
  filterHint?: string | null;
  onShowAllModels?: () => void;
  /** When true, open the list on mount. */
  defaultExpanded?: boolean;
};

const MODEL_ASSETS_HREF = '/settings?tab=comfyui&section=model-assets';

/** ComfyUI's model lists — undefined while asking, null when it didn't answer. */
function useComfyModelInventory(): ComfyUiModelLists | null | undefined {
  const [models, setModels] = useState<ComfyUiModelLists | null | undefined>(() =>
    typeof window === 'undefined' ? undefined : (readCachedComfyObjectInfoModels() ?? undefined)
  );
  useEffect(() => {
    let cancelled = false;
    void fetchComfyObjectInfoModelsCached()
      .then(result => {
        if (!cancelled) setModels(result ?? null);
      })
      .catch(() => {
        if (!cancelled) setModels(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return models;
}

type Row =
  | { kind: 'model'; key: string; entry: ComfyImageModelDefinition; installed: boolean | null }
  | { kind: 'more'; key: string; count: number };

type Section = { key: string; label: string; rows: Row[] };

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="model-picker-tags">
      {tags.map(tag => (
        <span key={tag} className="model-picker-tag">
          {tag}
        </span>
      ))}
    </span>
  );
}

/**
 * Engine model picker: a compact selected row, and a floating searchable list — Recent and
 * Starred first, then models grouped by job. Only installed models show until "Show more".
 */
export default function ModelSelector({
  value,
  onChange,
  id,
  allowedModels,
  filterHint,
  onShowAllModels,
  defaultExpanded = false,
}: ModelSelectorProps) {
  const listId = useId();
  const [open, setOpen] = useState(defaultExpanded);
  const [query, setQuery] = useState('');
  const [showMissing, setShowMissing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [prefs, setPrefs] = useState<{ recents: string[]; stars: string[] }>({
    recents: [],
    stars: [],
  });
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const inventory = useComfyModelInventory();

  const catalog = useMemo(() => {
    if (!allowedModels?.length) return COMFY_IMAGE_MODELS;
    const allowed = new Set(allowedModels);
    return COMFY_IMAGE_MODELS.filter(entry => allowed.has(entry.id));
  }, [allowedModels]);

  const installed = useMemo(() => {
    if (!inventory) return null;
    const map = installedComfyModels(
      COMFY_IMAGE_MODELS,
      inventory,
      loadSettingsCache().shared.modelCheckpointMap
    );
    // A tool whose models are all missing (e.g. no audio model yet) — don't hide everything.
    if (map && !catalog.some(entry => map.has(entry.id))) return null;
    return map;
    // Re-resolve when the list opens: the checkpoint map may have changed since mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, catalog, open]);

  const selected = useMemo(
    () => COMFY_IMAGE_MODELS.find(entry => entry.id === value) ?? COMFY_IMAGE_MODELS[0]!,
    [value]
  );
  const filteringActive =
    Boolean(allowedModels?.length) && catalog.length < COMFY_IMAGE_MODELS.length;

  const isInstalled = useCallback(
    (modelId: string): boolean | null => (installed ? installed.has(modelId) : null),
    [installed]
  );

  const sections = useMemo((): Section[] => {
    const modelRow = (entry: ComfyImageModelDefinition, section: string): Row => ({
      kind: 'model',
      key: `${section}:${entry.id}`,
      entry,
      installed: isInstalled(entry.id),
    });
    const visible = (entry: ComfyImageModelDefinition) =>
      showMissing || isInstalled(entry.id) !== false || entry.id === value;
    const matches = catalog.filter(entry => modelMatchesQuery(entry, query));
    const missingCount = matches.filter(entry => isInstalled(entry.id) === false).length;
    const moreRow: Row[] =
      !showMissing && missingCount > 0 ? [{ kind: 'more', key: 'more', count: missingCount }] : [];

    if (query.trim()) {
      const shown = matches.filter(visible);
      return [
        {
          key: 'results',
          label: 'Results',
          rows: [...shown.map(entry => modelRow(entry, 'r')), ...moreRow],
        },
      ];
    }
    const byId = new Map(catalog.map(entry => [entry.id, entry]));
    const pick = (ids: string[]) =>
      ids
        .map(modelId => byId.get(modelId as ComfyImageModel))
        .filter(Boolean) as ComfyImageModelDefinition[];
    const out: Section[] = [];
    const recents = pick(prefs.recents).filter(visible);
    if (recents.length)
      out.push({ key: 'recent', label: 'Recent', rows: recents.map(e => modelRow(e, 'recent')) });
    const stars = pick(prefs.stars).filter(visible);
    if (stars.length)
      out.push({ key: 'starred', label: 'Starred', rows: stars.map(e => modelRow(e, 'star')) });
    for (const group of MODEL_PICKER_GROUPS) {
      const rows = catalog
        .filter(entry => modelPickerGroup(entry) === group.id && visible(entry))
        .map(entry => modelRow(entry, group.id));
      if (rows.length) out.push({ key: group.id, label: group.label, rows });
    }
    if (moreRow.length) out.push({ key: 'more', label: '', rows: moreRow });
    return out;
  }, [catalog, isInstalled, prefs, query, showMissing, value]);

  const flatRows = useMemo(() => sections.flatMap(section => section.rows), [sections]);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(Math.max(rect.width, 320), window.innerWidth - margin * 2);
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    // Clear the fixed bottom tabs / top header (Film layout) as well as the viewport edge.
    const dock =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--bottom-dock-height')
      ) || 0;
    const header = Math.max(
      document.querySelector('header.fixed')?.getBoundingClientRect().bottom ?? 0,
      0
    );
    const below = window.innerHeight - dock - rect.bottom - margin;
    const above = rect.top - header - margin;
    const openAbove = below < 280 && above > below;
    const maxHeight = Math.min(520, openAbove ? above - 6 : below - 6);
    setPosition({
      top: openAbove ? Math.max(header + margin, rect.top - 6 - maxHeight) : rect.bottom + 6,
      left,
      width,
      maxHeight,
    });
  }, []);

  const openList = useCallback(() => {
    const shared = loadSettingsCache().shared;
    setPrefs({ recents: shared.modelRecents ?? [], stars: shared.modelStars ?? [] });
    setQuery('');
    setShowMissing(false);
    setActiveIndex(0);
    place();
    setOpen(true);
  }, [place]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    if (defaultExpanded) scheduleAfterCommit(openList);
    // Mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('keydown', onEscape, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, place, close]);

  useEffect(() => {
    if (!open) return;
    popoverRef.current
      ?.querySelector(`[data-row-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const selectModel = (model: ComfyImageModel) => {
    const shared = loadSettingsCache().shared;
    // Recents first, then the tool's own save (it reads the cache fresh).
    saveSharedSettings(
      { ...shared, modelRecents: pushRecentModel(shared.modelRecents, model) },
      { notify: false }
    );
    onChange(model);
    // Some tools save the model silently; the Engine chip re-reads on the update event.
    notifySettingsCacheUpdated();
    close();
  };

  const toggleStar = (model: string) => {
    const shared = loadSettingsCache().shared;
    const stars = toggleStarredModel(shared.modelStars, model);
    saveSharedSettings({ ...shared, modelStars: stars }, { notify: false });
    setPrefs(current => ({ ...current, stars }));
  };

  const activate = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === 'more') {
      setShowMissing(true);
      return;
    }
    selectModel(row.entry.id);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(flatRows.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activate(flatRows[activeIndex]);
    }
  };

  // Rows and stars are not focusable: keep typing and arrow keys in the search box.
  const keepSearchFocus = (event: React.MouseEvent) => event.preventDefault();

  const selectedTags = modelPickerTags(selected, installed?.get(selected.id));
  let rowIndex = -1;

  return (
    <div id={id}>
      <div ref={anchorRef} className="model-picker-current" title={selected.description}>
        <div className="min-w-0">
          <p className="model-picker-current-name">{selected.label}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Tags tags={selectedTags} />
            {isInstalled(selected.id) === false ? (
              <span className="model-picker-tag model-picker-tag-missing">Not installed</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          data-testid="model-selector-toggle"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          className="ui-btn-secondary ui-btn-sm shrink-0"
          onClick={() => (open ? close() : openList())}
        >
          Change
        </button>
      </div>

      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              className="model-picker-popover"
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
              onKeyDown={onKeyDown}
              data-testid="model-picker"
            >
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Search models…"
                aria-label="Search models"
                aria-controls={listId}
                aria-activedescendant={
                  flatRows[activeIndex] ? `${listId}-${activeIndex}` : undefined
                }
                className="ui-input model-picker-search"
              />
              {filteringActive ? (
                <p className="model-picker-caption">
                  {filterHint ?? 'Models this tool can run.'}
                  {onShowAllModels ? (
                    <>
                      {' '}
                      <button type="button" className="ui-text-link" onClick={onShowAllModels}>
                        All models
                      </button>
                    </>
                  ) : null}
                </p>
              ) : null}
              <div id={listId} role="listbox" aria-label="Models" className="model-picker-list">
                {flatRows.length === 0 ? (
                  <p className="model-picker-empty">No models match “{query.trim()}”.</p>
                ) : null}
                {sections.map(section => (
                  <div key={section.key} role="group" aria-label={section.label || undefined}>
                    {section.label ? <p className="model-picker-section">{section.label}</p> : null}
                    {section.rows.map(row => {
                      rowIndex += 1;
                      const index = rowIndex;
                      const active = index === activeIndex;
                      if (row.kind === 'more') {
                        return (
                          <div
                            key={row.key}
                            id={`${listId}-${index}`}
                            role="option"
                            aria-selected={active}
                            data-row-index={index}
                            className={`model-picker-row model-picker-more ${active ? 'model-picker-row-active' : ''}`}
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseDown={keepSearchFocus}
                            onClick={() => activate(row)}
                          >
                            Show {row.count} more (not installed)
                          </div>
                        );
                      }
                      const { entry } = row;
                      const starred = prefs.stars.includes(entry.id);
                      return (
                        <div
                          key={row.key}
                          id={`${listId}-${index}`}
                          role="option"
                          aria-selected={entry.id === value}
                          data-row-index={index}
                          title={entry.description}
                          className={`model-picker-row ${active ? 'model-picker-row-active' : ''} ${entry.id === value ? 'model-picker-row-current' : ''} ${row.installed === false ? 'model-picker-row-missing' : ''}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseDown={keepSearchFocus}
                          onClick={() => activate(row)}
                        >
                          <span className="model-picker-row-name">{entry.label}</span>
                          <Tags tags={modelPickerTags(entry, installed?.get(entry.id))} />
                          {row.installed === false ? (
                            <Link
                              href={MODEL_ASSETS_HREF}
                              className="model-picker-get"
                              onClick={event => event.stopPropagation()}
                            >
                              Get it
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            className={`model-picker-star ${starred ? 'model-picker-star-on' : ''}`}
                            aria-label={starred ? `Unstar ${entry.label}` : `Star ${entry.label}`}
                            aria-pressed={starred}
                            tabIndex={-1}
                            onMouseDown={keepSearchFocus}
                            onClick={event => {
                              event.stopPropagation();
                              toggleStar(entry.id);
                            }}
                          >
                            {starred ? '★' : '☆'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
