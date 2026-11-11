# John-Paul Simulator

A browser-based 3D tactical FPS. There is no build step: it is plain ES modules loaded straight from the folder, so it runs on GitHub Pages as-is.

- **Modes:** Ranked 1v1 (ELO), 1v1 Duel, 2v2 Wingman, 5v5 Bomb Defusal (full economy), Free For All
- **Online:** quick-match queues, custom lobbies with join codes, a lobby browser, an online-players list and in-match chat
- **Offline:** every mode against bots (Easy / Normal / Hard / Elite)
- **Maps:** Vault and Courtyard (small, for duels), Dustline and Harbor (large, with bomb sites)
- **Operators:** 8 preset characters plus a full character creator (skin, hair, face, headgear, build, height, clothing colours)
- **Weapons:** knife, 2 pistols, SMG, shotgun, 2 rifles, sniper (scoped), frag and smoke grenades, kevlar and helmet
- **Accounts:** sign-up and sign-in, profiles, match history, XP levels, and leaderboards for ELO, kills, wins and level
- **Graphics:** Low / Medium / High / Ultra presets plus individual settings for resolution scale, shadows, MSAA/SMAA/FXAA, bloom, GTAO ambient occlusion, frame-rate cap, FOV and crosshair

## One-time Supabase setup

1. Supabase dashboard → **SQL Editor** → New query → paste all of `supabase/schema.sql` → **Run**.
2. **Authentication → Sign In / Providers → Email** → turn **off** "Confirm email". Supabase's built-in mailer only sends a few emails per hour, so leaving confirmation on will block friends from signing up.

The project URL and publishable key are in `js/config.js`.

## Run locally

```sh
python3 -m http.server 8765
# open http://localhost:8765
```

(ES modules don't work over `file://`, so the game has to be served over HTTP.)

## Deploy to GitHub Pages

```sh
git init && git add . && git commit -m "John-Paul Simulator"
git branch -M main
git remote add origin https://github.com/<you>/john-paul-simulator.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` / root**. The site will be at `https://<you>.github.io/john-paul-simulator/`.

## Controls

| Action | Key |
|---|---|
| Move / jump / crouch / walk | WASD / Space / Ctrl or C / Shift |
| Fire / scope (sniper) / heavy stab (knife) | Left mouse / Right mouse |
| Reload | R |
| Weapons (primary / pistol / knife / grenades / charge) | 1 – 5, Q = last weapon, mouse wheel |
| Buy menu | B |
| Plant / defuse | Hold E |
| Scoreboard | Tab |
| Chat (online) | Y or Enter |
| Pause / settings | Esc |

## How multiplayer works

There is no game server. The player who forms the match (the longest wait in the queue, or the lobby creator) becomes the **host**. The host runs the round logic, the economy, the bots and damage, and relays everything over Supabase Realtime broadcast channels. Each player simulates their own movement and hit detection, which favours the shooter.

Limitations:
- If the host leaves, the match ends. In ranked, the remaining player is credited with the win.
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
