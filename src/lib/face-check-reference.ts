/**
 * The picture LoRA "Check on Cast" renders are face-checked against, as a ComfyUI view URL. A
 * feature can give its own (Play: Day's session plate); else lora-check-client uses the active
 * Cast's plate. docs/architecture-boundaries.md.
 */
export type FaceCheckReference = () => string | null;

let faceCheckReference: FaceCheckReference | null = null;

export function registerFaceCheckReference(reference: FaceCheckReference): void {
  faceCheckReference = reference;
}

export function registeredFaceCheckReference(): FaceCheckReference | null {
  return faceCheckReference;
}
