import {enterFullscreen, isIPhone, isStandalone, showInstallGuide} from './fullscreen.js';
/** Fullscreen must begin in a user gesture. Unsupported browsers remain playable. */
export function installMobilePlayPrompt() {
  const host=document.querySelector('.join-heading');
  if(!host)return()=>{};
  const panel=document.createElement('section');panel.className='mobile-play-prompt';panel.hidden=true;
  panel.setAttribute('aria-label','Mobile play settings');
  panel.innerHTML='<p id="mobile-play-tip">Best played sideways. Tap to enter fullscreen and request landscape mode.</p><div><button type="button" id="mobile-play-start">Play in landscape</button><button type="button" id="mobile-play-dismiss">Not now</button></div>';
  host.append(panel);
  let dismissed=false,busy=false,attempted=false;
  const start=panel.querySelector('#mobile-play-start'),tip=panel.querySelector('p');
  const refresh=()=>{
    const mobile=matchMedia('(pointer: coarse)').matches&&Math.min(innerWidth,innerHeight)<=900;
    panel.hidden=dismissed||!mobile||(isStandalone()&&innerWidth>innerHeight);
    if(isIPhone()&&!isStandalone()){
      tip.textContent='Play without browser bars. Add Tiny Knights to your Home Screen. No App Store download.';
      start.textContent='Add to Home Screen';return;
    }
    if(isStandalone()){
      tip.textContent='Turn your phone sideways to play. Turn off Portrait Orientation Lock if needed.';
      start.textContent='Check orientation';return;
    }
    if(!attempted)start.textContent=innerWidth>innerHeight?'Play fullscreen':'Play in landscape';
  };
  const dismiss=()=>{dismissed=true;refresh();};
  const enter=async()=>{
    if(isIPhone()&&!isStandalone()){showInstallGuide();return;}
    if(busy)return;busy=true;start.disabled=true;attempted=true;
    try{
      await enterFullscreen();
      try{await screen.orientation.lock('landscape');}catch{/* iOS and some browsers cannot lock. */}
      if(innerWidth>innerHeight){dismiss();return;}
      tip.textContent='Rotate your device sideways; enable auto-rotate if needed.';
      start.textContent='Try landscape again';
    }catch{
      tip.textContent='This browser cannot open fullscreen here. Rotate your device sideways, or continue in portrait.';
      start.textContent='Try again';
    }finally{busy=false;start.disabled=false;}
  };
  start.addEventListener('click',enter);panel.querySelector('#mobile-play-dismiss').addEventListener('click',dismiss);
  const resize=()=>{if(attempted&&document.fullscreenElement&&innerWidth>innerHeight)dismiss();else refresh();};
  window.addEventListener('resize',resize);refresh();
  return()=>{window.removeEventListener('resize',resize);panel.remove();};
}
