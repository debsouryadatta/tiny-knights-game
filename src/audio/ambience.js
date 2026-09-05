import {WIDTH,HEIGHT,riverX,isForest,baseFor} from '../../shared/map.ts';
import {attenuation} from './engine.js';
import {radii} from './config.js';

const river=Array.from({length:HEIGHT-3},(_,i)=>({x:riverX(i+2),y:i+2}));
const forest=[];
for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)if(isForest(x,y))forest.push({x,y});
const bases=[baseFor('blue'),baseFor('red')];
const distance=(p,points)=>Math.min(...points.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));
export function ambienceGains(position){
 return {river:.16*attenuation(distance(position,river),...radii.river),
 forest:.09*attenuation(distance(position,forest),...radii.forest),
 base:.09*attenuation(distance(position,bases),...radii.base)};
}
// Seeded synthesis with periodic envelopes and a short seam fade: no external ambience downloads.
export function synthesize(context,kind){
 const seconds=8,buffer=context.createBuffer(1,context.sampleRate*seconds,context.sampleRate),data=buffer.getChannelData(0);
 let seed=1234567,low=0;
 for(let i=0;i<data.length;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=seed/4294967296*2-1,t=i/context.sampleRate;
  low=.98*low+.02*noise;
  const seam=Math.min(1,i/(context.sampleRate*.05),(data.length-1-i)/(context.sampleRate*.05));
  if(kind==='river')data[i]=seam*(low*2.5+noise*.12)*(.85+.15*Math.sin(2*Math.PI*t/seconds));
  else if(kind==='forest'){
   const phase=t%2,chirp=phase<.22?Math.sin(Math.PI*phase/.22)**2*Math.sin(2*Math.PI*(1500*phase+900*phase*phase))*.12:0;
   data[i]=seam*(low*1.5+chirp);
  }else{
   const phase=t%4,chime=Math.sin(2*Math.PI*440*t)*Math.exp(-phase*4)*Math.min(1,phase*30);
   data[i]=seam*(Math.sin(2*Math.PI*110*t)*.1+chime*.18);
  }
 }
 return buffer;
}
export function createWorldAmbience(audio){
 const buffers=new Map();let gains={river:0,forest:0,base:0};
 return {
  update(position){gains=ambienceGains(position);for(const [key,gain]of Object.entries(gains))audio.setLoop(key,context=>{
   if(!buffers.has(key))buffers.set(key,synthesize(context,key));return buffers.get(key);
  },gain);},
  getStats:()=>({...gains}),
 };
}
