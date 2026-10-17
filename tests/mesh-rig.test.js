import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Group, MeshBasicMaterial, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { createViewportMesh } from '../src/polygon-mesh.js';
import { createMeshLayers } from '../src/mesh-layers.js';
import { createExtrusionBinding } from '../src/mesh-binding.js';
import { extrudeFaces, extrusionTransform, triangulateFace } from '../src/mesh-operations.js';
import { createMeshRig, initMeshRigPhysics } from '../src/mesh-rig.js';
import { createMeshView } from '../src/mesh-view.js';
import { defaultMeshSetup, mergeMeshSetup, validateMeshSetup } from '../src/mesh-settings.js';

await initMeshRigPhysics();
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function createRig(options={}) {
  const result=createMeshLayers(createViewportMesh(8,8,4),options.pipeline);
  const geometry=new BufferGeometry(); geometry.setAttribute('position',new Float32BufferAttribute(result.mesh.vertices.flat(),3));
  geometry.setIndex(result.mesh.faces.flatMap(face=>triangulateFace(result.mesh,face).flat()));
  const material=new MeshBasicMaterial({visible:false}),rig=createMeshRig(result.binding,geometry,material,options.rig);
  return {...result,rig,geometry,dispose(){rig.dispose();geometry.dispose();material.dispose();}};
}

test('extrusion ring IDs survive compaction and generate one correctly aligned chain per piece',()=>{
  const base=createViewportMesh(6,4,2),extruded=extrudeFaces(base,[1,3],extrusionTransform({depth:2}),{segments:3});
  const binding=createExtrusionBinding(extruded.mesh,extruded.extrusions);
  assert.equal(binding.chains.length,2);assert.equal(binding.boneCount,9);
  for(const [i,chain] of binding.chains.entries()) {
    assert.equal(chain.lengths.length,3);assert.deepEqual(chain.axis,[0,0,1]);
    near(chain.centers[0][2],0);near(chain.centers.at(-1)[2],2);
    chain.lengths.forEach(length=>near(length,2/3));
    extruded.extrusions[i].rings.slice(1).forEach((ring,segment)=>ring.forEach(id=>assert.deepEqual(binding.weights[id],[[chain.segmentBones[segment],1]])));
    for(const id of extruded.extrusions[i].rings[0])assert.deepEqual(binding.weights[id],[[0,1]]);
    const expectedRadius=Math.max(...extruded.extrusions[i].rings[0].map(id=>new Vector3(...extruded.mesh.vertices[id]).distanceTo(new Vector3(...chain.centers[0]))));
    near(chain.radius,expectedRadius);
  }
});

test('procedural extrusion derives segment and collider counts from each depth, clamped to one',()=>{
  for(const [minDepth,maxDepth] of [[.01,.99],[1,1],[1.01,6.15],[3,3]]) {
    const {binding}=createMeshLayers(createViewportMesh(8,8,4),{minDepth,maxDepth});
    assert.ok(binding.chains.length>0);
    for(const chain of binding.chains) {
      const depth=chain.lengths.reduce((sum,n)=>sum+n,0),count=Math.max(1,Math.floor(depth+1e-9));
      assert.equal(chain.lengths.length,count);assert.equal(chain.segmentBones.length,count);
      chain.lengths.forEach(length=>near(length,depth/count));
    }
  }
  const item=createRig({pipeline:{minDepth:.21,maxDepth:6.15}});
  try {
    const expected=item.binding.chains.reduce((sum,c)=>sum+c.lengths.length,0);
    assert.equal(item.rig.stats.colliders,expected);assert.equal(item.rig.stats.joints,expected);
    assert.equal(item.rig.stats.bones,1+item.binding.chains.length+expected);
    for(const chain of item.rig.chains)assert.equal(chain.links.length,chain.definition.lengths.length);
  }finally{item.dispose();}
});

test('segment length scales the actual extrusion and rig without changing depth-derived segment counts',()=>{
  const base=createViewportMesh(8,8,4),source=createMeshLayers(base,{minDepth:1.01,maxDepth:6.15});
  for(const segmentLength of [.01,.25,1]) {
    const result=createMeshLayers(base,{minDepth:1.01,maxDepth:6.15,segmentLength});
    assert.equal(result.binding.boneCount,source.binding.boneCount);
    assert.equal(result.binding.weights.length,result.mesh.vertices.length);
    for(const [i,chain] of result.binding.chains.entries()) {
      assert.equal(chain.lengths.length,source.binding.chains[i].lengths.length);
      chain.lengths.forEach(length=>near(length,segmentLength));
      near(new Vector3(...chain.centers[0]).distanceTo(new Vector3(...chain.centers.at(-1))),chain.lengths.length*segmentLength);
    }
  }
  const item=createRig({pipeline:{minDepth:3.8,maxDepth:3.8,segmentLength:.25}});
  try {
    for(const chain of item.rig.chains){assert.equal(chain.links.length,3);chain.links.forEach(link=>near(link.length,.25));}
  }finally{item.dispose();}
});

