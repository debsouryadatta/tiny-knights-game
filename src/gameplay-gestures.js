// Safari can emit native scale gestures independently of Pointer Events.
// Leave touch/pointer events intact so joystick + attack still work together.
export function installGameplayGestureGuard() {
  const preventGameZoom = event => {
    if (document.body.classList.contains('join-active') || document.querySelector('dialog[open]')) return;
    if (!event.target?.closest?.('#game, #ui .hud, #ui .topbar')) return;
    if (event.cancelable) event.preventDefault();
  };
  const options = {passive:false};
  for (const type of ['gesturestart','gesturechange']) document.addEventListener(type,preventGameZoom,options);
  return () => {
    for (const type of ['gesturestart','gesturechange']) document.removeEventListener(type,preventGameZoom,options);
  };
}
