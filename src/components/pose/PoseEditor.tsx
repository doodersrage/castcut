'use client';

import dynamic from 'next/dynamic';
import { useState, type ComponentProps } from 'react';
import type PoseJointEditorType from '@/components/pose/PoseJointEditor';
import type { NormalizedBody } from '@/lib/pose/library';
import type { PoseRig3d } from '@/lib/pose/rig3d';
import type { PoseCameraChoice } from '@/lib/pose/camera-shot';
import type { Posture } from '@/lib/pose/rig3d-posture-points';

// Each editor is its own chunk: three.js and the 3D editor load only when the 3D editor opens.
const PoseJointEditor = dynamic(() => import('@/components/pose/PoseJointEditor'), {
  ssr: false,
});
const PoseJointEditor3D = dynamic(() => import('@/components/pose/PoseJointEditor3D'), {
  ssr: false,
});

export const POSE_EDITOR_MODE_KEY = 'castcut-pose-editor-mode-v1';
export type PoseEditorMode = '3d' | 'wireframe';

function readMode(): PoseEditorMode {
  try {
    return window.localStorage.getItem(POSE_EDITOR_MODE_KEY) === 'wireframe' ? 'wireframe' : '3d';
  } catch {
    return '3d';
  }
}

function rememberMode(mode: PoseEditorMode) {
  try {
    window.localStorage.setItem(POSE_EDITOR_MODE_KEY, mode);
  } catch {
    /* private mode: the choice lasts this visit */
  }
}

/** Whether this browser can draw the 3D editor at all. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
      WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

type EditorProps = ComponentProps<typeof PoseJointEditorType> & {
  /** The rig the pose was saved with in the 3D editor (PhotoPose.rig3d). */
  rig3d?: PoseRig3d;
  /** The slot / beat's Camera row: a pose without a camera of its own opens seen through it. */
  initialCamera?: PoseCameraChoice;
  /** The lead's posture when known from outside the points (the 3D editor's lift targets it). */
  postures?: Posture[];
};

/**
 * The pose editor: the 3D body by default, the wireframe editor when the player picked it (one
 * click either way, remembered) or when the browser has no WebGL. Switching hands the pose
 * across as it stands.
 */
export default function PoseEditor({ rig3d, initialCamera, postures, ...props }: EditorProps) {
  const [webgl] = useState(webglAvailable);
  const [mode, setMode] = useState<PoseEditorMode>(readMode);
  // The pose as the other editor left it, once the player switches.
  const [handoff, setHandoff] = useState<{
    bodies: NormalizedBody[];
    words?: string;
    rig?: PoseRig3d;
  } | null>(null);
  const switchTo = (
    next: PoseEditorMode,
    bodies: NormalizedBody[],
    words: string | null,
    rig?: PoseRig3d
  ) => {
    rememberMode(next);
    setHandoff({ bodies, ...(words ? { words } : {}), ...(rig ? { rig } : {}) });
    setMode(next);
  };
  const bodies = handoff?.bodies ?? props.bodies;
  const words = handoff ? handoff.words : props.words;
  if (webgl && mode === '3d') {
    return (
      <PoseJointEditor3D
        {...props}
        bodies={bodies}
        words={words}
        // The 3D editor checks a rig still draws these points before it trusts it.
        rig3d={handoff ? handoff.rig : rig3d}
        initialCamera={initialCamera}
        postures={postures}
        onUseWireframe={(next, nextWords, rig) => switchTo('wireframe', next, nextWords, rig)}
      />
    );
  }
  return (
    <PoseJointEditor
      {...props}
      bodies={bodies}
      words={words}
      onUse3d={webgl ? (next, nextWords) => switchTo('3d', next, nextWords) : undefined}
    />
  );
}
