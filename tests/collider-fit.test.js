import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { createExtrusionBinding } from '../src/mesh-binding.js';
import { extrudeFaces, extrusionTransform, triangulateFace } from '../src/mesh-operations.js';
import { createMeshRig, initMeshRigPhysics } from '../src/mesh-rig.js';

await initMeshRigPhysics();
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function rectangle(width,depth,x=0) {
  return [[x-width/2,-depth/2,0],[x+width/2,-depth/2,0],[x+width/2,depth/2,0],[x-width/2,depth/2,0]];
}
function geometry(mesh) {
  const result=new BufferGeometry();result.setAttribute('position',new Float32BufferAttribute(mesh.vertices.flat(),3));
  result.setIndex(mesh.faces.flatMap(face=>triangulateFace(mesh,face).flat()));return result;
}

test('scaled unit capsules match each assigned face dimensions and orientation on tilted neighboring pieces',()=>{
  const base={vertices:[...rectangle(4,1),...rectangle(.4,2,10)],faces:[[0,1,2,3],[4,5,6,7]]};
  const raised=extrudeFaces(base,undefined,extrusionTransform({depth:3}),{segments:3});
  const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,2,3).normalize(),.7);
  raised.mesh.vertices=raised.mesh.vertices.map(v=>new Vector3(...v).applyQuaternion(rotation).toArray());
  const binding=createExtrusionBinding(raised.mesh,raised.extrusions);
  const surface=geometry(raised.mesh),material=new MeshBasicMaterial(),rig=createMeshRig(binding,surface,material);
  try {
    for (const [piece,chain] of rig.chains.entries()) for (const link of chain.links) {
      assert.equal(link.shape.getType(),'hull'); // The scaled rounded template is the physical hull.
      assert.equal(link.debug.geometry.type,'CapsuleGeometry');
      near(link.halfExtents.x,piece ? .2 : 2);near(link.halfExtents.z,piece ? 1 : .5);near(link.halfExtents.y,.5);
      const attr=link.debug.geometry.getAttribute('position'),rotation=new Quaternion().copy(link.body.getRotation());
      const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
      for(let i=0;i<attr.count;i++) {
        const point=new Vector3().fromBufferAttribute(attr,i).multiply(link.capsuleScale).multiplyScalar(rig.physicsScale).applyQuaternion(rotation).add(new Vector3().copy(link.body.getPosition()));
        min.min(point);max.max(point);
      }
      const bounds=link.shape.getAABB();
      for(const axis of ['x','y','z']) {
        // The engine's rotated broadphase bounds may be conservative, but
        // must contain every point of the visible capsule's physical hull.
        assert.ok(bounds.lowerBound[axis]<=min[axis]+1e-6);
        assert.ok(bounds.upperBound[axis]>=max[axis]-1e-6);
      }
    }
  } finally {rig.dispose();surface.dispose();material.dispose();}
});

test('short wide capsules scale a one-unit template without losing face width or depth',()=>{
  for (const depth of [.01,.2,3]) {
    const base={vertices:rectangle(4,2),faces:[[0,1,2,3]]};
    const raised=extrudeFaces(base,undefined,extrusionTransform({depth})),binding=createExtrusionBinding(raised.mesh,raised.extrusions);
    const surface=geometry(raised.mesh),material=new MeshBasicMaterial(),rig=createMeshRig(binding,surface,material);
    try {
      const link=rig.links[0];assert.equal(link.shape.getType(),'hull'); // The scaled rounded template is the physical hull.
      assert.equal(link.debug.geometry.type,'CapsuleGeometry');
      near(link.halfExtents.x,2);near(link.halfExtents.y,depth/2);near(link.halfExtents.z,1);
      near(link.debug.geometry.parameters.radius,.25);near(link.debug.geometry.parameters.height,.5);
      near(link.debug.scale.x,8);near(link.debug.scale.y,depth);near(link.debug.scale.z,4);
      near(rig.physicsScale*depth,1);
      near(link.body.getPosition().z/rig.physicsScale-link.halfExtents.y,0);
      const g=link.debug.geometry,attr=g.getAttribute('position'),idx=g.getIndex();let volume=0;
      for(let i=0;i<idx.count;i+=3){
        const [a,b,c]=[0,1,2].map(j=>new Vector3().fromBufferAttribute(attr,idx.getX(i+j)));
        volume+=a.dot(b.cross(c))/6;
      }
      const mass=Math.abs(volume)*link.debug.scale.x*link.debug.scale.y*link.debug.scale.z;
      assert.ok(Math.abs(link.body.getMass()-mass)<mass*.001,'normalizing physics units preserves scene density');
      rig.nudge();rig.step(1/60);assert.ok(rig.getPositions().every(Number.isFinite));
    } finally {rig.dispose();surface.dispose();material.dispose();}
  }
});

test('an asymmetric face offsets its scaled capsule without moving the bone rest pose or joint anchor',()=>{
  const base={vertices:[[0,0,0],[4,0,0],[1,2,0]],faces:[[0,1,2]]};
  const raised=extrudeFaces(base,undefined,extrusionTransform({depth:1}));
  const binding=createExtrusionBinding(raised.mesh,raised.extrusions);
  const surface=geometry(raised.mesh),material=new MeshBasicMaterial(),rig=createMeshRig(binding,surface,material);
  try {
    const link=rig.links[0];assert.ok(link.colliderOffset.length()>.1);
    near(link.body.getPosition().x,2);near(link.body.getPosition().y,1);near(link.body.getPosition().z,.5);
    const anchor=rig.joints[0].localFrameB.position.clone().applyQuaternion(new Quaternion().copy(link.body.getRotation())).add(new Vector3().copy(link.body.getPosition()));
    assert.ok(anchor.distanceTo(new Vector3(...binding.chains[0].centers[0]))<1e-6);
    const posed=rig.getPositions();posed.forEach((value,i)=>near(value,surface.attributes.position.array[i]));
  } finally {rig.dispose();surface.dispose();material.dispose();}
});
