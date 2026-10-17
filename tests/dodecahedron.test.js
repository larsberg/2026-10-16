import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { createDodecahedronMesh, polygonEdges } from '../src/polygon-mesh.js';
import { createMeshLayers } from '../src/mesh-layers.js';
import { createMeshRig, initMeshRigPhysics } from '../src/mesh-rig.js';
import { defaultMeshSetup, validateMeshSetup } from '../src/mesh-settings.js';
await initMeshRigPhysics();

function fixture(pipeline={},settings={}) {
  const result=createMeshLayers(createDodecahedronMesh(2),pipeline);
  const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(result.mesh.vertices.flat(),3));
  const material=new MeshBasicMaterial(),rig=createMeshRig(result.binding,geometry,material,{gravity:9.8,hoverEnabled:false,noteScaleEnabled:false,...settings});
  return {...result,rig,dispose(){rig.dispose();geometry.dispose();material.dispose();}};
}
function closed(mesh) {
  const counts=new Map();
  for(const face of mesh.faces)for(let i=0;i<face.length;i++){
    const a=face[i],b=face[(i+1)%face.length],key=[Math.min(a,b),Math.max(a,b)].join(':');
    const item=counts.get(key)??{count:0,balance:0};item.count++;item.balance+=a<b?1:-1;counts.set(key,item);
  }
  assert.ok([...counts.values()].every(({count,balance})=>count===2&&balance===0));
  assert.equal(mesh.vertices.length-counts.size+mesh.faces.length,2);
}

test('dodecahedron starts with twelve outward pentagons and stays closed through the existing passes',()=>{
  const base=createDodecahedronMesh(2);
  assert.equal(base.vertices.length,20);assert.equal(base.faces.length,12);assert.equal(polygonEdges(base.faces).length,30);closed(base);
  for(const face of base.faces){
    assert.equal(face.length,5);
    const [a,b,c]=face.map(id=>new Vector3(...base.vertices[id]));
    assert.ok(b.sub(a).cross(c.sub(a)).dot(a)>0);
  }
  for(const pipeline of [{},{initialDiamondDualEnabled:false},{extrusionEnabled:false}]) {
    const result=createMeshLayers(base,pipeline);closed(result.mesh);
    assert.ok(result.binding.chains.length<=32);assert.equal(result.binding.weights.length,result.mesh.vertices.length);
    assert.ok(result.binding.core.groundLevel<Math.min(...result.mesh.vertices.map(point=>point[1])));
  }
});

test('the core falls, rebounds off the ground and carries all base skin vertices',()=>{
  const item=fixture({enabled:false});
  try {
    const {rig}=item;assert.ok(rig.core.getMass()>0);
    assert.ok(rig.basePlane.sceneHalfExtents.x>=100&&rig.basePlane.sceneHalfExtents.z>=100);
    let falling=false,bounced=false;
    for(let i=0;i<180;i++){
      rig.step(1/60);const vy=rig.core.getLinearVelocity().y;
      if(vy<-.5)falling=true;if(falling&&vy>.5)bounced=true;
      const points=rig.getPositions();assert.ok([...points].every(Number.isFinite));
      // The slightly inset convex hull can allow a small visual overhang.
      assert.ok(Math.min(...Array.from(points).filter((_,j)=>j%3===1))>rig.basePlane.level-.3);
    }
    assert.ok(bounced,'Expected a real upward rebound after ground contact');
    assert.ok(rig.getCenter().y<-.5);
    const first=new Vector3(...item.mesh.vertices[0]).applyQuaternion(new Quaternion().copy(rig.core.getRotation())).add(rig.getCenter());
    assert.ok(first.distanceTo(new Vector3().fromArray(rig.getPositions()))<1e-5);
    const ray=new Raycaster(rig.getCenter().add(new Vector3(0,0,10)),new Vector3(0,0,-1));
    assert.equal(rig.pickCollider(ray)?.link,rig.coreLink,'The core is grabbable without visible chains');
  }finally{item.dispose();}
});

test('strong grab translates the whole articulated body and roots stay attached through rotation',()=>{
  const item=fixture({minDepth:3.59,maxDepth:4.78,segmentLength:.99,insetScale:.82},{gravity:12.4,linearDamping:3.87,angularDamping:8.31});
  try {
    const {rig}=item;assert.ok(rig.core.getMass()>0,'The core hull must fit native hull limits');
    for(let i=0;i<240;i++)rig.step(1/60);
    const link=rig.chains[0].links[0],origin=rig.getCenter(),grab=new Vector3().copy(link.body.getPosition()).divideScalar(rig.physicsScale);
    const target=grab.clone().add(new Vector3(4,3,0));
    assert.equal(rig.beginDrag(link,grab),true);rig.moveDrag(target);
    for(let i=0;i<120;i++)rig.step(1/60);
    const moved=rig.getCenter().sub(origin);assert.ok(moved.x>3.5&&moved.y>2.5,JSON.stringify(moved));
    assert.ok(new Vector3().copy(link.body.getPosition()).divideScalar(rig.physicsScale).distanceTo(target)<.3);
    const coreRotation=new Quaternion().copy(rig.core.getRotation());
    for(const chain of rig.chains){
      assert.equal(chain.root,rig.core);
      const anchor=new Vector3(...chain.definition.centers[0]).applyQuaternion(coreRotation).add(rig.getCenter());
      const first=chain.links[0],start=new Vector3(0,-first.length/2,0).sub(first.colliderOffset).multiplyScalar(first.currentScale)
        .applyQuaternion(new Quaternion().copy(first.body.getRotation())).add(new Vector3().copy(first.body.getPosition()).divideScalar(rig.physicsScale));
      assert.ok(anchor.distanceTo(start)<.08);
    }
    rig.endDrag();assert.equal(rig.dragging,false);
    const released=rig.getCenter().y;for(let i=0;i<60;i++)rig.step(1/60);assert.ok(rig.getCenter().y<released-.4);
  }finally{item.dispose();}
});

