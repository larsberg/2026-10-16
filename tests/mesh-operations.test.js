import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Matrix4, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3 } from 'three';
import { createViewportMesh, polygonEdges } from '../src/polygon-mesh.js';
import { dualDiamond, dualNSided, extrudeFaces, extrusionTransform, faceFrame, triangulateFace, triangulateFaces, validatePolygonMesh } from '../src/mesh-operations.js';
import { createMeshView } from '../src/mesh-view.js';
import { defaultMeshSetup, validateMeshSetup } from '../src/mesh-settings.js';

const square = () => createViewportMesh(4,4,2);
const area = mesh => mesh.faces.reduce((sum,face) => sum + triangulateFace(mesh,face).reduce((total,triangle) => {
  const [a,b,c]=triangle.map(id=>new Vector3(...mesh.vertices[id]));
  return total+b.sub(a).cross(c.sub(a)).length()/2;
},0),0);
function manifold(mesh, closed = false) {
  validatePolygonMesh(mesh);
  const edges=new Map();
  mesh.faces.forEach(face=>face.forEach((a,i)=>{
    const b=face[(i+1)%face.length],key=a<b?`${a}:${b}`:`${b}:${a}`;
    const list=edges.get(key)??[];list.push([a,b]);edges.set(key,list);
  }));
  for(const list of edges.values()) {
    assert.ok(list.length<=2);
    if(closed)assert.equal(list.length,2);
    if(list.length===2)assert.deepEqual(list[0],[list[1][1],list[1][0]]);
  }
  assert.equal(mesh.vertices.length-edges.size+mesh.faces.length,closed?2:1);
}

test('triangulation preserves concave polygon area and winding in tilted 3D planes',()=>{
  for(const reversed of [false,true]) {
    const matrix=new Matrix4().makeRotationFromEuler(new Euler(.7,.3,-.4));
    const vertices=[[0,0,0],[3,0,0],[3,1,0],[1,1,0],[1,3,0],[0,3,0]].map(v=>new Vector3(...v).applyMatrix4(matrix).toArray());
    const mesh={vertices,faces:[reversed?[5,4,3,2,1,0]:[0,1,2,3,4,5]]},before=structuredClone(mesh);
    const result=triangulateFaces(mesh).mesh,normal=faceFrame(mesh,mesh.faces[0]).normal;
    assert.equal(result.faces.length,4);assert.ok(Math.abs(area(result)-5)<1e-10);
    for(const face of result.faces)assert.ok(faceFrame(result,face).normal.dot(normal)>.999999);
    assert.deepEqual(mesh,before);assert.deepEqual(result.vertices,vertices);
  }
});

test('triangulation changes only requested faces and returns their resulting IDs',()=>{
  const mesh=square(),result=triangulateFaces(mesh,[1,1]);
  assert.equal(result.mesh.faces.length,5);assert.equal(result.faceIds.length,2);
  assert.deepEqual(result.mesh.faces[0],mesh.faces[0]);
  assert.deepEqual(result.mesh.faces.slice(3),mesh.faces.slice(2));
  manifold(result.mesh);assert.throws(()=>triangulateFaces(mesh,[99]),/invalid face ID/);
});

test('both duals retain open boundaries, area, orientation, and manifold connectivity',()=>{
  const mesh=square(),before=structuredClone(mesh);
  const diamond=dualDiamond(mesh).mesh,dual=dualNSided(mesh).mesh;
  assert.equal(diamond.faces.length,12);
  assert.equal(diamond.faces.filter(f=>f.length===4).length,4);
  assert.equal(diamond.faces.filter(f=>f.length===3).length,8);
  assert.equal(dual.faces.length,9);assert.equal(dual.vertices.length,16);
  for(const result of [diamond,dual]) {
    manifold(result);assert.ok(Math.abs(area(result)-16)<1e-10);
    for(const face of result.faces)assert.ok(faceFrame(result,face).normal.z>.999999);
    for(const axis of [0,1]) {
      assert.equal(Math.min(...result.vertices.map(v=>v[axis])),-2);
      assert.equal(Math.max(...result.vertices.map(v=>v[axis])),2);
    }
  }
  assert.deepEqual(mesh,before);
});

const cube={vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],faces:[[3,2,1,0],[4,5,6,7],[0,1,5,4],[7,6,2,3],[0,4,7,3],[1,2,6,5]]};
test('closed cube duals produce an octahedron and twelve diamonds with outward winding',()=>{
  const dual=dualNSided(cube).mesh,diamond=dualDiamond(cube).mesh;
  assert.equal(dual.vertices.length,6);assert.equal(dual.faces.length,8);assert.ok(dual.faces.every(f=>f.length===3));
  assert.equal(diamond.faces.length,12);assert.ok(diamond.faces.every(f=>f.length===4));
  for(const mesh of [dual,diamond]) {
    manifold(mesh,true);
    for(const face of mesh.faces){const {normal,center}=faceFrame(mesh,face);assert.ok(normal.dot(center)>0);}
  }
});