test('skinning weights survive smoothing and diamond remapping and keep every boundary vertex fixed',()=>{
  const {mesh,binding}=createMeshLayers(createViewportMesh(8,8,4));
  assert.equal(binding.weights.length,mesh.vertices.length);assert.equal(binding.chains.length,13);
  assert.ok(binding.weights.some(weights=>weights.length>1));
  for(const weights of binding.weights) {
    assert.ok(weights.length>=1&&weights.length<=4);near(weights.reduce((sum,[,weight])=>sum+weight,0),1,1e-7);
    for(const [bone,weight] of weights)assert.ok(Number.isInteger(bone)&&bone>=0&&bone<binding.boneCount&&weight>0);
  }
  const counts=new Map();for(const face of mesh.faces)face.forEach((a,i)=>{const b=face[(i+1)%face.length],key=a<b?a+':'+b:b+':'+a;counts.set(key,(counts.get(key)??0)+1);});
  for(const [key,count] of counts)if(count===1)for(const id of key.split(':').map(Number))assert.deepEqual(binding.weights[id],[[0,1]]);
  assert.equal(createMeshLayers(createViewportMesh(8,8,4),{extrusionEnabled:false}).binding.chains.length,0);
});

test('real skinned mesh reproduces its bind pose even when its parent is rotated',()=>{
  const item=createRig();
  try {
    const host=new Group();host.rotation.set(.6,-.4,.3);host.position.set(2,-1,3);host.add(item.rig.group);host.updateMatrixWorld(true);
    const positions=item.rig.getPositions();positions.forEach((value,i)=>near(value,item.geometry.attributes.position.array[i],1e-6));
    assert.equal(item.rig.skin.isSkinnedMesh,true);assert.equal(item.rig.skeleton.bones.length,item.binding.boneCount);
    for(const chain of item.rig.chains)chain.links.forEach((link,i)=>{
      const direction=new Vector3(0,1,0).applyQuaternion(new Quaternion().copy(link.body.getRotation()));
      assert.ok(direction.distanceTo(new Vector3(...chain.definition.axis))<1e-6);
      const expected=new Vector3(...chain.definition.centers[i]).lerp(new Vector3(...chain.definition.centers[i+1]),.5);
      expected.add(link.colliderOffset.clone().applyQuaternion(new Quaternion().copy(link.body.getRotation())));
      assert.ok(expected.distanceTo(new Vector3().copy(link.body.getPosition()).divideScalar(item.rig.physicsScale))<1e-6);
      assert.equal(link.shape.getType(),'hull'); // Nonuniformly scaled capsule.
      assert.equal(link.debug.geometry.type,'CapsuleGeometry');
      assert.ok(Object.values(link.halfExtents).every(value=>value>0));
      near(link.halfExtents.y,link.length/2);
    });
  }finally{item.dispose();}
});

test('large static base collider has its top at local Z zero and catches a falling body',()=>{
  const item=createRig({rig:{gravity:9.8}}),{rig}=item;
  const body=rig.world.createBody({type:'dynamic',position:{x:50,y:0,z:3}}),shape=body.createSphere({radius:.25,density:1});
  try {
    const base=rig.basePlane;assert.equal(base.body.getPosition().z+base.halfExtents.z,0);
    assert.ok(base.halfExtents.x>=100&&base.halfExtents.y>=100);const position={...base.body.getPosition()};
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2);
    for(let i=0;i<180;i++)rig.step(1/60,rotation);
    near(body.getPosition().z,.25,.015);assert.deepEqual(base.body.getPosition(),position);
    assert.equal(rig.stats.baseColliders,1);
  }finally{item.dispose();shape.delete();body.delete();}
});

