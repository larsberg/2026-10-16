import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { createViewportMesh, polygonEdges } from '../src/polygon-mesh.js';
import { createMeshView } from '../src/mesh-view.js';
import { defaultMeshSetup, mergeMeshSetup } from '../src/mesh-settings.js';
import { createMarchAudio } from '../src/march-audio.js';

for (const [width, height, columns, rows] of [[10,10,4,4],[16,9,7,4],[9,16,4,7],[20,5,16,4]]) {
  test(`${width} × ${height} grid spans the view with shared quad vertices`, () => {
    const mesh = createViewportMesh(width,height);
    assert.equal(mesh.columns, columns); assert.equal(mesh.rows, rows);
    assert.equal(mesh.vertices.length,(columns+1)*(rows+1));
    assert.equal(mesh.faces.length,columns*rows);
    assert.deepEqual(mesh.vertices[0],[-width/2,-height/2,0]);
    assert.deepEqual(mesh.vertices.at(-1),[width/2,height/2,0]);
    assert.equal(polygonEdges(mesh.faces).length, columns*(rows+1)+rows*(columns+1));
    for (const face of mesh.faces) {
      assert.equal(new Set(face).size,4);
      const [a,b,c] = face.map(id => new Vector3(...mesh.vertices[id]));
      assert.ok(b.sub(a).cross(c.sub(a)).z > 0);
    }
    const ratio=(width/columns)/(height/rows);
    assert.ok(ratio >= 0.875 && ratio <= 1.125);
  });
}

test('n-sided boundaries close and shared edges draw only once, without triangulation', () => {
  const faces=[[0,1,2,3,4],[4,3,5]];
  const edges=polygonEdges(faces);
  assert.equal(edges.length,7);
  assert.ok(edges.some(([a,b]) => a===4 && b===0));
  assert.ok(!edges.some(([a,b]) => a===0 && b===2));
});

test('resize regenerates geometry, disposes old buffers, and fits portrait and landscape views', () => {
  const camera=new PerspectiveCamera(42,1,0.1,1000),scene=new Scene(),view=createMeshView(scene);
  camera.position.set(0,0,7);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const settings=defaultMeshSetup(); settings.pipeline.enabled=false;
  let disposed=0;
  for (const aspect of [16/9,9/16,1]) {
    const previous=view.object.geometry;
    previous.addEventListener('dispose',()=>disposed++);
    camera.aspect=aspect;camera.zoom=Math.min(1,aspect);camera.updateProjectionMatrix();
    view.regenerate(camera,settings);
    assert.notEqual(previous,view.object.geometry);
    view.object.updateMatrixWorld();
    const corner=new Vector3(...view.topology.vertices.at(-1)).applyMatrix4(view.object.matrixWorld).project(camera);
    assert.ok(Math.abs(corner.x-1)<1e-10 && Math.abs(corner.y-1)<1e-10);
  }
  assert.equal(disposed,3);assert.equal(view.generation,3);
  view.regenerate(camera,mergeMeshSetup(settings,{mesh:{shortSideSubdivisions:8}}));
  assert.equal(view.topology.faces.length,64);
  view.dispose(); assert.equal(scene.children.length,0);
});

test('empty Strudel score never creates audio, even when enabled', async () => {
  let contexts=0;
  const audio=createMarchAudio({createContext:()=>{contexts++;throw new Error('Unexpected audio context');}});
  audio.configure({...defaultMeshSetup().audio,enabled:true});
  audio.play(); await audio.retry();audio.restart();
  assert.equal(contexts,0); assert.equal(audio.playing,false);assert.equal(audio.diagnostics.scheduledEvents,0);
  audio.dispose();
});
