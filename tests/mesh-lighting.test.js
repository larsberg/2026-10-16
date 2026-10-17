import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, DirectionalLight, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { SurfaceGTAOPass } from '../src/scene-effects.js';
import { fitMeshShadows } from '../src/mesh-shadows.js';

test('AO excludes line guides without hiding a nested solid surface and restores masks',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),line=new LineSegments(new BoxGeometry(),new LineBasicMaterial());
  const mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());mesh.layers.enable(1);line.layers.enable(1);line.add(mesh);scene.add(line);
  const pass=new SurfaceGTAOPass(scene,camera,16,16),mask=line.layers.mask;
  try {
    pass._overrideVisibility();assert.equal(line.visible,true);assert.equal(mesh.visible,true);
    assert.equal(line.layers.isEnabled(1),false);assert.equal(mesh.layers.isEnabled(1),true);
    pass._restoreVisibility();assert.equal(line.layers.mask,mask);assert.equal(line.visible,true);
  }finally{pass.dispose();line.geometry.dispose();line.material.dispose();mesh.geometry.dispose();mesh.material.dispose();}
});

test('shadow projection contains the rotated deformed surface and refits after geometry changes',()=>{
  const light=new DirectionalLight();light.position.set(-3,7,14);const mesh=new Mesh(new BoxGeometry(8,4,6),new MeshBasicMaterial());mesh.rotation.set(.2,.3,.1);
  try {
    for(const scale of [1,1.5]) {
      mesh.scale.setScalar(scale);fitMeshShadows(light,mesh);light.shadow.updateMatrices(light);
      const attr=mesh.geometry.attributes.position,camera=light.shadow.camera;
      for(let i=0;i<attr.count;i++) {
        const p=new Vector3().fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld).project(camera);
        assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1);
      }
      assert.ok(camera.far>camera.near);
    }
  }finally{mesh.geometry.dispose();mesh.material.dispose();light.shadow.dispose();}
});
