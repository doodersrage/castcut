/**
 * The 3D pose editor's scene: the posed bodies, the camera the pose is seen through (framed to
 * the picture's aspect), and the ways to pose them — drag a hand, foot, the head's gaze or the
 * hips; click a body part for a rotation ring; orbit and zoom (one finger orbits, two pinch).
 * React owns the panel around it; this owns the canvas. The rig (pose/rig3d.ts) is the truth:
 * every gesture edits it, then the bodies are set from it.
 */

import {
  BufferGeometry,
  Color,
  GridHelper,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Bone,
  type Intersection,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { PoseRig3d, PoseRig3dCamera } from '@/lib/pose/rig3d';
import {
  cloneRig,
  figureWorld,
  gazePoint,
  limbJoints,
  limbTwistExcess,
  lookAt,
  makeCamera,
  moveFigure,
  placeLimb,
  solveLimbIK,
  type Limb,
  type Side,
} from '@/lib/pose/rig3d-pose';
import {
  addStudioLights,
  applyFigure,
  createFigureObject,
  disposeFigureObject,
  SKIN_COLOR,
  type FigureObject,
} from '@/lib/pose/rig3d-three';

export type HandleId = 'hand_R' | 'hand_L' | 'foot_R' | 'foot_L' | 'gaze' | 'hips';
export const HANDLES: HandleId[] = ['hand_R', 'hand_L', 'foot_R', 'foot_L', 'gaze', 'hips'];

export type PoseSceneEvents = {
  /** A change is about to start (a drag, a ring turn, an orbit): checkpoint for undo. */
  onBegin: () => void;
  /** The rig changed: the pose (bones, where a figure stands) or only the camera. */
  onChange: (rig: PoseRig3d, what: 'pose' | 'camera') => void;
  /** Which figure is being posed, and the body part picked for the rotation ring. */
  onSelect: (figure: number, bone: string | null) => void;
  /** What a drag or the pointer is over, in words (null: nothing in particular). */
  onStatus: (text: string | null) => void;
};

const HANDLE_COLORS: Record<HandleId, number> = {
  // POSE_PART_COLORS (PoseBodiesSvg): their right arm / left arm / right leg / left leg.
  hand_R: 0xf97316,
  hand_L: 0x22c55e,
  foot_R: 0x3b82f6,
  foot_L: 0xa855f7,
  gaze: 0xeab308,
  hips: 0xf8fafc,
};

const HANDLE_WORDS: Record<HandleId, string> = {
  hand_R: 'Their right hand — the elbow follows',
  hand_L: 'Their left hand — the elbow follows',
  foot_R: 'Their right foot — the knee follows',
  foot_L: 'Their left foot — the knee follows',
  gaze: 'Where they look — drag to turn the head',
  hips: 'The hips — drag to move the whole figure',
};

export const BONE_WORDS: Record<string, string> = {
  hips: 'the whole figure',
  spine: 'the waist',
  chest: 'the chest',
  neck: 'the neck',
  head: 'the head',
  clavicle_R: 'their right shoulder',
  clavicle_L: 'their left shoulder',
  upperarm_R: 'their right upper arm',
  upperarm_L: 'their left upper arm',
  forearm_R: 'their right forearm',
  forearm_L: 'their left forearm',
  hand_R: 'their right hand',
  hand_L: 'their left hand',
  thigh_R: 'their right thigh',
  thigh_L: 'their left thigh',
  shin_R: 'their right shin',
  shin_L: 'their left shin',
  foot_R: 'their right foot',
  foot_L: 'their left foot',
};

/** Limb bones whose rotation must stay a natural bend (checked after a ring turn). */
function limbOf(bone: string): { side: Side; limb: Limb; lower: boolean } | null {
  const match = /^(upperarm|forearm|thigh|shin)_(R|L)$/.exec(bone);
  if (!match) return null;
  const part = match[1]!;
  return {
    side: match[2] as Side,
    limb: part === 'upperarm' || part === 'forearm' ? 'arm' : 'leg',
    lower: part === 'forearm' || part === 'shin',
  };
}

const PARTNER_TINT = new Color(0xa9b4c0);
const IDLE_TINT = new Color(0xb3aca6);

type Drag = {
  pointerId: number;
  figure: number;
  handle: HandleId;
  plane: Plane;
  grabOffset: Vector3;
  startHips: Vector3;
  startHit: Vector3;
};

export class PoseScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private orbit: OrbitControls;
  private transform: TransformControls;
  private objects: Array<FigureObject | null> = [];
  private rig: PoseRig3d;
  private aspect: number;
  private selectedFigure = 0;
  private selectedBone: string | null = null;
  private handles = new Map<HandleId, Mesh>();
  private gazeLine: Line;
  private drag: Drag | null = null;
  private down: { x: number; y: number; id: number } | null = null;
  private touches = new Set<number>();
  private frame = 0;
  private disposed = false;
  private loading = 0;
  private resize: ResizeObserver;
  private raycaster = new Raycaster();
  private lastValid: [number, number, number, number] | null = null;
  private coarse: boolean;
  private ready = false;

  constructor(
    host: HTMLElement,
    rig: PoseRig3d,
    aspect: number,
    private events: PoseSceneEvents
  ) {
    this.aspect = aspect;
    this.rig = cloneRig(rig);
    this.coarse =
      typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.canvas = this.renderer.domElement;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';
    host.appendChild(this.canvas);

    this.camera = makeCamera(this.rig.camera, aspect);
    addStudioLights(this.scene, this.camera);
    const grid = new GridHelper(8, 16, 0x9a948e, 0xc4beb8);
    (grid.material as LineBasicMaterial).transparent = true;
    (grid.material as LineBasicMaterial).opacity = 0.35;
    this.scene.add(grid);

    // Listener order matters: the ring takes a press on itself first, then the handles, and
    // the orbit gets whatever is left.
    this.transform = new TransformControls(this.camera, this.canvas);
    this.transform.setMode('rotate');
    this.transform.setSpace('local');
    this.transform.setSize(this.coarse ? 0.85 : 0.6);
    this.scene.add(this.transform.getHelper());
    this.transform.addEventListener('dragging-changed', event => {
      this.orbit.enabled = !event.value;
      if (event.value) {
        this.events.onBegin();
        const bone = this.selectedBone;
        const q = bone ? this.figure()?.bones[bone] : null;
        this.lastValid = q ? [...q] : null;
      }
    });
    this.transform.addEventListener('objectChange', () => this.onRingTurn());

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);

    this.orbit = new OrbitControls(this.camera, this.canvas);
    this.orbit.target.set(...this.rig.camera.target);
    this.orbit.enableDamping = false;
    this.orbit.minDistance = 0.6;
    this.orbit.maxDistance = 14;
    this.orbit.rotateSpeed = 0.8;
    this.orbit.addEventListener('start', () => this.events.onBegin());
    this.orbit.addEventListener('change', () => {
      if (!this.ready) return;
      this.syncCameraToRig();
      this.events.onChange(this.getRig(), 'camera');
      this.requestRender();
    });
    this.orbit.update();

    for (const id of HANDLES) {
      const mesh = new Mesh(
        // Rings for the hips and the gaze: the body and the face show through them.
        id === 'hips' || id === 'gaze'
          ? new TorusGeometry(1, 0.2, 10, 32)
          : new SphereGeometry(1, 20, 14),
        new MeshBasicMaterial({
          color: HANDLE_COLORS[id],
          depthTest: false,
          transparent: true,
          opacity: 0.92,
        })
      );
      mesh.renderOrder = 10;
      mesh.userData.handle = id;
      this.scene.add(mesh);
      this.handles.set(id, mesh);
    }
    this.gazeLine = new Line(
      new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]),
      new LineBasicMaterial({ color: HANDLE_COLORS.gaze, depthTest: false, transparent: true })
    );
    this.gazeLine.renderOrder = 9;
    this.scene.add(this.gazeLine);

    this.resize = new ResizeObserver(() => this.fit(host));
    this.resize.observe(host);
    this.fit(host);
    void this.syncObjects();
    this.ready = true;
  }

  // ── State ─────────────────────────────────────────────────────────────────────────────

  getRig(): PoseRig3d {
    return cloneRig(this.rig);
  }

  /** Replace the rig (undo, start from, a figure added…); the camera too unless `keepCamera`. */
  setRig(rig: PoseRig3d, { keepCamera = false }: { keepCamera?: boolean } = {}): void {
    const camera = this.rig.camera;
    this.rig = cloneRig(rig);
    if (keepCamera) this.rig.camera = { ...camera };
    if (this.selectedFigure >= this.rig.figures.length) this.selectedFigure = 0;
    this.applyCameraFromRig();
    this.detachRing();
    void this.syncObjects();
  }

  /** Bodies are still downloading. */
  get isLoading(): boolean {
    return this.loading > 0;
  }

  select(figure: number, bone: string | null = null): void {
    this.selectedFigure = Math.max(0, Math.min(figure, this.rig.figures.length - 1));
    this.selectedBone = bone;
    const object = this.objects[this.selectedFigure];
    const target = bone && object ? object.bones.get(bone) : null;
    if (target) this.transform.attach(target);
    else this.transform.detach();
    this.tintFigures();
    this.updateHandles();
    this.events.onSelect(this.selectedFigure, target ? bone : null);
    this.requestRender();
  }

  /**
   * Put the camera somewhere (the Camera panel's pick, pose/rig3d-camera.ts). Its pick rides
   * along until the camera is orbited or zoomed by hand.
   */
  setCamera(camera: PoseRig3dCamera): void {
    this.rig.camera = {
      position: [...camera.position],
      target: [...camera.target],
      fov: camera.fov,
      ...(camera.choice ? { choice: { ...camera.choice } } : {}),
    };
    this.applyCameraFromRig();
    this.events.onChange(this.getRig(), 'camera');
  }

  /** Where a handle is on screen (client pixels): for tests and the hint. */
  handleClientPoint(
    handle: HandleId,
    figure = this.selectedFigure
  ): { x: number; y: number } | null {
    const at = this.handleWorld(handle, figure);
    if (!at) return null;
    const ndc = at.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((ndc.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - ndc.y) / 2) * rect.height,
    };
  }

  /** The scene as an image (what the editor shows, handles included). */
  snapshot(): string {
    this.render();
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.transform.detach();
    this.transform.dispose();
    this.orbit.dispose();
    this.objects.forEach(object => object && disposeFigureObject(object));
    this.handles.forEach(mesh => {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ── Bodies ────────────────────────────────────────────────────────────────────────────

  private figure() {
    return this.rig.figures[this.selectedFigure] ?? null;
  }

  private async syncObjects(): Promise<void> {
    const wanted = this.rig.figures.map(figure => figure.body);
    // Drop figures that went away or changed body.
    this.objects = this.objects.filter((object, index) => {
      if (object && wanted[index] === object.kind) return true;
      if (object) disposeFigureObject(object);
      return false;
    });
    const missing = wanted
      .map((kind, index) => ({ kind, index }))
      .filter(({ index }) => !this.objects[index]);
    this.objects.length = wanted.length;
    this.applyAll();
    if (!missing.length) return;
    this.loading += 1;
    try {
      await Promise.all(
        missing.map(async ({ kind, index }) => {
          const object = await createFigureObject(kind);
          if (this.disposed || this.rig.figures[index]?.body !== kind || this.objects[index]) {
            disposeFigureObject(object);
            return;
          }
          this.objects[index] = object;
          this.scene.add(object.root);
        })
      );
    } finally {
      this.loading -= 1;
    }
    if (this.disposed) return;
    this.applyAll();
    this.tintFigures();
    if (this.selectedBone) this.select(this.selectedFigure, this.selectedBone);
  }

  private applyAll(): void {
    this.rig.figures.forEach((figure, index) => {
      const object = this.objects[index];
      if (object) applyFigure(object, figure);
    });
    this.updateHandles();
    this.requestRender();
  }

  private tintFigures(): void {
    this.objects.forEach((object, index) => {
      if (!object) return;
      const focused = this.rig.figures.length < 2 || index === this.selectedFigure;
      object.skin.color.set(focused ? SKIN_COLOR : index === 0 ? IDLE_TINT : PARTNER_TINT);
    });
  }

  // ── Camera ────────────────────────────────────────────────────────────────────────────

  private fit(host: HTMLElement): void {
    const rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private applyCameraFromRig(): void {
    // The pick the camera was set from stays with it; only a hand orbit or zoom drops it.
    const choice = this.rig.camera.choice;
    const posed = makeCamera(this.rig.camera, this.aspect);
    this.camera.position.copy(posed.position);
    this.camera.fov = this.rig.camera.fov;
    this.camera.updateProjectionMatrix();
    this.orbit.target.set(...this.rig.camera.target);
    this.ready = false;
    this.orbit.update();
    this.ready = true;
    this.syncCameraToRig();
    if (choice) this.rig.camera.choice = { ...choice };
    this.updateHandles();
    this.requestRender();
  }

  private syncCameraToRig(): void {
    this.rig.camera = {
      position: this.camera.position.toArray() as [number, number, number],
      target: this.orbit.target.toArray() as [number, number, number],
      fov: this.camera.fov,
    };
  }

  // ── Handles ───────────────────────────────────────────────────────────────────────────

  private handleWorld(handle: HandleId, figureIndex: number): Vector3 | null {
    const figure = this.rig.figures[figureIndex];
    if (!figure) return null;
    if (handle === 'gaze') return gazePoint(figure);
    const world = figureWorld(figure);
    return world.pos[handle]?.clone() ?? null;
  }

  private updateHandles(): void {
    const figure = this.figure();
    for (const [id, mesh] of this.handles) {
      const at = figure ? this.handleWorld(id, this.selectedFigure) : null;
      mesh.visible = Boolean(at) && !this.selectedBone;
      if (!at) continue;
      mesh.position.copy(at);
      const size = this.camera.position.distanceTo(at) * (this.coarse ? 0.022 : 0.016);
      mesh.scale.setScalar(id === 'hips' ? size * 1.3 : id === 'gaze' ? size * 0.9 : size);
      if (id === 'hips' || id === 'gaze') mesh.quaternion.copy(this.camera.quaternion);
    }
    if (figure) {
      const world = figureWorld(figure);
      const head = world.pos.head!;
      const positions = this.gazeLine.geometry.getAttribute('position');
      const gaze = gazePoint(figure);
      positions.setXYZ(0, head.x, head.y + 0.08, head.z);
      positions.setXYZ(1, gaze.x, gaze.y, gaze.z);
      positions.needsUpdate = true;
      this.gazeLine.visible = !this.selectedBone;
    } else {
      this.gazeLine.visible = false;
    }
  }

  private pointerNdc(event: PointerEvent): Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private pickHandle(event: PointerEvent): { figure: number; handle: HandleId } | null {
    if (this.selectedBone) return null;
    const radius = event.pointerType === 'touch' || this.coarse ? 30 : 18;
    let best: { handle: HandleId; distance: number } | null = null;
    for (const handle of HANDLES) {
      const at = this.handleClientPoint(handle);
      if (!at) continue;
      const distance = Math.hypot(at.x - event.clientX, at.y - event.clientY);
      if (distance <= radius && (!best || distance < best.distance)) best = { handle, distance };
    }
    return best ? { figure: this.selectedFigure, handle: best.handle } : null;
  }

  private pickBody(event: PointerEvent): { figure: number; bone: string } | null {
    this.raycaster.setFromCamera(this.pointerNdc(event), this.camera);
    let best: { figure: number; hit: Intersection<Object3D> } | null = null;
    this.objects.forEach((object, figure) => {
      if (!object) return;
      for (const hit of this.raycaster.intersectObjects(object.meshes, false)) {
        if (!best || hit.distance < best.hit.distance) best = { figure, hit };
      }
    });
    const found = best as { figure: number; hit: Intersection<Object3D> } | null;
    if (!found?.hit.face) return null;
    const mesh = found.hit.object as SkinnedMesh;
    const index = mesh.geometry.getAttribute('skinIndex');
    const weight = mesh.geometry.getAttribute('skinWeight');
    const totals = new Map<number, number>();
    for (const vertex of [found.hit.face.a, found.hit.face.b, found.hit.face.c]) {
      for (let k = 0; k < 4; k += 1) {
        const bone = index.getComponent(vertex, k);
        totals.set(bone, (totals.get(bone) ?? 0) + weight.getComponent(vertex, k));
      }
    }
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
    const bone: Bone | undefined = top ? mesh.skeleton.bones[top[0]] : undefined;
    return bone ? { figure: found.figure, bone: bone.name } : null;
  }

  // ── Gestures ──────────────────────────────────────────────────────────────────────────

  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') this.touches.add(event.pointerId);
    if (this.transform.dragging) return;
    if (this.touches.size > 1) {
      // A second finger: the pinch is the orbit's. Drop a handle drag without a jump.
      this.drag = null;
      this.down = null;
      return;
    }
    const hit = this.pickHandle(event);
    if (hit) {
      event.stopImmediatePropagation();
      event.preventDefault();
      this.canvas.setPointerCapture?.(event.pointerId);
      this.startDrag(hit.figure, hit.handle, event);
      return;
    }
    this.down = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };

  private onPointerMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      this.moveDrag(drag, event);
      return;
    }
    if (event.pointerType === 'mouse' && !this.down && !this.transform.dragging) {
      const hit = this.pickHandle(event);
      this.canvas.style.cursor = hit ? 'grab' : '';
      this.events.onStatus(hit ? HANDLE_WORDS[hit.handle] : null);
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    this.touches.delete(event.pointerId);
    if (this.drag && this.drag.pointerId === event.pointerId) {
      this.drag = null;
      this.canvas.style.cursor = '';
      this.events.onStatus(null);
      return;
    }
    const down = this.down;
    this.down = null;
    if (!down || down.id !== event.pointerId || this.transform.dragging) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    // A click (not an orbit): pick the body part under it, or let go of the ring.
    const picked = this.pickBody(event);
    if (picked) this.select(picked.figure, picked.bone);
    else if (this.selectedBone) this.select(this.selectedFigure, null);
  };

  private onPointerLeave = () => {
    if (!this.drag) this.events.onStatus(null);
  };

  private planeHit(plane: Plane, event: PointerEvent): Vector3 | null {
    this.raycaster.setFromCamera(this.pointerNdc(event), this.camera);
    return this.raycaster.ray.intersectPlane(plane, new Vector3());
  }

  private startDrag(figureIndex: number, handle: HandleId, event: PointerEvent): void {
    const figure = this.rig.figures[figureIndex];
    const at = this.handleWorld(handle, figureIndex);
    if (!figure || !at) return;
    const normal = this.camera.getWorldDirection(new Vector3());
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, at);
    const hit = this.planeHit(plane, event) ?? at.clone();
    this.events.onBegin();
    this.drag = {
      pointerId: event.pointerId,
      figure: figureIndex,
      handle,
      plane,
      grabOffset: at.clone().sub(hit),
      startHips: new Vector3(...figure.position),
      startHit: hit,
    };
    this.canvas.style.cursor = 'grabbing';
    this.events.onStatus(HANDLE_WORDS[handle]);
  }

  private moveDrag(drag: Drag, event: PointerEvent): void {
    const figure = this.rig.figures[drag.figure];
    const hit = this.planeHit(drag.plane, event);
    if (!figure || !hit) return;
    const target = hit.clone().add(drag.grabOffset);
    this.dragTo(drag.figure, drag.handle, target, hit, drag);
  }

  /** Move a handle to a world point (a drag, or the test API). */
  dragTo(
    figureIndex: number,
    handle: HandleId,
    target: Vector3,
    hit: Vector3 = target,
    drag?: Pick<Drag, 'startHips' | 'startHit'>
  ): void {
    const figure = this.rig.figures[figureIndex];
    if (!figure) return;
    if (handle === 'hips') {
      const start = drag?.startHips ?? new Vector3(...figure.position);
      const from = drag?.startHit ?? new Vector3(...figure.position);
      moveFigure(figure, start.clone().add(hit.clone().sub(from)));
    } else if (handle === 'gaze') {
      lookAt(figure, target);
    } else {
      const [part, side] = handle.split('_') as ['hand' | 'foot', Side];
      solveLimbIK(figure, side, part === 'hand' ? 'arm' : 'leg', target);
    }
    this.applyAll();
    this.events.onChange(this.getRig(), 'pose');
  }

  private onRingTurn(): void {
    const bone = this.selectedBone;
    const figure = this.figure();
    const object = this.objects[this.selectedFigure];
    const node = bone ? object?.bones.get(bone) : null;
    if (!bone || !figure || !node) return;
    const q = node.quaternion;
    figure.bones[bone] = [q.x, q.y, q.z, q.w];
    const limb = limbOf(bone);
    if (limb) {
      // An elbow or knee only bends the natural way: a turned forearm or shin re-seats the
      // upper bone's twist so the joint folds forward (elbow) or back (knee); a turn past what
      // the shoulder or hip allows is refused.
      if (limb.lower) {
        const { mid, end } = limbJoints(figure, limb.side, limb.limb);
        placeLimb(figure, limb.side, limb.limb, mid, end, limb.limb === 'leg');
      }
      if (limbTwistExcess(figure, limb.side, limb.limb) > 0 && this.lastValid) {
        figure.bones[bone] = [...this.lastValid];
        if (limb.lower) {
          const { mid, end } = limbJoints(figure, limb.side, limb.limb);
          placeLimb(figure, limb.side, limb.limb, mid, end, limb.limb === 'leg');
        }
      }
      const kept = figure.bones[bone]!;
      this.lastValid = [...kept];
    }
    this.applyAll();
    this.events.onChange(this.getRig(), 'pose');
  }

  private detachRing(): void {
    this.selectedBone = null;
    this.transform.detach();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────────────

  requestRender(): void {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private render(): void {
    if (this.disposed) return;
    this.updateHandles();
    this.renderer.render(this.scene, this.camera);
  }
}
