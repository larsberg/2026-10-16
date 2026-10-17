import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { createSetupHandler } from '../server/setup-api.js';
import { defaultMeshSetup, mergeMeshSetup, validateMeshSetup } from '../src/mesh-settings.js';
import { requestStaticSetup } from '../src/static-setup.js';

test('local Save/Reload roundtrips mesh settings and rejects invalid writes atomically', async () => {
  const directory=await mkdtemp(join(tmpdir(),'mesh-settings-')), file=join(directory,'setup.json');
  const handler=createSetupHandler(file);
  async function request(method,value) {
    const req=Readable.from(value ? [JSON.stringify(value)] : []);
    req.url='/api/setup';req.method=method;req.headers={'content-type':'application/json',host:'localhost:1234',origin:'http://localhost:1234'};
    const res={statusCode:0,setHeader(){},end(body){this.body=JSON.parse(body);}};
    await handler(req,res,()=>assert.fail('Unexpected route fallback'));
    return res;
  }
  try {
    const setup=mergeMeshSetup(defaultMeshSetup(),{mesh:{radius:2.5},pipeline:{seed:42,insetScale:.75,minDepth:1.5,maxDepth:2.5,segments:3,triangulateEnabled:false,faceCenterDualEnabled:false,averageVerticesEnabled:false,insetEnabled:false,extrusionEnabled:false,excludeInitialBorderTriangles:false},editing:{selectedOnly:true},extrusion:{depth:1.2,rotateZ:35,scaleX:.7,scaleY:.9},appearance:{wireframeColor:'#aabbcc'},camera:{yaw:30},audio:{bpm:128}});
    assert.equal((await request('PUT',setup)).statusCode,200);
    assert.deepEqual((await request('GET')).body,setup);
    const rigSetup=mergeMeshSetup(setup,{rig:{gravity:3,coneAngle:25,twistAngle:40,linearDamping:3.25,angularDamping:6.5,hoverEnabled:false,hoverAcceleration:25,showColliders:true,simulate:false},pipeline:{hexelateEnabled:false,segmentLength:.25},materials:{mesh:{normalMix:.8,roughness:.6,color:'#aabbcc'}},visibility:{surface:true,wireframe:true}});
    assert.equal((await request('PUT',rigSetup)).statusCode,200);
    assert.deepEqual((await request('GET')).body,rigSetup);
    assert.equal((await request('PUT',{...setup,mesh:{radius:0}})).statusCode,400);
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),rigSetup);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('production settings use the embedded setup and isolate device saves by URL',async()=>{
  const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const bundledSetup=defaultMeshSetup(),url='https://example.test/2026-10-16/setup.json';
  const options={url,storage,bundledSetup,validate:validateMeshSetup,fetcher:()=>assert.fail('Unexpected setup fetch')};
  assert.deepEqual(await requestStaticSetup(options),bundledSetup);
  const saved=mergeMeshSetup(bundledSetup,{mesh:{radius:3},appearance:{wireframeColor:'#00aaff'}});
  await requestStaticSetup({...options,method:'PUT',value:saved});
  assert.deepEqual(await requestStaticSetup(options),saved);
  assert.deepEqual(await requestStaticSetup({...options,url:'https://example.test/another/setup.json'}),bundledSetup);
});

test('grab and spotlight settings migrate once and retain independent saved controls',()=>{
  const old=defaultMeshSetup();delete old.rig.grabStiffness;delete old.rig.grabDamping;delete old.lighting.spotlight;
  old.lighting.directional.enabled=true;old.lighting.directional.color='#123456';
  const migrated=validateMeshSetup(old);
  assert.equal(migrated.rig.grabStiffness,30);assert.equal(migrated.rig.grabDamping,.75);
  assert.equal(migrated.lighting.spotlight.enabled,true);assert.equal(migrated.lighting.spotlight.color,'#123456');
  assert.equal(migrated.lighting.directional.enabled,false);
  const custom=mergeMeshSetup(migrated,{rig:{grabStiffness:60,grabDamping:0},lighting:{spotlight:{enabled:false,angle:65},directional:{enabled:true}}});
  assert.deepEqual(validateMeshSetup(custom),custom);
  for(const patch of [{rig:{grabStiffness:0}},{rig:{grabDamping:3}},{lighting:{spotlight:{angle:90}}}])assert.throws(()=>mergeMeshSetup(custom,patch));
});
