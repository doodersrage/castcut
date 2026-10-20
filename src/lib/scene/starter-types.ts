export type SceneStarterCategory =
  'sport' | 'portrait' | 'urban' | 'nature' | 'lifestyle' | 'fashion' | 'scifi' | 'cozy';

export type SceneStarterPreset = {
  id: string;
  label: string;
  hints: string;
  category: SceneStarterCategory;
  portraitStyle?: 'portrait' | 'full-body' | 'action';
  duo?: boolean;
  teamKit?: boolean;
  tags?: string[];
  /** Optional model nudge when applying this preset. */
  suggestedModel?: string;
  /** Optional workflow file id from the workflow library. */
  suggestedWorkflowFileId?: string;
};

export const SCENE_STARTER_CATEGORIES: {
  value: SceneStarterCategory | 'all';
  label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'sport', label: 'Sport' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'urban', label: 'Urban' },
  { value: 'nature', label: 'Nature' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'scifi', label: 'Sci-fi' },
  { value: 'cozy', label: 'Cozy' },
];
