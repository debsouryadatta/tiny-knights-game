import { test as base, expect, chromium } from '@playwright/test';
const test=base.extend({page:async ({},use)=>{
 if(!process.env.HELIUM_CDP_URL)throw new Error('Launch a throwaway Helium and set HELIUM_CDP_URL.');
 const browser=await chromium.connectOverCDP(process.env.HELIUM_CDP_URL);
 const page=await browser.contexts()[0].newPage();
 await page.setViewportSize({width:1440,height:1000});
 try{await use(page);}finally{await page.close();await browser.close();}
}});
test('world loads, movement works, map opens, and landmarks are reachable', async ({ page }) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.realm?.state.ready);
 const start=await page.evaluate(()=>realm.state);
 await page.keyboard.down('s');await page.waitForTimeout(600);await page.keyboard.up('s');
 const moved=await page.evaluate(()=>realm.state);expect(moved.y).toBeGreaterThan(start.y+50);
 await page.keyboard.down('Shift');await page.keyboard.down('s');await page.waitForTimeout(600);await page.keyboard.up('s');await page.keyboard.up('Shift');
 const ran=await page.evaluate(()=>realm.state);expect(ran.y-moved.y).toBeGreaterThan(moved.y-start.y);
 await page.keyboard.press('m');await expect(page.locator('#map-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#map-dialog')).not.toBeVisible();
 const connected=await page.evaluate(()=>{const step=16,w=200,h=160,seen=new Set(),queue=[[Math.round(realm.state.x/step),Math.round(realm.state.y/step)]];seen.add(queue[0].join(','));for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(const [dx,dy]of [[0,1],[1,0],[0,-1],[-1,0]]){const nx=x+dx,ny=y+dy,key=nx+','+ny;if(nx<0||ny<0||nx>=w||ny>=h||seen.has(key)||!realm.walkable(nx*step,ny*step))continue;seen.add(key);queue.push([nx,ny]);}}return realm.places.map(p=>({name:p.name,reachable:queue.some(([x,y])=>Math.hypot(x*step-p.x,y*step-p.y)<p.r)}));});
 expect(connected.every(p=>p.reachable),JSON.stringify(connected)).toBeTruthy();expect(errors).toEqual([]);
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.realm?.state.ready);await page.waitForTimeout(800);await page.screenshot({path:'tests/world-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tests/world-mobile.png'});
});
