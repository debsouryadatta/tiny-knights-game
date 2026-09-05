import { enterPlayerName } from './helpers/player-name.js';
import { test, expect } from '@playwright/test';

test('draft exposes public, create, and code paths without starting a match',async({page})=>{
 await page.goto('/');
 for(const id of ['quick-play','create-room','join'])await expect(page.locator('#'+id)).toBeVisible();
 await enterPlayerName(page);await page.locator('#join').click();
 await expect(page.locator('#join-error')).toContainText('room code');
 await expect(page.locator('#join-screen')).toBeVisible();
 await page.locator('[data-choice="hero"] [data-value="ranger"]').click();
 await page.locator('[data-choice="companion"] [data-value="scout"]').click();
 await page.locator('input[name="name"]').fill('Lobby Ranger');
 await enterPlayerName(page);await page.locator('#create-room').click();
 await expect(page.locator('#waiting-lobby')).toBeVisible();
 if(await page.locator('.mobile-play-prompt').isVisible())await page.locator('#mobile-play-dismiss').click();
 await expect(page.locator('#lobby-copy')).toHaveText(/^[A-F0-9]{6}$/);
 await expect(page.locator('#lobby-roster')).toContainText('Lobby Ranger');
 await expect(page.locator('#lobby-roster')).toContainText('ranger');
 const before=await page.evaluate(()=>window.realm.match.elapsed);
 await page.keyboard.press('Space');
 await page.waitForTimeout(400);
 expect(await page.evaluate(()=>window.realm.match.elapsed)).toBe(before);
 await page.locator('#lobby-start').click();
 await expect(page.locator('#join-screen')).toBeHidden();
 await expect(page.locator('#hero-name')).toHaveText('Lobby Ranger');
 await expect(page.locator('#hero-class')).toContainText('Lv 1');
 await expect.poll(()=>page.evaluate(()=>window.realm.match.elapsed)).toBeGreaterThan(before);
});

test('friend joins waiting room, readies, starts with host, and reconnects',async({browser,baseURL},info)=>{
 test.skip(info.project.name!=='desktop');
 const a=await browser.newContext({baseURL}),b=await browser.newContext({baseURL});
 try{
 const host=await a.newPage(),guest=await b.newPage();
 await host.goto('/');await enterPlayerName(host);await host.locator('#create-room').click();await expect(host.locator('#waiting-lobby')).toBeVisible();
 const room=await host.locator('#lobby-copy').textContent();
 await guest.goto('/?room='+room);await guest.locator('input[name="name"]').fill('Friend');await enterPlayerName(guest);await guest.locator('#join').click();await expect(guest.locator('#waiting-lobby')).toBeVisible();
 await expect(host.locator('#lobby-start')).toBeDisabled();await expect(guest.locator('#lobby-start')).toBeHidden();
 await guest.locator('#lobby-ready').click();await expect(host.locator('#lobby-start')).toBeEnabled();await host.locator('#lobby-start').click();
 await expect(host.locator('#join-screen')).toBeHidden();await expect(guest.locator('#join-screen')).toBeHidden();
 const id=await guest.evaluate(()=>window.realm.state.playerId);await guest.reload();await enterPlayerName(guest);await guest.locator('#join').click();
 await expect(guest.locator('#join-screen')).toBeHidden();expect(await guest.evaluate(()=>window.realm.state.playerId)).toBe(id);
 }finally{await a.close();await b.close();}
});

test('Quick Play joins a public game and resumes the same identity',async({page})=>{
 await page.goto('/');await enterPlayerName(page);await page.locator('#quick-play').click();await expect(page.locator('#quick-bot')).toBeVisible();if(await page.locator('.mobile-play-prompt').isVisible())await page.locator('#mobile-play-dismiss').click();await page.locator('#quick-bot').click();await expect(page.locator('#join-screen')).toBeHidden();
 await expect(page.locator('#connection')).toContainText('1v1');
 const session=await page.evaluate(()=>({id:window.realm.state.playerId,room:window.realm.state.room}));
 await page.reload();await enterPlayerName(page);await page.locator('#quick-play').click();await expect(page.locator('#join-screen')).toBeHidden();
 expect(await page.evaluate(()=>({id:window.realm.state.playerId,room:window.realm.state.room}))).toEqual(session);
});
