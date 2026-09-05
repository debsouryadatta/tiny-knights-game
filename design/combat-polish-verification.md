# Movement and combat polish

September 5, 2026.

## Movement

The old renderer kept easing the predicted position toward authoritative coordinates after a stop. Its camera offset also changed direction according to the next lane waypoint. The revised renderer stops local prediction immediately, clears accumulated correction, and rebases once when the stop sequence is acknowledged. It uses a fixed team-oriented camera offset and does not extrapolate remote units beyond their latest position.

Authoritative snapshots are processed when state changes, including command updates between simulation ticks. Large displacements, death and respawn reset prediction rather than being gradually smoothed like ordinary movement. Running animation advances with actual movement. Collision and authoritative positions remain unchanged. One server correction can still occur on acknowledgement under latency; the client does not conceal authoritative corrections indefinitely.

## Combat and visuals

- Hold Space to attack, release to stop. Desktop HUD exposes the key and pressed state.
- Recall has a timed ground ring, light column, rising motes, channel meter, cancellation fade and departure/arrival effects.
- Regeneration has a green halo, rising particles, healing cross and actual healed-HP number when health increases.
- Dash trails, expanding shockwave, melee strike arcs, projectile tracers, impact flashes and damage numbers have separate local lifetimes instead of repeatedly restarting with snapshots.
- Death uses a falling/fading sprite plus a burst. Respawn has an arrival effect. Lancer sprite scaling accounts for its larger source frame.
- Effects are deduplicated, capped at 96, culled outside the view, suppressed in tactical view, and support reduced motion.
- Damage metadata contains actual HP removed after mitigation. Protected targets are not knocked back. Out-of-range target locks do not suppress attacks on reachable foes. Death/respawn clears old control state while preserving input sequence ordering.

## Verification

- 50 shared simulation tests and five effect-lifecycle tests pass.
- Production build, backend TypeScript, whitespace check and real two-client SDK integration pass.
- Twelve applicable browser checks pass across desktop, mobile landscape and portrait; 15 viewport-inapplicable cases skip. Final stronger recall/heal visuals were rechecked separately: four pass, two skip.
- Dedicated delayed-snapshot tests verify continuous movement without repeated rewind, immediate freeze before stop acknowledgement, stable position afterward and no vertical camera tail.
- Screenshot review includes recall, regen, melee impact, dash/shockwave, death and respawn. IAB verifies the existing public tunnel as well as local automated browser runs.

Local database republished without deleting data. The existing ngrok tunnel serves the updated frontend. No permanent cloud deployment was changed.
