import { Box3, Matrix4 } from 'three';

const bounds = new Box3(), lightSpace = new Matrix4();

// The surface is CPU-deformed from the skeleton. Fit the shadow camera to
// those current positions, including the base sheet, instead of a fixed box.
export function fitMeshShadows(light, mesh) {
  if (!mesh?.visible || !mesh.geometry.getAttribute('position')?.count) return;
  mesh.updateWorldMatrix(true, false); light.updateWorldMatrix(true, false); light.target.updateWorldMatrix(true, false);
  light.shadow.updateMatrices(light);
  const camera = light.shadow.camera;
  mesh.geometry.computeBoundingBox();
  lightSpace.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
  bounds.copy(mesh.geometry.boundingBox).applyMatrix4(lightSpace);
  const padding = Math.max(0.25, bounds.getSize(mesh.position.clone()).length() * 0.03);
  Object.assign(camera, { left: bounds.min.x - padding, right: bounds.max.x + padding,
    bottom: bounds.min.y - padding, top: bounds.max.y + padding,
    near: Math.max(0.01, -bounds.max.z - padding), far: Math.max(0.02, -bounds.min.z + padding) });
  camera.far = Math.max(camera.far, camera.near + 0.1); camera.updateProjectionMatrix();
}
