import { Color } from 'three';
import { studioColorKey } from './studio-palettes.js';

export function createCompositionPalette({environment,scene,sun,hemisphere,lighting}) {
  const colors=value=>[value.environment.backgroundColor,value.directional.color,value.hemisphere.skyColor,value.hemisphere.groundColor].map(c=>new Color(c));
  let current=colors(lighting),from=current.map(c=>c.clone()),target=current.map(c=>c.clone()),elapsed=.5,key;
  const signature=value=>studioColorKey(value.environment)+colors(value).map(c=>c.getHexString()).join(',');
  key=signature(lighting);
  function apply(){scene.background.copy(current[0]);if(scene.fog)scene.fog.color.copy(current[0]);sun.color.copy(current[1]);hemisphere.color.copy(current[2]);hemisphere.groundColor.copy(current[3]);}
  apply();
  return {
    configure(value){
      const next=signature(value);
      if(next!==key){from=current.map(c=>c.clone());target=colors(value);elapsed=0;key=next;environment.transition(value.environment,.5);}
      apply(); // Control refreshes must not snap an in-progress light fade.
    },
    update(dt){elapsed=Math.min(.5,elapsed+Math.max(0,dt));const t=elapsed/.5,blend=t*t*(3-2*t);
      current=from.map((c,i)=>c.clone().lerp(target[i],blend));environment.update(dt);apply();},
    get transitioning(){return elapsed<.5;},
  };
}