test('cone-constrained simulation deforms the skin, holds roots and border fixed, and enforces joint limits',()=>{
  const item=createRig({rig:{gravity:3,coneAngle:25,twistAngle:30}}),{rig}=item;
  try {
    const roots=rig.chains.map(chain=>({...chain.root.getPosition()})),rest=rig.getPositions();
    rig.nudge(2);for(let i=0;i<240;i++)rig.step(1/60);
    const positions=rig.getPositions();assert.ok(positions.every(Number.isFinite));
    assert.ok(positions.some((value,i)=>Math.abs(value-rest[i])>.01));
    rig.chains.forEach((chain,i)=>assert.deepEqual(chain.root.getPosition(),roots[i]));
    item.binding.weights.forEach((weights,id)=>{if(weights.length===1&&weights[0][0]===0)for(let axis=0;axis<3;axis++)near(positions[id*3+axis],rest[id*3+axis],1e-6);});
    for(const joint of rig.joints) {
      assert.ok(joint.native.getConeAngle()<25*Math.PI/180+.03);
      assert.ok(Math.abs(joint.native.getTwistAngle())<30*Math.PI/180+.03);
      const a=new Vector3().copy(joint.bodyA.getWorldPoint(joint.localFrameA.position)),b=new Vector3().copy(joint.bodyB.getWorldPoint(joint.localFrameB.position));
      assert.ok(a.distanceTo(b)<.01);
    }
    rig.configure({simulate:false});const time=rig.seconds,pose=rig.getPositions();rig.step(1);assert.equal(rig.seconds,time);assert.deepEqual(rig.getPositions(),pose);
  }finally{item.dispose();item.dispose();}
});

test('unit-length physics preserves scene gravity and base contact at small extrusion scales',()=>{
  for(const segmentLength of [.01,.25,1]) {
    const item=createRig({pipeline:{segmentLength},rig:{gravity:9.8}}),{rig}=item,s=rig.physicsScale;
    const body=rig.world.createBody({type:'dynamic',position:{x:50*s,y:0,z:3*s}});
    const shape=body.createSphere({radius:.25*s,density:1});
    try {
      near(segmentLength*s,1);
      const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2);
      for(let i=0;i<30;i++)rig.step(1/60,rotation);
      near(body.getLinearVelocity().z/s,-4.9,.002);
      near(body.getPosition().z/s,3-.5*9.8*.5**2,.015);
      for(let i=0;i<150;i++)rig.step(1/60,rotation);
      near(body.getPosition().z/s,.25,.015);
      assert.ok(rig.getPositions().every(Number.isFinite));
    }finally{item.dispose();shape.delete();body.delete();}
  }
});

test('view updates wireframe buffers from bones, resets binding on edits, and rebuilds on resize',()=>{
  const view=createMeshView(new Scene()),camera=new PerspectiveCamera(42,1,.1,1000),settings=defaultMeshSetup();camera.position.set(0,0,7);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  try {
    view.configure(settings);view.regenerate(camera,settings);const original=view.rig;
    original.nudge();for(let i=0;i<30;i++)view.update(1/60);
    const pose=original.getPositions(),attribute=view.object.geometry.attributes.position;
    view.edges.forEach((edge,index)=>edge.forEach((id,end)=>{for(let axis=0;axis<3;axis++)near(attribute.array[(index*2+end)*3+axis],pose[id*3+axis],1e-6);}));
    view.configure(mergeMeshSetup(settings,{rig:{enabled:false}}));assert.equal(view.rig,undefined);
    view.edges.forEach((edge,index)=>edge.forEach((id,end)=>{for(let axis=0;axis<3;axis++)near(attribute.array[(index*2+end)*3+axis],view.topology.vertices[id][axis],1e-6);}));
    view.configure(settings);assert.ok(view.rig);
    view.triangulate([0]);assert.equal(view.rig,undefined);view.undo();assert.ok(view.rig);
    camera.aspect=.8;camera.updateProjectionMatrix();view.regenerate(camera,settings);assert.notEqual(view.rig,original);assert.equal(view.canUndo,false);assert.ok(view.rig.stats.chains>0);
  }finally{view.dispose();}
});

