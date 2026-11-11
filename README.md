# John-Paul Simulator

A browser-based 3D tactical FPS. There is no build step: it is plain ES modules loaded straight from the folder, so it runs on GitHub Pages as-is.

- **Modes:** Ranked 1v1 (ELO), 1v1 Duel, 2v2 Wingman, 5v5 Bomb Defusal (full economy), Free For All
- **Online:** quick-match queues, custom lobbies with join codes, a lobby browser, an online-players list and in-match chat
- **Offline:** every mode against bots (Easy / Normal / Hard / Elite)
- **Maps:** Vault and Courtyard (small, for duels), Dustline and Harbor (large, with bomb sites)
- **Operators:** 8 preset characters plus a full character creator (skin, hair, face, headgear, build, height, clothing colours)
- **Weapons:** knife, 2 pistols, SMG, shotgun, 2 rifles, sniper (scoped), frag and smoke grenades, kevlar and helmet
- **Accounts:** sign-up with email confirmation, forgot/reset password, profiles, match history, XP levels, and leaderboards for ELO, kills, wins and level
- **Graphics:** Low / Medium / High / Ultra presets plus individual settings for resolution scale, shadows, MSAA/SMAA/FXAA, bloom, GTAO ambient occlusion, frame-rate cap, FOV and crosshair

## One-time Supabase setup

**1. Database:** SQL Editor → New query → paste all of `supabase/schema.sql` → **Run**.

**2. URLs:** Authentication → URL Configuration
- **Site URL:** `https://cksarge.github.io/John-Paul-Simulator/`
- **Redirect URLs:** add
  - `https://cksarge.github.io/John-Paul-Simulator/**`
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
- Cloudflare dashboard → Turnstile → your widget → **Hostnames**: add `cksarge.github.io` and `localhost`.
- Supabase → Authentication → Attack Protection → **Enable CAPTCHA protection** → provider **Turnstile** → paste the Turnstile **secret key**.
- The public site key is already in `js/config.js`.

Sign in, sign up, forgot password and resend-email all send a Turnstile token. Typing in a 6-digit code doesn't need one.

Confirmation links bring players back to the game already signed in. Reset links open `reset-password.html`, where they choose a new password. If a link has expired, both pages offer to send a new one.

The project URL and publishable key are in `js/config.js`.

## Run locally

```sh
python3 -m http.server 8765
# open http://localhost:8765
```

(ES modules don't work over `file://`, so the game has to be served over HTTP.)

## Deploy to GitHub Pages

The code lives at https://github.com/cksarge/John-Paul-Simulator. In the repo, go to **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**. The game will be live at **https://cksarge.github.io/John-Paul-Simulator/**, and every push to `main` redeploys it.

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
