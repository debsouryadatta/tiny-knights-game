// Snapshot effects are authoritative; renderer motion supplies only local footsteps/listener.
export function createGameplayAudio(audio,{random=Math.random,onPosition=()=>{}}={}) {
  let seen=new Set(), identity='', elapsed=-1, baseline=true, position=null, stride=0, lastFrame=0, active=false;
  function snapshot(state,session,status,hidden=false){
    const hero=state?.actors.find(a=>a.id===session?.playerId);
    const nextActive=status==='connected'&&!hidden&&state?.phase==='playing'&&hero?.hp>0;
    const nextIdentity=state?state.room+':'+session?.playerId:'';
    const reset=baseline||identity!==nextIdentity||state?.elapsed<elapsed||!active;
    active=!!nextActive;audio.setActive(active);
    if(!active){baseline=true;position=null;stride=0;seen.clear();return;}
    identity=nextIdentity;elapsed=state.elapsed;
    if(reset){seen=new Set(state.effects.map(e=>e.id));position={x:hero.x,y:hero.y};stride=0;baseline=false;return;}
    for(const effect of state.effects){
      if(seen.has(effect.id))continue;
      seen.add(effect.id);
      const key=effect.kind==='ability'?({1:'dash',2:'sprint',3:'shockwave'}[effect.abilitySlot]):({hit:'hit',gather:'gather',build:'build'}[effect.kind]);
      if(key){const source=effect.kind==='hit'?(effect.target??effect):effect,listener=position??hero;
        audio.play(key,{distance:Math.hypot(source.x-listener.x,source.y-listener.y)});}
    }
    // Effects never return after leaving the authoritative live buffer.
    seen=new Set(state.effects.map(e=>e.id));
  }
  function frame({x,y,distance,moving,now}){
    if(!active){position=null;stride=0;return;}
    const gap=(now-lastFrame)/1000;lastFrame=now;
    position={x,y};onPosition(position);
    if(!moving||gap>.25||distance>1||!Number.isFinite(distance)){stride=0;return;}
    stride+=distance;
    if(stride>=1.35){stride=0;audio.play('step',{rate:.94+random()*.12});}
  }
  return {snapshot,frame,getStats:()=>({active,listener:position?{...position}:null,trackedEffects:seen.size})};
}
