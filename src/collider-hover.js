import { Raycaster, Vector2 } from 'three';

export function bindColliderHover({ element, camera, getRig, canInteract, blurTarget = window }) {
  const abort = new AbortController(), pointer = new Vector2(), caster = new Raycaster();
  let cursor;
  function clear() { cursor = undefined; getRig()?.setHoverRay(null); }
  function move(event) {
    if (!event.isPrimary || event.pointerType === 'touch' || event.buttons) { clear(); return; }
    cursor = { x: event.clientX, y: event.clientY };
  }
  for (const name of ['pointermove', 'pointerup']) element.addEventListener(name, move, { signal: abort.signal });
  for (const name of ['pointerdown', 'pointerleave', 'pointercancel']) element.addEventListener(name, clear, { signal: abort.signal });
  blurTarget.addEventListener('blur', clear, { signal: abort.signal });
  return {
    update() {
      const rig = getRig();
      if (!rig) return;
      if (!cursor || !canInteract()) { rig.setHoverRay(null); return; }
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || cursor.x < rect.left || cursor.x > rect.right || cursor.y < rect.top || cursor.y > rect.bottom) { clear(); return; }
      pointer.set((cursor.x - rect.left) / rect.width * 2 - 1, 1 - (cursor.y - rect.top) / rect.height * 2);
      camera.updateMatrixWorld(); caster.setFromCamera(pointer, camera); rig.setHoverRay(caster.ray);
    },
    dispose() { clear(); abort.abort(); },
  };
}
