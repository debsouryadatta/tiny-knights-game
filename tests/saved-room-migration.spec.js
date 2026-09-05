import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
test('a saved legacy waiting room migrates before the client validates its map',async({page})=>{
 test.skip(!process.env.MIGRATION_TEST_URL,'Requires prepared isolated old waiting room and upgraded module');
 const saved=JSON.parse(readFileSync('/tmp/tiny-knights-migration-session.json','utf8'));
 await page.addInitScript(({uri,database,room,token})=>{
  sessionStorage.setItem(`tiny-knights-session:${uri}:${database}:${room}`,token);
 },saved);
 await page.goto(process.env.MIGRATION_TEST_URL);
 await page.locator('input[name="name"]').fill('Saved player');
 await page.locator('input[name="room"]').fill(saved.room);
 await page.locator('#join').click();
 await expect(page.locator('#waiting-lobby')).toBeVisible({timeout:20000});
 await expect(page.locator('#join-error')).toBeEmpty();
 expect(await page.evaluate(()=>window.realm.match.mapVersion)).toBe(2);
 expect(await page.evaluate(()=>window.realm.state.playerId)).toBe('blue-hero-0');
 await page.locator('#lobby-start').click();
 await expect(page.locator('#join-screen')).toBeHidden();
 const x=await page.evaluate(()=>window.realm.state.x);
 await page.keyboard.down('d');
 await expect.poll(()=>page.evaluate(()=>window.realm.state.x)).toBeGreaterThan(x+20);
 await page.keyboard.up('d');
});
