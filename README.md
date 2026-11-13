# John-Paul Simulator

A browser-based 3D tactical FPS. There is no build step: it is plain ES modules loaded straight from the folder, so it runs on GitHub Pages as-is.

- **Modes:** Ranked 1v1 (ELO), 1v1 Duel (both 1v1s have a round economy: winning pays more than losing), 2v2 Wingman, 5v5 Bomb Defusal (full economy), Team Deathmatch, Gun Game, Free For All. Every mode shows its win condition ("First to …") on the HUD and scoreboard.
- **Online:** quick-match queues, custom lobbies with join codes, a lobby browser, an online-players list and in-match chat
- **Offline:** every mode against bots (Easy / Normal / Hard / Elite). Bots throw grenades, open doors and can be flashed.
- **Maps:** small: Vault, Courtyard, Foundry, Outpost · large (with bomb sites): Dustline, Harbor, Canopy, Frostbite. Quick play rotates each mode through its whole map pool. Spawn zones are walled so the two teams can never see each other at a round start, and respawns wait until a spot with no enemy in view is free.
- **Interactive maps:** sliding doors (E), breakable glass, explosive barrels that chain, and ammo crates (E to resupply). Every map has its own dressing: trims, lights, signs pointing to bomb sites, pipes, furnaces, vines, puddles, weather particles and scenery beyond the walls.
- **Operators:** 8 presets, each with a perk (less recoil, faster movement, radar sense, faster snipers, free kevlar, extra grenades, faster plant/defuse, blast resistance, faster reloads). The custom operator picks any perk.
- **Weapons:** 32 in eight classes: Pistols (4), SMGs (4), Shotguns (4), Rifles (4), LMGs (4), Snipers (4, including the AWP, which kills with one shot to the head or body), Knives (4) and Other (nail gun, crossbow, grenade launcher, piercing rail gun).
- **Grenades:** frag, flashbang, smoke, incendiary (smoke puts it out), proximity mine and decoy. Up to 4 carried (5 with Utility Belt). Plus kevlar and helmet.
- **Collection (Armory):** 18 weapon finishes and 11 outfits across 5 rarities. Finishes work on any gun and outfits on any operator, and other players see them. Earned as post-match drops (wins always drop).
- **Loadouts:** your purchases are saved. Press **F** to rebuy them, or **K** to toggle *Keep loadout* so they're re-equipped automatically every round or respawn.
- **Accounts:** sign-up with email confirmation, forgot/reset password, profiles, match history, XP levels, and leaderboards for ELO, kills, wins and level
- **Graphics:** Low / Medium / High / Ultra presets plus individual settings for resolution scale, shadows, MSAA/SMAA/FXAA, bloom, GTAO ambient occlusion, frame-rate cap, FOV and crosshair

## One-time Supabase setup

**1. Database:** SQL Editor → New query → paste all of `supabase/schema.sql` → **Run**. (Safe to re-run; re-run it after updates, e.g. to add the `inventory` column for the Armory.)

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

## Controls

| Action | Key |
|---|---|
| Move / jump / crouch / walk | WASD / Space / Ctrl or C / Shift |
| Fire / scope (sniper) / heavy stab (knife) | Left mouse / Right mouse |
| Reload | R |
| Weapons (primary / pistol / knife / grenades / charge) | 1 – 5, Q = last weapon, mouse wheel |
| Buy menu | B |
| Rebuy last loadout / toggle keep loadout | F / K |
| Plant / defuse | Hold E |
| Open / close door, resupply at ammo crate | E |
| Scoreboard | Tab |
| Chat (online) | Y or Enter |
| Pause / settings | Esc |

## How multiplayer works

There is no game server. The player who forms the match (the longest wait in the queue, or the lobby creator) becomes the **host**. The host runs the round logic, the economy, the bots and damage, and relays everything over Supabase Realtime broadcast channels. Each player simulates their own movement and hit detection, which favours the shooter.

Disconnects and reconnecting:
- If anyone drops, the match waits **10 seconds** for them. After that a bot plays for them, and they can return any time with **Reconnect** on the Play tab to take their player back.
- If the **host** drops for good, the remaining player with the lowest id takes over hosting automatically and the match continues.
- In ranked, a player who is gone for more than 10 seconds forfeits.

Limitations:
- Supabase's free tier caps realtime messages per second. 1v1 and 2v2 are well within it, but a full 10-human 5v5 is near the limit, so send rates automatically drop as more humans join.
- Results are reported by the clients, which is fine among friends but not cheat-proof.

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
