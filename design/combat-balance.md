# Combat balance, September 5

## Current revision: stronger heroes and common mobility kit

This section supersedes the historical balance below. The common kit is Dash, Sprint and Shockwave for every hero. Health remains 660 / 540 / 600. All values are deterministic and centralized in `shared/balance.ts`.

| Budget | Current value | Reason |
| --- | --- | --- |
| Hero basic attacks | 60 DPS | 600 reference HP / 10 seconds; up 40% |
| Knight / ranger attack | 54 every .9 seconds | Equal sustained damage |
| Lancer attack | 42 every .7 seconds | Equal damage, faster cadence |
| Soldier attack | 6 every 1.2 seconds | 5 DPS; one twelfth of hero DPS, down 40% |
| Soldier HP | 180 | A clean Dash defeats one |
| Dash, slot 1 | 180 damage; up to 3 tiles; 8-second cooldown | 30% reference HP; each target once per cast |
| Sprint, slot 2 | 7.5 tiles/second for 3 seconds; 12-second cooldown | 1.5 times normal speed; 25% maximum uptime |
| Shockwave, slot 3 | 150 damage within 3 tiles; .7-tile push; 16-second cooldown | 25% reference HP and space to disengage |

One hero's basic DPS equals twelve soldiers. Three soldiers take approximately 36 seconds to remove a full 540 HP ranger, versus 21.6 seconds before. Basic attacks take approximately 9–11 seconds against a healthy hero. Dash + Shockwave deals 330 damage, 55% of reference HP, leaving a full-health ranger at 210 HP. First hits are immediate; simulation tests check measured timing as well as these HP/DPS estimates.

Dash checks collision every .1 tile, stopping at terrain, living units or structures, and hits nearby enemies once via a per-cast hit set. Defeated soldiers no longer block subsequent steps. It does not teleport through walls. Its effect exposes origin/end points and `abilitySlot: 1` for rendering a trail. Shockwave pushes only living actors using the shared collision sweep; buildings never move. Sprint uses the shared `getMoveSpeed(actor, elapsed)` function and `sprintUntil` timestamp for server/client agreement.

Tower/core damage, soldier HP, companion damage, regen, resource costs, proportional health migration, last-hit explanations and spawn protection are unchanged. Respawn clears Sprint and any legacy guard state. The older class-specific abilities below are replaced, not additional powers. Tests cover dash sweep/once-only hits, forest/tower collision, sprint expiry, knockback, all classes, actual kill time and persisted-state safety.

## Historical revision (superseded)

The old soldier reused knight damage, 32 per 0.9 seconds. Three soldiers produced about 107 damage per second against a 240 HP ranger. The old 95 + 150 knight skill combo also exceeded that ranger's full health. Towers selected the nearest hero even when lane soldiers were available.

The new baseline is 600 reference HP and 600 / 14 = 42.86 basic damage per second. All values live in `shared/balance.ts` and use fixed damage, not random rolls.

| Budget | Value | Result without healing or skills |
| --- | --- | --- |
| Knight / ranger / lancer health | 660 / 540 / 600 | 15.4 / 12.6 / 14 seconds against reference basic DPS |
| Soldier attack | 10 every 1.2 seconds | 8.33 DPS; three soldiers need 21.6 seconds for a ranger |
| Companion attack | 12 every 1.2 seconds | 10 DPS |
| Tower attack | 60 every second | 9 to 11 hits to kill a hero |
| Core attack | 30 every second | Half tower DPS |
| Primary skill | Knight 96 / ranger 90 / lancer 108 | 15–18% of reference HP |
| Ultimate | 120 | 20% of reference HP |
| Primary plus ultimate | 210–228 | 35–38% of reference HP |
| Skill cooldowns | 6 / 10 / 18 seconds | More frequent primary and ultimate casts |
| Knight guard | 55% reduction for 3 seconds | Defensive timing matters |
| Knight primary healing | 10% of maximum health | 66 HP |
| Regen | 30% max health every 30 seconds | Existing percentage retained |

Times above are HP / DPS estimates. Immediate first hits, the 100ms server tick and cooldown rounding change measured kill times. Tests cover both formulas and actual simulation, including a 12–16 second basic kill and an 8–11.2 second exposed knight tower death.

Towers now target soldiers, then companions, then heroes, using distance within each group. Spawn and respawn grant three seconds of protection. Offensive actions cancel it. Damage records the last source, amount and match time so the UI can explain the hit that caused a death. Multiple enemies can still kill a hero quickly; retreat, soldiers and guard are intended counters. There is no hidden armor statistic.

Existing rooms migrate health proportionally on the next tick, without reviving dead units or resetting cooldowns. Resources and construction costs are unchanged. This is a reproducible starting balance, not a claim of competitive tuning or equal skill strength across all matchups.
