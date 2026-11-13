# John-Paul Simulator

A browser-based 3D tactical FPS. There is no build step: it is plain ES modules loaded straight from the folder, so it runs on GitHub Pages as-is.

- **Modes:** Ranked 1v1 (ELO), 1v1 Duel (both 1v1s have a round economy: winning pays more than losing), 2v2 Wingman, 5v5 Bomb Defusal (full economy), 5v5 Hostage Rescue (carry one of two hostages back to your spawn), 4v4 Retakes (the charge is already planted; attackers hold the site, defenders retake and defuse), Team Deathmatch, Gun Game, Free For All. Every mode shows its win condition ("First to …") on the HUD and scoreboard.
- **Training Range** (Play → Versus bots): free practice, a 60-second aim drill with best scores, moving targets, a spray board and grenade line-ups with a live arc preview. Unlimited ammo, every weapon free.
- **Seasons:** three-month ranked seasons (Season 1 runs to Dec 31, 2026; Seasons 2–5 cover all of 2027). Each has a 30-tier reward track filled by match and challenge XP, four season-exclusive cosmetics and a ranked card for 5 ranked wins. Ratings move halfway back toward 1000 when a season ends. Future seasons' items are visible but locked until they start.
- **Challenges:** three daily (300 XP) and three weekly (1,000 XP) challenges, the same for everyone, shown on the Season tab.
- **Play of the match:** the best multi-kill replays at the end of every match before the results.
- **Pings and inspect:** tap **Z** to mark a spot or an enemy for your team, hold it for a callout wheel; **V** inspects your weapon.
- **Commend and report:** after an online match, commend or report the other players from the results screen. Reports include the match and that player's chat.
- **Admin panel** (Carter's account only): report queue, player search and profiles, bans, mutes, kicks, warnings, renames, stat edits and resets, giving or removing items, voiding ranked results, announcements, maintenance mode, XP events and an audit log of every admin action.
- **Online:** quick-match queues, custom lobbies with join codes, a lobby browser, an online-players list and in-match chat
- **Parties:** invite friends from the online list (the + slots at the top of the menu). The leader queues or opens a lobby and the whole party comes along on the same team.
- **Spectating:** press Watch next to a friend in a non-ranked match to join as a spectator with third-person, first-person and free cameras.
- **Kill cams and replays:** dying shows the last few seconds through your killer's eyes. Your last 8 matches are saved in the browser and can be rewatched from any player's view or a free camera, with a timeline and kill markers.
- **Offline:** every mode against bots (Easy / Normal / Hard / Elite). Bots throw grenades, open doors and can be flashed.
- **Offline play (opt-in):** Settings → Offline play saves the game (about 3.5 MB) with a service worker (`sw.js`) so bot matches and the Training Range work with no internet. It's off by default; turning it off removes the saved copy. While online the game always loads fresh files, so updates still arrive.
- **Conditions:** every map can be played at night (stars, lit windows, lamps and a flashlight), in rain (a blizzard on the snow maps) or in fog. Pick them for bot matches and custom lobbies; casual queues sometimes roll one, ranked always plays the standard look. Bots can't see as far at night, in rain or in fog.
- **Map workshop:** a map editor (Workshop tab) for small maps and large maps with bomb sites: paint walls, cover, platforms, catwalks, ladders, doors, glass, barrels, ammo and wood, place spawns and sites, mirror for fair symmetric maps, and check that the spawns can't see each other and everything is reachable. Test against bots, then upload (5 maps per account). Players browse, like and download community maps; a match on a community map carries the map, so everyone in it can play. **Featured maps:** 4 slots (2 small, 2 large) chosen from the most-liked maps and approved in the admin panel. They load on every device and join every queue's rotation, ranked included.
- **Friends:** add friends by username or from the online list, accept or decline requests, see who's online and what they're playing, invite them to your party or watch their match.
- **Achievements:** 34 badges (bronze, silver, gold) for kills, multi-kills, streaks, long shots, weapons, objectives, every mode, map and condition, and more, on the Stats tab and on profiles. Bot matches count; guests keep progress on their device until they sign in.
- **Accessibility:** colour-blind modes (red-green and blue-yellow) for team, enemy, health and win/loss colours, with enemies shown as diamonds on the radar; on-screen arrows for sounds (gunfire, footsteps, explosions, the charge, doors, glass); toggle crouch and walk; reduced flashing; reduced motion; HUD size.
- **Maps:** small: Vault, Courtyard, Foundry, Outpost · large (with bomb sites): Dustline, Harbor, Canopy, Frostbite. Quick play rotates each mode through its whole map pool. Spawn zones are walled so the two teams can never see each other at a round start, and respawns wait until a spot with no enemy in view is free.
- **Interactive maps:** sliding doors (E), breakable glass, explosive barrels that chain, and ammo crates (E to resupply). Every map has its own dressing: trims, lights, signs pointing to bomb sites, pipes, furnaces, vines, puddles, weather particles and scenery beyond the walls.
- **Operators:** 8 presets, each with a perk (less recoil, faster movement, radar sense, faster snipers, free kevlar, extra grenades, faster plant/defuse, blast resistance, faster reloads). The custom operator picks any perk.
- **Weapons:** 32 in eight classes: Pistols (4), SMGs (4), Shotguns (4), Rifles (4), LMGs (4), Snipers (4, including the AWP, which kills with one shot to the head or body), Knives (4) and Other (nail gun, crossbow, grenade launcher, piercing rail gun).
- **Grenades:** frag, flashbang, smoke, incendiary (smoke puts it out), proximity mine and decoy. Up to 4 carried (5 with Utility Belt). Plus kevlar and helmet.
- **Collection (Armory):** weapon finishes, outfits, calling cards, kill effects and emotes across 5 rarities (79 items). Earned as post-match drops (wins always drop); a few milestone items unlock from your stats instead. Hold **G** in a match for the emote wheel.
- **Movement:** ladders up to catwalks, mantling onto ledges (jump at them and keep pushing), drop-downs with fall damage over ~3 m.
- **Destructible cover:** wooden barricades and crates that bullets pass through at reduced damage and that splinter under fire or explosions.
- **Stats:** record by mode and map, recent form, weapon kills and accuracy, rivals and a map of where you die.
- **Menu:** a live 3D staging area: your operator (and party) stands in one of the maps, and the camera reframes for each section.
- **Loadouts:** whatever you end up holding after you buy is your *last loadout* (switching guns replaces the old one). Press **F** to rebuy it, or **K** to toggle *Keep loadout* so it's re-equipped automatically every round or respawn. The buy menu also has three presets: **Shift+1–3** saves your current kit, **1–3** equips it.
- **Accounts:** sign-up with email confirmation, forgot/reset password, profiles, match history, XP levels, and leaderboards for ELO, kills, wins and level
- **Graphics:** Low / Medium / High / Ultra presets plus individual settings for resolution scale, shadows, MSAA/SMAA/FXAA, bloom, GTAO ambient occlusion, frame-rate cap, FOV and crosshair

## One-time Supabase setup

**1. Database:** SQL Editor → New query → paste all of `supabase/schema.sql` → **Run**. (Safe to re-run; re-run it after updates, e.g. to add the `inventory` column for the Armory, or the friends, achievements and custom map tables.)

**2. URLs:** Authentication → URL Configuration
- **Site URL:** `https://jpsim.carterscoding.com/`
- **Redirect URLs:** add
  - `https://jpsim.carterscoding.com/**`
  - `http://localhost:8765/**`

**3. Email sending (Resend):** Authentication → Emails → SMTP Settings → enable custom SMTP
- Host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key
- Sender email: an address on your Resend-verified domain (e.g. `noreply@yourdomain.com`), sender name `John-Paul Simulator`
- Leave **Confirm email** turned **on** (Authentication → Sign In / Providers → Email).

**4. Email templates:** Authentication → Emails → Templates

| Template | Subject | Body |
|---|---|---|
| Confirm signup | `Confirm your John-Paul Simulator account` | paste `supabase/email-templates/confirm-signup.html` |
| Reset password | `Reset your John-Paul Simulator password` | paste `supabase/email-templates/reset-password.html` |

Each email contains both a button link and a 6-digit code (Email OTP length = 6). Players can click the link or type the code into the game.

**5. Password policy:** Authentication → Sign In / Providers → Email (or Policies)
- Minimum password length **8**
- Password requirements: **lowercase, uppercase letters and digits**

The game enforces the same rules (`js/data/auth.js`), with a live checklist on sign-up and reset.

**6. Cloudflare Turnstile:**
- Cloudflare dashboard → Turnstile → your widget → **Hostnames**: add `jpsim.carterscoding.com` and `localhost`.
- Supabase → Authentication → Attack Protection → **Enable CAPTCHA protection** → provider **Turnstile** → paste the Turnstile **secret key**.
- The public site key is already in `js/config.js`.

Sign in, sign up, forgot password and resend-email all send a Turnstile token. Typing in a 6-digit code doesn't need one.

Confirmation links bring players back to the game already signed in. Reset links open the game on a "Choose a new password" screen. If a link has expired, the game says so and offers to send a new one.

The project URL and publishable key are in `js/config.js`.

## Run locally

```sh
python3 -m http.server 8765
# open http://localhost:8765
```

(ES modules don't work over `file://`, so the game has to be served over HTTP.)

## Deploy to GitHub Pages

The code lives at https://github.com/cksarge/John-Paul-Simulator. In the repo, go to **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**. The game will be live at **https://jpsim.carterscoding.com/**, and every push to `main` redeploys it.

## Database updates

`supabase/schema.sql` is safe to re-run and always holds the full current schema. After pulling changes, paste the whole file into **Supabase Dashboard → SQL Editor** and run it. The November 2026 additions (seasons, challenges, commends, reports, moderation and the admin functions) need it; until then those features stay hidden and the rest of the game works normally.

Admin access is the `public.admins` table, which holds one account id and can only be changed from the SQL editor. Every admin function checks it on the server, so nothing in the browser can grant admin rights. Bans are enforced by the database (no XP, ranked, reports or challenge claims) and by every other player's game (banned accounts are dropped from queues and lobbies); because matches run peer-to-peer, a modified client could still join a friend's lobby directly.

## Controls

| Action | Key |
|---|---|
| Move / jump / crouch / walk | WASD / Space / Ctrl or C / Shift |
| Fire / scope (sniper) / heavy stab (knife) | Left mouse / Right mouse |
| Reload | R |
| Weapons (primary / pistol / knife / grenades / charge) | 1 – 5, Q = last weapon, mouse wheel |
| Buy menu | B |
| Rebuy last loadout / toggle keep loadout | F / K |
| Equip / save preset (in buy menu) | 1–3 / Shift+1–3 |
| Plant / defuse | Hold E |
| Emote wheel | Hold G, move the mouse, release |
| Ping / ping wheel | Tap Z / hold Z, move the mouse, release |
| Inspect weapon | V |
| Pick up a hostage | Hold E |
| Skip kill cam | Space |
| Open / close door, resupply at ammo crate | E |
| Scoreboard | Tab |
| Chat (online) | Y or Enter |
| Pause / settings | Esc |

### Controller

Any controller the browser sees as a standard gamepad works (Xbox, PlayStation, Switch Pro and most others). Pick it up and press a button; hints switch to controller buttons, and any key or mouse movement switches back. Phones and tablets have no keyboard or mouse, so they show a "Connect a controller" screen until one is paired.

| Action | Button |
|---|---|
| Move (light push walks) / look | Left stick / right stick |
| Fire / aim or scope | RT / LT |
| Jump / crouch / reload | A / B / X |
| Last weapon / next weapon / grenade | Y / D-pad ↓ / LB |
| Ping (hold for the wheel) / inspect | R3 / L3 |
| Use, plant, defuse, pick up a hostage | RB (hold to plant, defuse or pick up) |
| Buy menu / rebuy | D-pad ← / D-pad → |
| Emote wheel | Hold D-pad ↑, point with the right stick |
| Scoreboard / pause | View / Menu |
| Menus | D-pad or left stick to move, A select, B back, LB/RB switch sections, right stick scrolls |
| Replays | X play/pause, LT/RT skip 5 s, Y camera, LB/RB switch player |

Look sensitivity, invert Y, stick dead zone and vibration are under Settings → Controller. Chat still needs a keyboard.

## How multiplayer works

There is no game server. The player who forms the match (the longest wait in the queue, or the lobby creator) becomes the **host**. The host runs the round logic, the economy, the bots and damage, and relays everything over Supabase Realtime broadcast channels. Each player simulates their own movement and hit detection, which favours the shooter.

Disconnects and reconnecting:
- If anyone drops, the match waits **10 seconds** for them. After that a bot plays for them, and they can return any time with **Reconnect** on the Play tab to take their player back.
- If the **host** drops for good, the remaining player with the lowest id takes over hosting automatically and the match continues.
- In ranked, a player who is gone for more than 10 seconds forfeits.

Limitations:
- Supabase's free tier caps realtime messages per second. 1v1 and 2v2 are well within it, but a full 10-human 5v5 is near the limit, so send rates automatically drop as more humans join.
- Results are reported by the clients, which is fine among friends but not cheat-proof.

## Dev tools

- `tools/check-spawns.html`: open in the browser after editing any map. Every map must show 0 spawn sightlines and 0 unreachable spots. (Retakes picks defender spawns per site at match start, hidden from the whole site.)
- `tools/audit-ui.js`: in the browser console, `await (await import('/tools/audit-ui.js')).auditMenus()` (and `auditGame()`) checks that every button on every screen can be scrolled to and clicked, and that nothing is cut off sideways without a scrollbar. Run it at a few window sizes.

Fonts are self-hosted in `fonts/` (Latin subsets) with their SIL Open Font License files.

## Project layout

```
index.html, css/style.css
js/main.js            app bootstrap, sessions, starting matches
js/config.js          Supabase URL + publishable key
js/data/              weapons, modes & ranks, maps, operators
js/engine/            renderer + post-processing, world/collision/nav, textures, models, viewmodel, effects, audio
js/game/              match controller, player, combat, round rules, bot AI, HUD, input
js/net/               Supabase API, realtime rooms, matchmaking & lobbies
js/ui/                menus, character creator preview
supabase/schema.sql   tables, RLS policies, ELO/stat functions
```
