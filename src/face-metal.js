import { Color, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PlaneGeometry, PMREMGenerator, Scene, WebGLRenderTarget, HalfFloatType, LinearFilter, OrthographicCamera, ShaderMaterial } from 'three';
import { defaultStudioColors, studioColorKey } from './studio-palettes.js';

export function createStudioEnvironment(renderer, colors = defaultStudioColors()) {
  const room = new Scene(); room.background = new Color(colors.backgroundColor);
  const geometry = new PlaneGeometry(1, 1), materials = [];
  function panel(key, intensity, position, size) {
    const material = new MeshBasicMaterial({ toneMapped: false });
    materials.push({ material, key, intensity });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...size, 1); mesh.lookAt(0, 0, 0); room.add(mesh);
  }
  // Long photographic softboxes produce warm/cool bands in the reflections.
  panel('keyColor', 4, [0, 5, 6], [12, 4.5]);
  panel('stripColor', 7, [0, 2.6, 7], [12, 0.55]);
  panel('fillColor', 5, [-5, 1, 1], [5, 10]);
  panel('rimColor', 4, [-4, 3, -4], [3, 8]);
  panel('accentColor', 3, [5, -1, 3], [3, 7]);
  panel('bounceColor', 2, [1, -4, -3], [10, 2.4]);
  panel('backColor', 0.8, [0, 0, -7], [10, 4]);
  const pmrem = new PMREMGenerator(renderer);
  const cache=new Map(),blendScene=new Scene(),blendCamera=new OrthographicCamera(-1,1,1,-1,0,1);
  const blendMaterial=new ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{fromMap:{value:null},toMap:{value:null},amount:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:'uniform sampler2D fromMap; uniform sampler2D toMap; uniform float amount; varying vec2 vUv; void main(){gl_FragColor=mix(texture2D(fromMap,vUv),texture2D(toMap,vUv),amount);}' });
  const quad=new Mesh(new PlaneGeometry(2,2),blendMaterial);quad.frustumCulled=false;blendScene.add(quad);
  let environment,snapshot,colorKey,generationCount=0,tween;
  function bake(value) {
    const key=studioColorKey(value);
    if(cache.has(key)){const target=cache.get(key);cache.delete(key);cache.set(key,target);return target;}
    room.background.set(value.backgroundColor);
    for (const { material, key, intensity } of materials) material.color.set(value[key]).multiplyScalar(intensity);
    const target=pmrem.fromScene(room,0.018);cache.set(key,target);generationCount++;
    if(cache.size>10){const oldest=cache.keys().next().value;cache.get(oldest).dispose();cache.delete(oldest);}
    return target;
  }
  function blit(from,to,amount,target){
    const previous=renderer.getRenderTarget(),xr=renderer.xr.enabled;
    Object.assign(blendMaterial.uniforms.fromMap,{value:from});Object.assign(blendMaterial.uniforms.toMap,{value:to});blendMaterial.uniforms.amount.value=amount;
    try{renderer.xr.enabled=false;renderer.setRenderTarget(target);renderer.render(blendScene,blendCamera);}
    finally{renderer.setRenderTarget(previous);renderer.xr.enabled=xr;}
  }
  function configure(value) {
    const nextKey=studioColorKey(value);if(nextKey===colorKey)return false;
    const target=bake(value);
    if(!environment){
      const create=()=>{const result=new WebGLRenderTarget(target.width,target.height,{type:HalfFloatType,minFilter:LinearFilter,magFilter:LinearFilter,depthBuffer:false,stencilBuffer:false});
        result.texture.mapping=target.texture.mapping;result.texture.colorSpace=target.texture.colorSpace;result.texture.generateMipmaps=false;return result;};
      environment=create();snapshot=create();
    }
    blit(target.texture,target.texture,1,environment);tween=undefined;colorKey=nextKey;
    return true;
  }
  configure(colors);
  return { configure,
    transition(value,duration=.5){
      const key=studioColorKey(value);if(key===colorKey)return false;
      const target=bake(value);blit(environment.texture,environment.texture,0,snapshot);
      tween={target,elapsed:0,duration:Math.max(.001,duration)};colorKey=key;return true;
    },
    update(dt){if(!tween)return false;tween.elapsed+=Math.max(0,dt);const t=Math.min(1,tween.elapsed/tween.duration);
      blit(snapshot.texture,tween.target.texture,t*t*(3-2*t),environment);if(t===1)tween=undefined;return true;},
    get transitioning(){return !!tween;},get texture() { return environment.texture; }, get generationCount() { return generationCount; },
    dispose() { environment.dispose();snapshot.dispose();for(const target of cache.values())target.dispose();cache.clear();quad.geometry.dispose();blendMaterial.dispose();geometry.dispose();materials.forEach(({ material }) => material.dispose());pmrem.dispose(); } };
}

export function createFaceMetal() {
  return new MeshPhysicalMaterial({
    color: '#dac5bf', metalness: 1, roughness: 0.24, flatShading: true,
    clearcoat: 0.45, clearcoatRoughness: 0.16,
  });
}
