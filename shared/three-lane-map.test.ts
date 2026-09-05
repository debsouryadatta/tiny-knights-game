import test from 'node:test';
import assert from 'node:assert/strict';
import {LANES, WIDTH, HEIGHT, baseFor, bridgeCenters, isLane, isRiver, isWalkable, laneAt, laneWaypoints, resourceSeeds} from './map';

test('battlefield is a landscape rectangle',()=>{assert.ok(WIDTH>HEIGHT);assert.equal(WIDTH/HEIGHT,10/7);});

test('all three roads and river crossings are walkable from either base',()=>{
  for(const team of ['blue','red'] as const)for(const lane of LANES){
    const path=laneWaypoints(team,lane);
    assert.deepEqual(path[0],baseFor(team));
    assert.deepEqual(path.at(-1),baseFor(team==='blue'?'red':'blue'));
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*10);
      for(let j=0;j<=steps;j++){
        const x=Math.round(a.x+(b.x-a.x)*j/steps),y=Math.round(a.y+(b.y-a.y)*j/steps);
        assert.ok(isWalkable(x,y),`${team} lane ${lane} blocked at ${x},${y}`);
      }
    }
  }
  bridgeCenters.forEach((p,lane)=>{
    assert.equal(laneAt(p.x,p.y),lane);
    assert.ok(isRiver(p.x,p.y));
    assert.ok(isWalkable(Math.round(p.x),Math.round(p.y)));
  });
  assert.equal(laneAt(8,25),0);
  assert.equal(laneAt(71,30),2);
  assert.ok(isRiver(37,16));
  assert.equal(isWalkable(37,16),false,'water between bridges must remain impassable');
});

test('road and collision geometry stays rotationally symmetric',()=>{
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    assert.equal(isLane(x,y),isLane(WIDTH-1-x,HEIGHT-1-y),`road ${x},${y}`);
    assert.equal(isWalkable(x,y),isWalkable(WIDTH-1-x,HEIGHT-1-y),`collision ${x},${y}`);
  }
});

test('all walkable cells and resource clearings connect to the bases',()=>{
  const start=baseFor('blue'),queue=[start],seen=new Set([start.y*WIDTH+start.x]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i];
    for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const x=p.x+dx,y=p.y+dy,key=y*WIDTH+x;
      if(isWalkable(x,y)&&!seen.has(key)){seen.add(key);queue.push({x,y});}
    }
  }
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)if(isWalkable(x,y)){
    assert.ok(seen.has(y*WIDTH+x),`isolated cell ${x},${y}`);
  }
  for(const p of resourceSeeds())assert.ok(seen.has(p.y*WIDTH+p.x),`inaccessible ${p.kind} at ${p.x},${p.y}`);
});
