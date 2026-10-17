import { Raycaster, Vector2 } from 'three';

// A click selects, a drag still belongs to the existing OrbitControls.
export function bindFaceSelection({ element, camera, view, canSelect, onChange }) {
  const abort = new AbortController(), raycaster = new Raycaster(), pointer = new Vector2();
  let down;
  element.addEventListener('pointerdown', event => {
    if (!event.isPrimary) { down = undefined; return; }
    if (event.button === 0) down = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }, { signal: abort.signal });
  element.addEventListener('pointermove', event => {
    if (down?.id === event.pointerId && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) down.moved = true;
  }, { signal: abort.signal });
  element.addEventListener('pointerup', event => {
    const start = down; down = undefined;
    if (!start || start.moved || start.id !== event.pointerId || !canSelect() || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const rect = element.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
    const id = view.pickFace(raycaster), selected = new Set(event.shiftKey ? view.selectedFaces : []);
    if (id !== null) {
      if (selected.has(id)) selected.delete(id); else selected.add(id);
    }
    view.selectFaces(selected); onChange();
  }, { signal: abort.signal });
  element.addEventListener('pointercancel', () => { down = undefined; }, { signal: abort.signal });
  return { dispose() { abort.abort(); } };
}
