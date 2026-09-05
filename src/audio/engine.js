import {sounds, radii} from './config.js';

export function attenuation(distance, inner=2, outer=12) {
  if (!Number.isFinite(distance) || outer<=inner) return 0;
  const t=Math.max(0,Math.min(1,(distance-inner)/(outer-inner)));
  return 1-t*t*(3-2*t);
}

export function createAudioEngine({contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(), fetcher=globalThis.fetch, maxVoices=16}={}) {
  let context, master, channels, enabled=true, active=true, disposed=false, busy=false, error=null;
  const volumes={ambience:.45,sfx:.65}, buffers=new Map(), voices=new Set(), loops=new Map(), cooldowns=new Map(), listeners=new Set();
  let played=0,dropped=0;
  const notify=()=>listeners.forEach(fn=>fn());
  const ramp=(gain,value)=>{gain.cancelScheduledValues(context.currentTime);gain.setTargetAtTime(value,context.currentTime,.03);};
  const audible=()=>enabled&&active&&!disposed&&context?.state==='running';
  function stopVoices(){for(const voice of [...voices]){try{voice.source.stop();}catch{}voice.source.disconnect();voice.gain.disconnect();}voices.clear();loops.clear();}
  function mix(){if(master)ramp(master.gain,enabled&&active?1:0);}
  async function load(){
    await Promise.all(Object.entries(sounds).map(async([key,spec])=>{
      if(buffers.has(key))return;
      try{const response=await fetcher('/assets/audio/'+encodeURIComponent(spec.file));if(!response.ok)throw new Error('Audio asset unavailable');
        const buffer=await context.decodeAudioData(await response.arrayBuffer());if(!disposed)buffers.set(key,buffer);
      }catch{error='Some sound effects are unavailable.';}
    }));notify();
  }
  // Called from a trusted pointer/key gesture. Enabled is the user's intent;
  // unlocking never changes that intent, including during an in-flight resume.
  async function unlock(){
    if(disposed||busy||!enabled||context?.state==='running')return;
    busy=true;notify();
    try{
      if(!context){
        context=contextFactory();master=context.createGain();master.gain.value=0;master.connect(context.destination);
        channels=Object.fromEntries(Object.entries(volumes).map(([key,value])=>{const node=context.createGain();node.gain.value=value;node.connect(master);return [key,node];}));
        context.onstatechange=notify;
      }
      await context.resume();
      if(disposed)return;
      if(context.state!=='running')throw new Error('Audio resume rejected');
      error=null;void load();
      mix();
    }catch{enabled=false;error='Sound is unavailable. Try enabling it again.';mix();}
    finally{busy=false;notify();}
  }
  async function toggle(){
    if(disposed)return;
    enabled=!enabled;
    if(!enabled)stopVoices();
    mix();notify();
    if(enabled)await unlock();
  }
  function voice(buffer, channel, volume, rate=1, loop=false){
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;source.playbackRate.value=rate;source.loop=loop;gain.gain.value=volume;
    source.connect(gain);gain.connect(channels[channel]);
    const entry={source,gain};voices.add(entry);
    source.onended=()=>{voices.delete(entry);source.disconnect();gain.disconnect();};
    source.start();return entry;
  }
  function play(key,{distance=0,rate=1}={}){
    const spec=sounds[key],buffer=buffers.get(key),gain=spec?spec.volume*attenuation(distance,...radii.gameplay):0;
    if(!audible()||!buffer||gain<=0||voices.size>=maxVoices||context.currentTime<(cooldowns.get(key)||0)){dropped++;return false;}
    cooldowns.set(key,context.currentTime+spec.cooldown);voice(buffer,'sfx',gain,rate);played++;return true;
  }
  return {
    toggle, unlock, play,
    setActive(value){if(active===value)return;active=value;if(!value)stopVoices();mix();notify();},
    setVolume(channel,value){if(!(channel in volumes)||!Number.isFinite(value))return;volumes[channel]=Math.max(0,Math.min(1,value));if(channels)ramp(channels[channel].gain,volumes[channel]);notify();},
    setLoop(key,createBuffer,gain){
      if(!audible()||gain<=0){const entry=loops.get(key);if(entry){entry.source.stop();loops.delete(key);}return;}
      let entry=loops.get(key);
      if(!entry){if(voices.size>=maxVoices)return;entry=voice(createBuffer(context),'ambience',0,1,true);loops.set(key,entry);}
      ramp(entry.gain.gain,gain);
    },
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    getStats(){return {initialized:!!context,enabled,active,busy,error,state:context?.state??'uninitialized',volumes:{...volumes},loaded:buffers.size,voices:voices.size,loops:loops.size,played,dropped};},
    destroy(){disposed=true;enabled=false;stopVoices();listeners.clear();if(context){context.onstatechange=null;void context.close().catch(()=>{});}},
  };
}