test('rig controls migrate previous saves and persist through settings validation',()=>{
  const defaults=defaultMeshSetup(),old=structuredClone(defaults);delete old.rig;
  assert.deepEqual(validateMeshSetup(old).rig,defaults.rig);
  const changed=mergeMeshSetup(defaults,{rig:{enabled:false,simulate:false,gravity:4,coneAngle:25,twistAngle:35,showColliders:true}});
  assert.deepEqual(validateMeshSetup(changed),changed);
  assert.throws(()=>mergeMeshSetup(defaults,{rig:{coneAngle:0}}),/cone angle/);
  const legacy=structuredClone(defaults);delete legacy.rig.linearDamping;delete legacy.rig.angularDamping;delete legacy.rig.hoverEnabled;delete legacy.rig.hoverAcceleration;legacy.rig.damping=3.5;
  assert.equal(validateMeshSetup(legacy).rig.linearDamping,3.5);assert.equal(validateMeshSetup(legacy).rig.angularDamping,3.5);
  assert.equal(validateMeshSetup(legacy).rig.hoverEnabled,true);assert.equal(validateMeshSetup(legacy).rig.hoverAcceleration,14);
  assert.throws(()=>mergeMeshSetup(defaults,{rig:{hoverEnabled:'true'}}),/Repel colliders/);
  assert.throws(()=>mergeMeshSetup(defaults,{rig:{hoverAcceleration:-1}}),/Hover acceleration/);
  assert.throws(()=>mergeMeshSetup(defaults,{rig:{linearDamping:-1}}),/Linear damping/);
  assert.throws(()=>mergeMeshSetup(defaults,{rig:{angularDamping:21}}),/Angular damping/);
});

test('linear and angular damping update separately on existing bodies and dissipate motion',()=>{
  const low=createRig({rig:{linearDamping:0,angularDamping:0}}),high=createRig({rig:{linearDamping:12,angularDamping:12}});
  try {
    const body=high.rig.links[0].body;
    high.rig.configure({linearDamping:3.5});near(body.getLinearDamping(),3.5);near(body.getAngularDamping(),12);
    high.rig.configure({angularDamping:6.25});near(body.getLinearDamping(),3.5);near(body.getAngularDamping(),6.25);
    high.rig.configure({linearDamping:12,angularDamping:12});assert.equal(high.rig.links[0].body,body);
    low.rig.nudge(2);high.rig.nudge(2);
    for(let i=0;i<120;i++){low.rig.step(1/60);high.rig.step(1/60);}
    const speed=rig=>rig.links.reduce((sum,link)=>sum+Object.values(link.body.getLinearVelocity()).reduce((s,v)=>s+v*v,0)+Object.values(link.body.getAngularVelocity()).reduce((s,v)=>s+v*v,0),0);
    assert.ok(speed(high.rig)<speed(low.rig)*.25);
  }finally{low.dispose();high.dispose();}
});

test('hover hits hidden moving colliders and accelerates them away from the cursor ray in a rotated rig',()=>{
  const item=createRig({rig:{linearDamping:0,angularDamping:0},pipeline:{initialDiamondDualEnabled:false,triangulateEnabled:false,faceCenterDualEnabled:false,averageVerticesEnabled:false}}),{rig}=item;
  try {
    const host=new Group();host.rotation.set(.4,-.6,.2);host.position.set(2,-1,3);host.add(rig.group);host.updateMatrixWorld(true);
    const link=rig.chains.find(chain=>chain.links.length>1).links.at(-1),center=new Vector3().copy(link.body.getPosition()),radius=link.halfExtents.x;
    const ray=new Raycaster(new Vector3(center.x-radius*.4,center.y,center.z+10).applyMatrix4(rig.group.matrixWorld),new Vector3(0,0,-1).transformDirection(rig.group.matrixWorld));
    assert.equal(link.debug.visible,false);
    const hit=rig.pickCollider(ray);assert.ok(hit);assert.equal(hit.link.chain.definition.id,link.chain.definition.id);
    const roots=rig.chains.map(chain=>({...chain.root.getPosition()})),body=hit.link.body;
    rig.setHoverRay(ray.ray);rig.step(1/60);assert.ok(rig.hoveredCollider);
    assert.ok(body.getLinearVelocity().x>0,'the hovered body accelerates away from the ray');
    rig.chains.forEach((chain,i)=>assert.deepEqual(chain.root.getPosition(),roots[i]));
    rig.configure({hoverEnabled:false});rig.step(1/60);assert.equal(rig.hoveredCollider,null);
    rig.configure({hoverEnabled:true});rig.setHoverRay(null);rig.step(1/60);assert.equal(rig.hoveredCollider,null);
    const posed=rig.getPositions(),rest=item.mesh.vertices.flat();assert.ok(posed.every(Number.isFinite));assert.ok(posed.some((v,i)=>Math.abs(v-rest[i])>1e-6));
  }finally{item.dispose();}
});