test('old grid saves migrate to the dodecahedron and visible ground without losing sound and motion choices',()=>{
  const old=defaultMeshSetup();old.mesh={shortSideSubdivisions:8};old.visibility.ground=false;old.rig.gravity=0;old.rig.noteScaleMin=.82;
  old.lighting.environment.noteBrightnessEnabled=true;
  const next=validateMeshSetup(old);
  assert.deepEqual(next.mesh,{radius:2});assert.equal(next.visibility.ground,true);assert.equal(next.rig.gravity,9.8);
  assert.equal(next.rig.noteScaleMin,.82);assert.deepEqual(next.audio,old.audio);assert.equal(next.lighting.environment.noteBrightnessEnabled,undefined);
});

// Test the actual capsule surface rather than the engine's padded broad-phase AABB.
function lowestColliderPoint(rig) {
  let lowest=Infinity;
  const point=new Vector3(),rotation=new Quaternion();
  for(const link of rig.links)if(link.physicsEnabled){
    const vertices=link.debug.geometry.getAttribute('position');
    rotation.copy(link.body.getRotation());
    const centerY=link.body.getPosition().y/rig.physicsScale;
    for(let i=0;i<vertices.count;i++){
      point.fromBufferAttribute(vertices,i).multiply(link.capsuleScale).multiplyScalar(link.currentScale).applyQuaternion(rotation);
      lowest=Math.min(lowest,point.y+centerY-rig.basePlane.level);
    }
  }
  return lowest;
}

test('a growing chain braces against the floor and lifts the core at gravity 100 without note impulses',async()=>{
  const {createViewportMesh}=await import('../src/polygon-mesh.js');
  const {extrudeFaces,extrusionTransform}=await import('../src/mesh-operations.js');
  const {createExtrusionBinding}=await import('../src/mesh-binding.js');
  const base=createViewportMesh(.4,.4,1);base.vertices=base.vertices.map(([x,y])=>[x,-.2,y]);
  const raised=extrudeFaces(base,[0],extrusionTransform({depth:3}),{segments:3}),binding=createExtrusionBinding(raised.mesh,raised.extrusions);
  binding.core={groundLevel:-4,points:[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[x*.2,y*.2,z*.2])))};
  for(const driven of [false,true]){
    const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(raised.mesh.vertices.flat(),3)),material=new MeshBasicMaterial();
    const rig=createMeshRig(binding,geometry,material,{gravity:100,hoverEnabled:false,notePushEnabled:false,
      noteScaleMin:.34,noteScaleMax:1,noteAttack:.15,noteRelease:1,coneAngle:1,twistAngle:0},[{layer:'bass',note:'c2',midi:36}]);
    try {
      // Isolate the ground reaction from sideways toppling.
      rig.core.setMotionLocks({linearX:true,linearZ:true,angularX:true,angularY:true,angularZ:true});
      for(let i=0;i<180;i++)rig.step(1/120);
      const start=rig.getCenter().y,masses=rig.links.map(link=>link.body.getMass());let highest=start;
      if(driven)rig.triggerNotes([{layer:'bass',note:'c2',gain:1}]);
      for(let i=0;i<60;i++){
        rig.step(1/120);highest=Math.max(highest,rig.getCenter().y);
        assert.ok(lowestColliderPoint(rig)>-.01,'The chain must brace on the floor instead of growing through it');
        rig.links.forEach((link,j)=>assert.ok(Math.abs(link.body.getMass()/masses[j]-1)<.001));
      }
      if(driven)assert.ok(highest-start>2,'Contact through the chain must lift the body');
      else assert.ok(highest-start<.01,'The resting control must not lift itself');
    }finally{rig.dispose();geometry.dispose();material.dispose();}
  }
});

for(const attack of [.12,.025])test(`the complete musical rig contacts the floor at gravity 100 with a ${attack}s attack`,async()=>{
  const {createReferenceScore}=await import('../src/reference-score.js');
  const {notePaletteForPattern}=await import('../src/chain-notes.js');
  const pattern=createReferenceScore(),result=createMeshLayers(createDodecahedronMesh(1.4),{
    triangulateEnabled:false,minDepth:3.59,maxDepth:4.78,segmentLength:.99,insetScale:.82});
  const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(result.mesh.vertices.flat(),3)),material=new MeshBasicMaterial();
  const rig=createMeshRig(result.binding,geometry,material,{gravity:100,hoverEnabled:false,coneAngle:33,twistAngle:38,jointOverlap:.39,
    linearDamping:3.87,angularDamping:8.31,noteScaleMin:.34,noteScaleMax:1.16,noteAttack:attack,noteRelease:.61,
    noteScaleAmount:.43,noteWeightMin:.41,noteWeightMax:1},notePaletteForPattern(pattern));
  try {
    const dt=1/60,cps=82/240;
    for(let frame=0;frame<600;frame++){
      rig.triggerNotes(pattern.queryArc(frame*dt*cps,(frame+1)*dt*cps).filter(h=>h.hasOnset()).map(h=>h.value));
      rig.step(dt);
      assert.ok(lowestColliderPoint(rig)>-.05,`Collider penetrated the ground at frame ${frame}`);
    }
    assert.ok(rig.getPositions().every(Number.isFinite));
    assert.ok(rig.getCenter().toArray().every(Number.isFinite));
  }finally{rig.dispose();geometry.dispose();material.dispose();}
});