test('individual extrusion applies local scale, rotation, and translation around each face center',()=>{
  const mesh=square(),before=structuredClone(mesh),transform=extrusionTransform({offsetX:.3,offsetY:-.2,depth:.7,rotateX:12,rotateY:-8,rotateZ:25,scaleX:.7,scaleY:.8});
  const result=extrudeFaces(mesh,[0,1],transform);
  assert.equal(result.mesh.faces.length,12);assert.equal(result.faceIds.length,2);
  for(let i=0;i<2;i++){
    const original=faceFrame(mesh,mesh.faces[i]),cap=result.mesh.faces[result.faceIds[i]],actual=faceFrame(result.mesh,cap).center;
    const expected=original.center.clone().addScaledVector(original.x,.3).addScaledVector(original.y,-.2).addScaledVector(original.normal,.7);
    assert.ok(actual.distanceTo(expected)<1e-10);
    for(let j=0;j<cap.length;j++){
      const p=new Vector3(...mesh.vertices[mesh.faces[i][j]]).sub(original.center);
      const local=new Vector3(p.dot(original.x),p.dot(original.y),p.dot(original.normal)).applyMatrix4(transform);
      const desired=original.center.clone().addScaledVector(original.x,local.x).addScaledVector(original.y,local.y).addScaledVector(original.normal,local.z);
      assert.ok(desired.distanceTo(new Vector3(...result.mesh.vertices[cap[j]]))<1e-10);
    }
  }
  assert.equal(new Set(result.faceIds.flatMap(id=>result.mesh.faces[id])).size,8);
  manifold(result.mesh);assert.deepEqual(mesh,before);
});

test('extrusion preserves pentagonal caps, outward side winding, and tilted face-local normals',()=>{
  const vertices=Array.from({length:5},(_,i)=>[Math.cos(i*Math.PI*2/5),Math.sin(i*Math.PI*2/5),0]);
  const mesh={vertices,faces:[[0,1,2,3,4]]},result=extrudeFaces(mesh,[0],extrusionTransform({depth:1})).mesh;
  assert.equal(result.faces.length,6);assert.equal(result.faces[0].length,5);
  manifold(result);
  for(const face of result.faces.slice(1)){const {center,normal}=faceFrame(result,face);assert.ok(center.clone().setZ(0).dot(normal)>0);}
  const transformed=structuredClone(cube),lifted=extrudeFaces(transformed,[4],extrusionTransform({depth:1}));
  const cap=faceFrame(lifted.mesh,lifted.mesh.faces[lifted.faceIds[0]]);
  assert.ok(cap.center.distanceTo(new Vector3(-2,0,0))<1e-10);manifold(lifted.mesh,true);
});

test('invalid dual topology and collapsed extrusion fail without mutating the input',()=>{
  const mesh=square(),before=structuredClone(mesh);
  const bad=structuredClone(mesh);bad.faces[1].reverse();
  assert.throws(()=>dualDiamond(bad),/consistently wound/);
  assert.throws(()=>dualNSided(bad),/consistently wound/);
  assert.throws(()=>extrusionTransform({scaleX:0}),/positive scales/);
  assert.throws(()=>extrudeFaces(mesh,[0],new Matrix4().makeScale(0,1,1)),/invertible/);
  assert.throws(()=>extrudeFaces(mesh,[0],new Matrix4()),/zero area/);
  assert.deepEqual(mesh,before);
});

test('view operations update face picking, selection, undo, and clear edits on regeneration',()=>{
  const scene=new Scene(),view=createMeshView(scene),camera=new PerspectiveCamera(42,1,.1,1000),settings=defaultMeshSetup(); settings.pipeline.enabled=false;
  camera.position.set(0,0,7);camera.lookAt(0,0,0);camera.updateMatrixWorld();view.regenerate(camera,settings);
  const before=structuredClone(view.topology),raycaster=new Raycaster();raycaster.setFromCamera(new Vector2(.1,.1),camera);
  const id=view.pickFace(raycaster);assert.ok(Number.isInteger(id));view.selectFaces([id]);
  view.extrude([id],extrusionTransform({depth:.5,scaleX:.8,scaleY:.8}));
  assert.equal(view.selectedFaces.length,1);assert.equal(view.topology.faces.length,before.faces.length+4);assert.equal(view.canUndo,true);
  assert.equal(view.pickFace(raycaster),view.selectedFaces[0]);
  assert.equal(view.undo(),true);assert.deepEqual(view.topology,before);assert.deepEqual(view.selectedFaces,[id]);
  view.dualNSided();view.triangulate();assert.ok(view.topology.faces.every(f=>f.length===3));
  view.regenerate(camera,settings);assert.deepEqual(view.topology,before);assert.equal(view.canUndo,false);assert.deepEqual(view.selectedFaces,[]);
  view.dispose();assert.equal(scene.children.length,0);
});

test('old settings acquire editing defaults and existing malformed settings still fail',()=>{
  const old=defaultMeshSetup();delete old.editing;delete old.extrusion;
  const result=validateMeshSetup(old);
  assert.deepEqual(result.extrusion,defaultMeshSetup().extrusion);assert.equal(result.editing.selectedOnly,true);
  assert.throws(()=>validateMeshSetup({...result,extrusion:{...result.extrusion,scaleX:0}}),/Scale X/);
});
