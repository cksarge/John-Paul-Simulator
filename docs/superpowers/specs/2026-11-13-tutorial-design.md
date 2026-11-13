# Tutorial — design

**Date:** 2026-11-13 · **Status:** approved in chat

## Goal
New players learn every core system hands-on in about 6 minutes, in an offline guided course.

## Entry
- **First-launch card:** "New here? Play the tutorial (about 6 min)" with Play / Skip. Shown once, only when
  `localStorage.jps_tutorial_seen` is unset and the player has no matches (guests: no local match history;
  signed-in: profile shows 0 matches). Either button sets the flag.
- **Menu:** a Tutorial button in Play → Versus bots, beside Training Range.

## Course
New map `course` (`training: true`, so it stays out of every rotation and map list). It is one route through rooms,
in this order:

1. Basics: look around, move to marker, walk, jump a crate, crouch under a low bridge.
2. Climbing: mantle a ledge, ladder up to a catwalk, lift down.
3. Doors: open a sliding door (E), press a switch to open a gate.
4. Shooting: hit 3 targets, reload, switch to pistol → knife → back, inspect (V).
5. Grenades: frag a cracked wall down, throw a smoke.
6. Buying: open the buy menu, buy a rifle + kevlar, rebuy (F), toggle keep loadout (K).
7. Bomb site: pick up the charge, plant on the site (hold E), then switch sides and defuse.
8. Team tools: ping (Z), ping wheel (hold Z), emote (G), scoreboard (Tab).
9. Final test: 1v1 against an Easy bot. If you die you respawn and try again. Winning shows "Tutorial complete"
   with buttons for Play vs bots, Training Range and Menu.

## Architecture
- `js/data/modes.js`: a `tutorial` mode (`kind: 'tutorial'`, offline only, map `course`) added to `SOLO_KINDS`.
- `js/data/maps.js`: the `course` map.
- `js/game/tutorial.js`: a `Tutorial` class that hooks into `game.js` the same way `Training` does. Steps are
  data, `{ id, title, text(keys), marker, setup(), done() }`. The runner shows the current step, places the marker
  (a floor ring with a light beam), checks `done()` every frame and moves on with a short success sound.
- Plant/defuse reuse the real bomb code: the runner sets `state.bomb` directly and switches `team` for the defuse.
  The tutorial has no round rules, money limit or timers; a defuse never ends the match.
- HUD: an objective panel ("Step 4/9 · Climb the ladder"). Key names come from `pad.label`, so they follow
  remapping and controller use.
- Pause menu: Skip step and Leave tutorial.
- On completion, set `localStorage.jps_tutorial_done`. No database writes, stats, achievements or XP.

## Testing
Play the whole course in the browser with keyboard and mouse. Confirm:
- each step's check fires;
- Skip step works;
- the first-launch card shows only once;
- `course` doesn't appear in any rotation, map picker or workshop list.
