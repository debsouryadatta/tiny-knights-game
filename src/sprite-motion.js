// Keep the full-speed 10fps stride, but let partial joystick movement travel
// proportionally through the sheet. A correction/teleport cannot spin a cycle.
export function advanceRunPhase(phase,distancePixels,speedTiles,dt){
  if(!(distancePixels>0&&speedTiles>0&&dt>0))return phase;
  const distance=Math.min(distancePixels,speedTiles*64*Math.min(dt,.1)*1.5);
  return phase+distance/(speedTiles*64)*10;
}
