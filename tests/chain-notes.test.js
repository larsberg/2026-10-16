import test from 'node:test';
import assert from 'node:assert/strict';
import { createChainNotes, notePaletteForPattern } from '../src/chain-notes.js';
import { createReferenceScore } from '../src/reference-score.js';
import { defaultMeshSetup, mergeMeshSetup, validateMeshSetup } from '../src/mesh-settings.js';

test('notes and all six parts map from large low-pitched chains to small high-pitched chains',()=>{
  const palette=notePaletteForPattern(createReferenceScore());
  assert.deepEqual([...new Set(palette.map(note=>note.layer))].sort(),['bass','hat','keys','kick','melody','snare']);
  const chains=Array.from({length:32},(_,id)=>({definition:{id,volume:(id*17)%32+1}}));
  const notes=createChainNotes(chains,{},palette),assignments=notes.assignments;
  assert.ok(chains.every(chain=>chain.noteScale===0),'assigned chains start fully collapsed');
  assert.equal(assignments[0].layer,'bass');assert.equal(assignments[0].weight,1);
  assert.ok(Math.abs(assignments.at(-1).weight-.1)<1e-9);
  for(let i=1;i<assignments.length;i++){
    assert.ok(assignments[i].size<=assignments[i-1].size);
    if(assignments[i].layer===assignments[i-1].layer){
      assert.ok(assignments[i].midi>=assignments[i-1].midi);
      assert.ok(assignments[i].weight<=assignments[i-1].weight);
    }
  }
  notes.trigger([{layer:'bass',note:'d1',gain:1}]);notes.update(.035);
  assert.ok(chains.some(chain=>chain.noteScale===1.2));
  assert.ok(chains.filter(chain=>chain.noteAssignment.layer==='keys').every(chain=>chain.noteScale===0));
  notes.update(8);assert.ok(chains.every(chain=>chain.noteScale===0));
});

test('bass owns the largest rounded 33 percent and every note fans out across its instrument group',()=>{
  const palette=notePaletteForPattern(createReferenceScore()),layers=[...new Set(palette.map(note=>note.layer))];
  for(const count of [0,1,2,3,6,32,46,100]) {
    const chains=Array.from({length:count},(_,id)=>({definition:{id,volume:id+1}})),notes=createChainNotes(chains,{},palette);
    const assignments=notes.assignments,bassCount=Math.min(count,Math.max(1,Math.round(count*.33)));
    assert.equal(assignments.filter(note=>note.layer==='bass').length,bassCount);
    assert.ok(assignments.slice(0,bassCount).every(note=>note.layer==='bass'));
    const counts=layers.filter(layer=>layer!=='bass').map(layer=>assignments.filter(note=>note.layer===layer).length);
    assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
    const hits=notes.trigger([{layer:'bass',note:'d2',gain:.8}]);notes.update(.035);
    assert.equal(hits.length,bassCount);
    assert.ok(chains.filter(chain=>chain.noteAssignment.layer==='bass').every(chain=>chain.noteEnvelope===.8));
    assert.ok(chains.filter(chain=>chain.noteAssignment.layer!=='bass').every(chain=>chain.noteEnvelope===0));
    const guitar=chains.filter(chain=>chain.noteAssignment.layer==='keys');
    if(guitar.length){
      const hits=notes.trigger([{layer:'keys',note:'e4',gain:.7},{layer:'keys',note:'a4',gain:.4}]);notes.update(.035);
      assert.equal(hits.length,guitar.length,'a chord produces one push per chain in the batch');
      assert.ok(hits.every(hit=>hit.gain===.7));
      assert.ok(guitar.every(chain=>chain.noteEnvelope===.7),'all guitar chains respond, not just their nominal pitch');
    }
  }
});

test('no-bass and bass-only scores assign all chains and silent notes never produce hits',()=>{
  const chains=Array.from({length:12},(_,id)=>({definition:{id,volume:id+1}}));
  const notes=createChainNotes(chains,{},[{layer:'keys',note:'e4',midi:64},{layer:'melody',note:'f3',midi:53}]);
  assert.equal(notes.assignments.filter(note=>note.layer==='keys').length,6);
  assert.equal(notes.assignments.filter(note=>note.layer==='melody').length,6);
  assert.deepEqual(notes.trigger([{layer:'keys',note:'e4',gain:0}]),[]);
  notes.setPalette([{layer:'bass',note:'d1',midi:26}]);
  assert.ok(notes.assignments.every(note=>note.layer==='bass'));
  notes.configure({noteScaleEnabled:false});
  assert.equal(notes.trigger([{layer:'bass',note:'d1',gain:1}]).length,12,'push routing is independent of scale motion');
  notes.update(.035);assert.ok(chains.every(chain=>chain.noteScale===1));
});

test('small meshes still respond to every instrument and disabling note motion restores unit scale',()=>{
  const chains=[{definition:{id:0,volume:1}}],notes=createChainNotes(chains,{},notePaletteForPattern(createReferenceScore()));
  notes.trigger([{layer:'keys',note:'a4',gain:.8}]);notes.update(.035);assert.ok(Math.abs(chains[0].noteScale-.96)<1e-9);
  notes.configure({noteScaleEnabled:false});assert.equal(chains[0].noteScale,1);
  notes.trigger([{layer:'bass',note:'d1',gain:1}]);notes.update(.1);assert.equal(chains[0].noteScale,1);
  notes.configure({noteScaleEnabled:true});assert.equal(chains[0].noteScale,0);
});

