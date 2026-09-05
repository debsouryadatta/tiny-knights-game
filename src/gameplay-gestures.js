// Cancel native button-tap defaults, not pointer events or pinch gestures.
export function installGameplayGestureGuard() {
  const touches=new Map();
  const start=e=>{
    if(e.touches.length!==1){touches.clear();return;}
    const button=e.target.closest?.('button');
    if(button&&!button.disabled){const t=e.changedTouches[0];touches.set(t.identifier,{button,x:t.clientX,y:t.clientY});}
  };
  const end=e=>{
    for(const t of e.changedTouches){
      const prior=touches.get(t.identifier);touches.delete(t.identifier);
      if(!prior||e.touches.length||Math.hypot(t.clientX-prior.x,t.clientY-prior.y)>12)continue;
      const hit=document.elementFromPoint(t.clientX,t.clientY);
      if(!prior.button.contains(hit)||prior.button.disabled||!e.cancelable)continue;
      e.preventDefault();
      // detail=1 skips the keyboard-only fallback on pointer-driven skills.
      prior.button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:t.clientX,clientY:t.clientY}));
    }
  };
  const clear=()=>touches.clear();
  const move=e=>{for(const t of e.changedTouches){const p=touches.get(t.identifier);if(p&&Math.hypot(t.clientX-p.x,t.clientY-p.y)>12)touches.delete(t.identifier);}};
  document.addEventListener('touchstart',start,{passive:true});
  document.addEventListener('touchmove',move,{passive:true});
  document.addEventListener('touchend',end,{passive:false});
  document.addEventListener('touchcancel',clear);
  const button=document.createElement('button');button.id='reset-view';button.textContent='Reset view';button.hidden=true;
  button.setAttribute('aria-label','Reset zoomed view');document.body.append(button);
  const viewport=document.querySelector('meta[name="viewport"]'),original=viewport?.content;
  let timer;
  const update=()=>{
    const v=window.visualViewport;
    button.hidden=!v||v.scale<=1.05;
    if(v){button.style.left=`${v.offsetLeft+v.width/2}px`;button.style.top=`${v.offsetTop+12/v.scale}px`;button.style.transform=`translateX(-50%) scale(${1/v.scale})`;}
  };
  button.addEventListener('click',()=>{
    if(!viewport)return;
    clearTimeout(timer);
    viewport.content='width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover';
    timer=setTimeout(()=>{viewport.content=original;update();if(!button.hidden)button.textContent='Pinch inward to zoom out';},300);
  });
  window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);update();
  return()=>{
    document.removeEventListener('touchstart',start);document.removeEventListener('touchmove',move);document.removeEventListener('touchend',end);document.removeEventListener('touchcancel',clear);
    window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);
    clearTimeout(timer);if(viewport)viewport.content=original;button.remove();
  };
}
