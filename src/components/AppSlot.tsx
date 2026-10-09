'use client';

import { useSyncExternalStore, type ComponentType, type ReactNode } from 'react';

/**
 * Named places in shared screens that features fill (docs/architecture-boundaries.md): the shared
 * screen renders <AppSlot name="…" /> (or asks useAppSlotRenderer for a slot one feature owns),
 * Play registers what goes there from PlayAppSlots, so the shared screen never imports Play.
 * Nothing registered = nothing rendered (the classic app gets its plain fallback).
 */
export type GalleryEmptySlotProps = {
  filtered: boolean;
  onClearFilters: () => void;
  onUpload?: () => void;
  /** When Gallery is filtered to films, offer Cut/Remix instead of only Clear. */
  derivedKind?: string | null;
  characterId?: string | null;
};

/** Each slot and the props its components get. */
export type AppSlotProps = {
  'home.top': Record<never, never>;
  'home.metrics': Record<never, never>;
  'queue.top': Record<never, never>;
  'gallery.empty': GalleryEmptySlotProps;
};

export type AppSlotName = keyof AppSlotProps;

type Entry<N extends AppSlotName> = {
  id: string;
  component: ComponentType<AppSlotProps[N]>;
  order: number;
};

const slots = new Map<AppSlotName, Entry<AppSlotName>[]>();
const listeners = new Set<() => void>();
let version = 0;

/** Put `component` in slot `name` (re-registering the same id replaces it). */
export function registerAppSlot<N extends AppSlotName>(
  name: N,
  id: string,
  component: ComponentType<AppSlotProps[N]>,
  order = 0
): void {
  const entries = (slots.get(name) ?? []).filter(entry => entry.id !== id);
  entries.push({ id, component, order } as unknown as Entry<AppSlotName>);
  entries.sort((a, b) => a.order - b.order);
  slots.set(name, entries);
  version += 1;
  for (const listener of listeners) listener();
}

/** The components registered for a slot, in order. */
export function appSlotEntries<N extends AppSlotName>(name: N): readonly Entry<N>[] {
  return (slots.get(name) ?? []) as unknown as Entry<N>[];
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useSlotVersion(): number {
  // Re-render when a feature registers after this screen mounted.
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );
}

/**
 * A slot one feature owns: its first registered component with these props, or `fallback` when
 * nothing is registered (the classic app).
 */
export function AppSlotOwner<N extends AppSlotName>({
  name,
  props,
  fallback,
}: {
  name: N;
  props: AppSlotProps[N];
  fallback: ReactNode;
}) {
  useSlotVersion();
  const owner = appSlotEntries(name)[0];
  if (!owner) return <>{fallback}</>;
  const Component = owner.component;
  return <Component {...props} />;
}

export default function AppSlot<N extends AppSlotName>({
  name,
  ...props
}: { name: N } & AppSlotProps[N]) {
  useSlotVersion();
  return (
    <>
      {appSlotEntries(name).map(({ id, component: Component }) => (
        <Component key={id} {...(props as unknown as AppSlotProps[N])} />
      ))}
    </>
  );
}