test('a hit expands from zero and release contracts below the original size all the way to zero',()=>{
  const chain={definition:{id:0,volume:1}},notes=createChainNotes([chain],{noteAttack:.04,noteRelease:.1},[{layer:'bass',note:'d1',midi:26}]);
  notes.trigger([{layer:'bass',note:'d1',gain:1}]);notes.update(.02);
  assert.ok(Math.abs(chain.noteScale-.6)<1e-9);
  notes.update(.02);assert.equal(chain.noteScale,1.2);
  notes.update(.1);assert.ok(chain.noteScale>0&&chain.noteScale<.5);
  notes.update(1);assert.equal(chain.noteScale,0);
  notes.configure({noteScaleMax:1,noteScaleAmount:0});notes.trigger([{layer:'bass',note:'d1',gain:1}]);notes.update(.04);
  assert.equal(chain.noteScale,1,'the maximum sets the peak independently of pitch weighting');
  notes.update(1);assert.equal(chain.noteScale,0);
  notes.setPalette([]);assert.equal(chain.noteScale,1,'a rig without notes keeps its editable rest pose');
});

test('bone scale limits set the rest and peak, retain note weighting, and allow a constant scale',()=>{
  const chains=[{definition:{id:0,volume:2}},{definition:{id:1,volume:1}}];
  const notes=createChainNotes(chains,{noteScaleMin:.2,noteScaleMax:.8,noteAttack:.04,noteRelease:.1},
    [{layer:'bass',note:'d1',midi:26},{layer:'keys',note:'e4',midi:64}]);
  assert.ok(chains.every(chain=>chain.noteScale===.2));
  notes.trigger([{layer:'bass',note:'d1',gain:1},{layer:'keys',note:'e4',gain:1}]);notes.update(.02);
  assert.ok(Math.abs(chains[0].noteScale-.5)<1e-9);
  notes.update(.02);assert.equal(chains[0].noteScale,.8);
  assert.ok(chains[1].noteScale>.2&&chains[1].noteScale<.8);
  notes.update(1);assert.ok(chains.every(chain=>chain.noteScale===.2));
  notes.configure({noteScaleMin:.6,noteScaleMax:.6});
  notes.trigger([{layer:'bass',note:'d1',gain:2}]);notes.update(.04);
  assert.ok(chains.every(chain=>chain.noteScale===.6));
  notes.configure({noteScaleMin:0,noteScaleMax:0});assert.ok(chains.every(chain=>chain.noteScale===0));
  notes.update(1);notes.configure({noteScaleMin:.8,noteScaleMax:.2});
  assert.ok(chains.every(chain=>chain.noteScale===.8));
  notes.trigger([{layer:'bass',note:'d1',gain:1}]);notes.update(.04);
  assert.ok(Math.abs(chains[0].noteScale-.2)<1e-9,'independent endpoints can make a note shrink the chain');
  notes.update(1);assert.equal(chains[0].noteScale,.8);
});

test('older saves gain joint overlap and note controls and invalid weight ranges are rejected',()=>{
  const old=defaultMeshSetup();delete old.rig.jointOverlap;
  for(const key of Object.keys(old.rig))if(key.startsWith('note'))delete old.rig[key];
  const restored=validateMeshSetup(old);assert.equal(restored.rig.jointOverlap,1);assert.equal(restored.rig.noteWeightMin,.1);assert.equal(restored.rig.noteWeightMax,1);
  assert.equal(restored.rig.notePushEnabled,true);assert.equal(restored.rig.notePushStrength,4);
  assert.equal(restored.rig.noteScaleMin,0);assert.equal(restored.rig.noteScaleMax,1.2);
  const edited=mergeMeshSetup(restored,{rig:{jointOverlap:.5,noteScaleMin:.25,noteScaleMax:1.5,noteScaleAmount:.3,noteWeightMin:.2,noteWeightMax:.8}});
  assert.deepEqual(validateMeshSetup(edited),edited);
  assert.throws(()=>mergeMeshSetup(restored,{rig:{noteWeightMin:0}}),/Highest note weight/);
  assert.throws(()=>mergeMeshSetup(restored,{rig:{noteWeightMin:.9,noteWeightMax:.2}}),/Lowest note weight/);
  assert.throws(()=>mergeMeshSetup(restored,{rig:{noteScaleMin:-.01}}),/Minimum bone scale/);
  assert.throws(()=>mergeMeshSetup(restored,{rig:{noteScaleMax:2.01}}),/Maximum bone scale/);
  assert.throws(()=>mergeMeshSetup(restored,{rig:{notePushStrength:-1}}),/Note push strength/);
  const independent=mergeMeshSetup(restored,{rig:{noteScaleMin:1.5}});
  assert.equal(independent.rig.noteScaleMin,1.5);assert.equal(independent.rig.noteScaleMax,1.2);
  const reversed=mergeMeshSetup(independent,{rig:{noteScaleMax:.4}});
  assert.equal(reversed.rig.noteScaleMin,1.5);assert.equal(reversed.rig.noteScaleMax,.4);
  assert.deepEqual(validateMeshSetup(reversed),reversed);
  const previous=defaultMeshSetup();delete previous.rig.noteScaleMin;delete previous.rig.noteScaleMax;
  previous.rig.noteScaleAmount=.6;previous.rig.noteWeightMax=.7;
  const migrated=validateMeshSetup(previous);assert.equal(migrated.rig.noteScaleMax,1.42);
  const chain={definition:{id:0,volume:1}},notes=createChainNotes([chain],migrated.rig,[{layer:'bass',note:'d1',midi:26}]);
  notes.trigger([{layer:'bass',note:'d1',gain:1}]);notes.update(migrated.rig.noteAttack);
  assert.equal(chain.noteScale,1.42,'migrated settings preserve the previous weighted peak');
});
