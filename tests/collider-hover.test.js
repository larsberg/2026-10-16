import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { bindColliderHover } from '../src/collider-hover.js';

test('hover pointer events clear on leaving, dragging, pause, blur, touch, and dispose and follow rebuilt rigs',()=>{
  const element=new EventTarget(),blurTarget=new EventTarget(),camera=new PerspectiveCamera(42,2,.1,100);
  element.getBoundingClientRect=()=>({left:10,top:20,right:210,bottom:120,width:200,height:100});camera.position.z=7;
  let allowed=true,ray,rig={setHoverRay(value){ray=value?.clone()??null;}};
  const hover=bindColliderHover({element,camera,getRig:()=>rig,canInteract:()=>allowed,blurTarget});
  const send=(name,values={})=>{const event=new Event(name);Object.assign(event,{isPrimary:true,pointerType:'mouse',buttons:0,clientX:110,clientY:70,...values});element.dispatchEvent(event);hover.update();};
  send('pointermove');assert.ok(ray);assert.ok(Math.abs(ray.direction.x)<1e-9);assert.ok(Math.abs(ray.direction.y)<1e-9);
  send('pointerleave');assert.equal(ray,null);
  send('pointermove');send('pointerdown',{buttons:1});assert.equal(ray,null);
  send('pointermove',{buttons:1});assert.equal(ray,null);send('pointerup');assert.ok(ray);
  allowed=false;hover.update();assert.equal(ray,null);allowed=true;hover.update();assert.ok(ray);
  blurTarget.dispatchEvent(new Event('blur'));hover.update();assert.equal(ray,null);
  send('pointermove',{pointerType:'touch'});assert.equal(ray,null);
  send('pointermove');let rebuiltRay;rig={setHoverRay(value){rebuiltRay=value;}};hover.update();assert.ok(rebuiltRay);
  hover.dispose();assert.equal(rebuiltRay,null);send('pointermove');assert.equal(rebuiltRay,null);
});
