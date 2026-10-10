# dos.zone mainstream DOS batch — selection

Research only. No assistant review, no user review, nothing published. Generated 2026-10-10 from page probes in `artifacts/research/dos-zone/`.

## Scope and method

- Source: dos.zone public `sitemap.xml` (2,530 URLs, saved locally) for exact slugs; each candidate page then fetched directly over HTTPS with a desktop UA, saving body + headers.
- Selection rule: mainstream ORIGINAL releases from the requested list, preferring base-game listings. Excluded: mods, forks, fan remakes, expansions, compilation bundles, duplicates and anything whose page exposes no playable bundle.
- Kept: **23** entries. Excluded with reasons: 4.

## Verification limits (read before using anything here)

- No gameplay was executed. Every entry is verified only as 'a live dos.zone launch page exposing a js-dos bundle reference'. HTTP 200 alone was never treated as proof of gameplay, and one HTTP 200 page (Grand Theft Auto 1997) was rejected precisely because it exposed no bundle.
- No assistant review and no user review is recorded in this file. Discovery/research is not approval.
- No permission to host, stream, frame or monetise these destinations is asserted. The pages' own CSP frame-ancestors headers restrict framing to dos.zone-owned origins, which is evidence AGAINST naive iframe embedding in Gameflex, not for it.
- CSP/X-Frame-Options observations were read from the saved response headers only; no browser rendering test was performed.

## What "browserEvidence" means per entry

Each page declares a live js-dos host (`<div class="jsdos" data-url="...">`) pointing at a `.jsdos` bundle on cdn.dos.zone. That is launch-UI/bundle markup — it shows the site intends to run a specific bundle. It is **not** a playthrough, not a boot test, and not proof the game starts on your machine.

Common blocker for all entries: `Content-Security-Policy: frame-ancestors` allows only dos.zone, cdn.dos.zone, br.cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com. A Gameflex iframe is not in that allowlist.

## Entries

### 1. DOOM

- id: `doom-dec-1993`
- url: https://dos.zone/doom-dec-1993/
- genre / category: First-person shooter / shooters
- release: The 1993 id Software original (slugs/dated title 'DOOM', page slug encodes Dec 1993).
- requirements: Desktop browser with keyboard and mouse; page also advertises a multiplayer play-online door.
- bundle: `https://cdn.dos.zone/custom/dos/doom.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/doom_1.jpg/fe8f7f08ddbeced41a847eca0dcd5bbf.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle is a generic doom.jsdos with no edition marker; whether the hosted build is shareware or the full registered release is unverified.
  - Page advertises an online multiplayer door; netplay was not exercised and support for this specific game is not established by that link.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 2. DOOM II

- id: `doom-ii-oct-10-1994`
- url: https://dos.zone/doom-ii-oct-10-1994/
- genre / category: First-person shooter / shooters
- release: The 1994 DOOM II original (page slug encodes the 10 Oct 1994 release).
- requirements: Desktop browser with keyboard and mouse.
- bundle: `https://cdn.dos.zone/custom/dos/doom2.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/doom2.jpeg/e546567e4cca83c26e4af8b8b8970033.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - doom2.jsdos carries no edition marker; full vs shareware content is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 3. Wolfenstein 3D

- id: `wolfenstein-3d-may-05-1992`
- url: https://dos.zone/wolfenstein-3d-may-05-1992/
- genre / category: First-person shooter / shooters
- release: The 1992 id Software original that defined the genre (page slug encodes 5 May 1992).
- requirements: Desktop browser with keyboard and mouse.
- bundle: `https://cdn.dos.zone/original/2X/a/ac888d1660aa253f0ed53bd6c962c894125aaa19.jsdos`
- images: https://dos.zone/images/http/original/2X/1/1900b5b2f48afe5106dc418de7729743ff8f7de8.png/20cafafbaa288a0d48e5995ed7575563.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - The NOYB/site build's episode content (shareware 3-episode vs full 6-episode) is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 4. Duke Nukem 3D

- id: `duke-nukem-3d-1996`
- url: https://dos.zone/duke-nukem-3d-1996/
- genre / category: First-person shooter / shooters
- release: The 1996 3D Realms original (page slug encodes the 1996 release).
- requirements: Desktop browser with keyboard and mouse.
- bundle: `https://cdn.dos.zone/custom/dos/duke3d_320.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/duke3d.jpeg/7f62c2a0b202567e14b2e561a6e9c379.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle is duke3d_320.jsdos; the '320' build suggests a specific/widescreen repack and the shareware-vs-retail question is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 5. Prince of Persia

- id: `prince-of-persia-1990`
- url: https://dos.zone/prince-of-persia-1990/
- genre / category: Cinematic platformer / adventure
- release: The 1990 Broderbund original (page slug encodes 1990).
- requirements: Desktop browser; keyboard required, joystick not evidenced.
- bundle: `https://cdn.dos.zone/custom/crafted/princeofpersiaorigin.jsdos`
- images: https://dos.zone/images/http/original/2X/9/9c5f757776e4e9891e063c3e935889ec857dce92.jpeg/66435bae6f294c35ad3c7de8a48f90cf.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle path is custom/crafted/princeofpersiaorigin.jsdos — an 'origin'-marked build; that labelling is site-internal and its meaning is not verified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 6. Civilization

- id: `civilization`
- url: https://dos.zone/civilization/
- genre / category: Turn-based strategy / strategy
- release: The original Sid Meier's Civilization (1991), base listing on dos.zone under the bare 'civilization' slug.
- requirements: Desktop browser with mouse; keyboard for menus.
- bundle: `https://br.cdn.dos.zone/published/br.jzcdse.Civilization.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/jzcdse.maxresdefault%20%281%29.jpg/afe21ec39c289ccf99555634992d5dc5.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Page title is just 'Civilization' with no year; that this is Civilization I (1991) rather than a later build is inferred from the base slug, not confirmed by page markup.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 7. WarCraft: Orcs & Humans

- id: `warcraft-orcs-humans`
- url: https://dos.zone/warcraft-orcs-humans/
- genre / category: Real-time strategy / strategy
- release: The 1994 Blizzard original, shipped as the page's 'Warcraft: Orcs & Humans' base listing (the site also lists Warcraft II/III separately, which are later and out of scope here).
- requirements: Desktop browser with mouse and keyboard.
- bundle: `https://cdn.dos.zone/custom/dos/warcraft.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/warcraft.jpeg/44c89448a87fc6a886be0dc8982b0b34.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Page advertises a multiplayer door; RTS netplay was not exercised.
  - DOS release shipped on two discs (human/orc); which disc set the bundle contains is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 8. Settlers 2

- id: `settlers2`
- url: https://dos.zone/settlers2/
- genre / category: City-building / real-time strategy / strategy
- release: The Settlers II (1996), base listing 'Settlers 2'. The site also lists Settlers 3, which is a later game and excluded here.
- requirements: Desktop browser with mouse. Bundle runs on the dosboxX backend.
- bundle: `https://br.cdn.dos.zone/published/br.weyfqq.Settles2eng.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/weyfqq.2870x2158_E8Xf_J.jpg/7fd46eda7610d8b77617ae15592f56d2.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle is br.weyfqq.Settles2eng.jsdos (English build); the game historically shipped as a Gold/expansion edition too, and which content the bundle holds is unverified.
  - Site slug/title ('Settlers 2') does not disambiguate the original 1996 release from a later rebuild.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 9. Command & Conquer

- id: `command-conquer-sep-26-1995`
- url: https://dos.zone/command-conquer-sep-26-1995/
- genre / category: Real-time strategy / strategy
- release: The 1995 Westwood original (page slug encodes the 26 Sep 1995 release). Red Alert is listed separately and is excluded as a different game.
- requirements: Desktop browser with mouse and keyboard. Bundle runs on the dosboxX backend.
- bundle: `https://cdn.dos.zone/custom/dos/cc_gdi_novid.jsdos`
- images: https://dos.zone/images/http/original/2X/a/ae3116154ac2b9725465dc1fe59fa39507886432.png/7bf1bed5bf22f0a6ecc8c7fb43d74591.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle is cc_gdi_novid.jsdos: the 'gdi' and 'novid' markers imply a GDI-only, video-stripped build rather than the full retail release.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 10. Sim City

- id: `sim-city-1989`
- url: https://dos.zone/sim-city-1989/
- genre / category: City-building simulation / simulation
- release: The 1989 Maxis original DOS release (page slug encodes 1989). SimCity 2000 and 3000 are listed separately and are excluded as later games.
- requirements: Desktop browser with mouse.
- bundle: `https://cdn.dos.zone/original/2X/7/744842062905f72648a4d492ccc2526d039b3702.jsdos`
- images: https://dos.zone/images/http/original/2X/6/692603ba9ff06c30e6d1c4bf736b3edbdfa1be77.jpeg/106971474bf48d4e02bf2dd88f2e2147.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle is a raw cdn.dos.zone/original object with no edition/version marker.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 11. Lemmings

- id: `lemmings-1991`
- url: https://dos.zone/lemmings-1991/
- genre / category: Puzzle / puzzle
- release: The 1991 DMA Design/Psygnosis original (page slug encodes 1991). The site lists Oh No! More Lemmings, Xmas Lemmings and expansions separately; they are excluded as expansions/derivatives.
- requirements: Desktop browser with mouse.
- bundle: `https://cdn.dos.zone/custom/dos/lemmings.jsdos`
- images: https://dos.zone/images/containers/assets/seo_image.jpg/305f8ab86e22fdd50cb3762298d95219.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Page og:image is the generic dos.zone seo_image placeholder, so no unique cover art was captured from the page.
  - Whether the bundle is the original 1991 release or a later repack (e.g. the 1992 'Oh No!' content folded in) is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 12. Jazz Jackrabbit

- id: `jazz-jackrabbit`
- url: https://dos.zone/jazz-jackrabbit/
- genre / category: Platformer / adventure
- release: The 1994 Epic MegaGames original. Jazz Jackrabbit 2 is listed separately and excluded as a later game.
- requirements: Desktop browser with keyboard; mouse optional.
- bundle: `https://br.cdn.dos.zone/published/br.kzhuta.Jazz.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/kzhuta.Jazz_Jackrabbit.webp/76cd29146d14b47c975c815348669c43.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Whether the bundle is the shareware episode or the full retail six-episode release is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 13. Commander Keen in Goodbye, Galaxy!: Episode IV - Secret of the Oracle

- id: `commander-keen4`
- url: https://dos.zone/commander-keen4/
- genre / category: Platformer / adventure
- release: Commander Keen Episode IV: Secret of the Oracle (1991), the first Goodbye Galaxy episode. Chosen over the site's 'Commander Keen 1-3' listing, which is a compilation bundle and therefore excluded.
- requirements: Desktop browser with keyboard.
- bundle: `https://br.cdn.dos.zone/published/br.nctois.KEEN4.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/nctois.maxresdefault%20%287%29.jpg/7a11404d31545974eef3663c1e90e42f.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Site slug (commander-keen4) and page title disagree in form; the title shown here is taken verbatim from the page <title>.
  - Commander Keen episode 1 (Marooned on Mars) has no dedicated listing in the public sitemap.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 14. Descent

- id: `descent`
- url: https://dos.zone/descent/
- genre / category: First-person shooter / shooters
- release: The 1995 Parallax/Interplay original, base listing 'Descent'.
- requirements: Desktop browser with keyboard and mouse (six-degrees-of-freedom controls).
- bundle: `https://br.cdn.dos.zone/published/br.rjrdlj.bundle.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/rjrdlj.descent-03.webp/db8244f8a5f05c500d7c8b12b8994904.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle path is a generic bundle.jsdos (published/br.rjrdlj.bundle.jsdos) with no game-name or edition marker.
  - Whether the bundle is the full retail release or the shareware first episode is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 15. Fallout: A Post Nuclear Role Playing Game

- id: `fallout`
- url: https://dos.zone/fallout/
- genre / category: Post-apocalyptic RPG / adventure
- release: The 1997 Interplay original (full title taken verbatim from the page). The site's separate 'fallout-1991' listing is inconsistent with the 1997 release and is excluded as uncertain.
- requirements: Desktop browser with mouse and keyboard. Bundle runs on the dosbox backend. First play downloads the dos.zone bundle from the CDN.
- bundle: `https://br.cdn.dos.zone/published/br.wrusmz.FalloutEng.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/wrusmz.capsule_616x353.jpg/de3a88ca3fe26543e4dc4177b24ec6fd.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - The 1997 original was a Windows 95/DOS hybrid; how the hosted DOS bundle handles that is unverified.
  - OpenGMK/community rebuild provenance for the hosted build is not stated on the page.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 16. Heroes Of Might And Magic II

- id: `heroes-of-might-and-magic-ii`
- url: https://dos.zone/heroes-of-might-and-magic-ii/
- genre / category: Turn-based strategy / strategy
- release: Heroes of Might and Magic II (1996). The site's separate 'heroes-1998' listing is a later title and is excluded.
- requirements: Desktop browser with mouse and keyboard.
- bundle: `https://cdn.dos.zone/custom/dos/homm_2.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/homm2.jpeg/c172e13628a691e93197006a22a9fa11.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Whether the bundle is the base game or the Price of Loyalty expansion content is unverified.
  - Page title capitalises 'Of/And' oddly; the title here is taken verbatim from the page.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 17. Worms

- id: `worms-1995`
- url: https://dos.zone/worms-1995/
- genre / category: Artillery / turn-based tactics / strategy
- release: The 1995 Team17 original, base listing 'Worms' (page slug encodes 1995). Worms Reinforcements and Worms De Luxe are listed separately and excluded as expansions/bundles.
- requirements: Desktop browser with mouse and keyboard. Bundle runs on the dosboxX backend.
- bundle: `https://br.cdn.dos.zone/published/br.sjsozr.Worms1995.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/sjsozr.worms-die-serie_2347160.jpg/5def808f04d368965421758c63d9d905.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle is br.sjsozr.Worms1995.jsdos; the site also lists 'worms-de-luxe-1994', so which content the base bundle holds is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 18. The Need for Speed

- id: `the-need-for-speed-sep-1995`
- url: https://dos.zone/the-need-for-speed-sep-1995/
- genre / category: Racing / sports
- release: The 1995 Electronic Arts original DOS release (page slug encodes Sep 1995). The site's 'need-for-speed-se' Special Edition is listed separately and excluded as a later variant.
- requirements: Desktop browser with keyboard; historically long a hot-seat/multiplayer racer, control scheme here unverified.
- bundle: `https://cdn.dos.zone/custom/dos/nfs.jsdos`
- images: https://dos.zone/images/http/original/2X/e/e5f62e0da3b896347644ea61bc775071ad01328f.png/ad5d20918505aac4f25908dacaec5c66.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle is a generic custom/dos/nfs.jsdos with no edition marker.
  - The 1995 original had cut-down content versus the 3DO version; which build is hosted is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 19. Mortal Kombat

- id: `mortal-kombat-1993`
- url: https://dos.zone/mortal-kombat-1993/
- genre / category: Fighting / adventure
- release: The 1993 Midway/Acclaim DOS original (page slug encodes 1993). Mortal Kombat 2/3/4/Trilogy are listed separately and excluded as later games.
- requirements: Desktop browser with keyboard; two-player controls not evidenced.
- bundle: `https://cdn.dos.zone/original/2X/8/872f3668c36085d0b1ace46872145285364ee628.jsdos`
- images: https://dos.zone/images/http/original/2X/f/f4bd80dab1d49862de267821752418a438ee30ef.png/812d09ebf3b251434b720cbfd8b4d5b6.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle is served from cdn.dos.zone/original/2X/... with no edition marker.
  - The DOS port's blood/content censorship options versus the arcade original are unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 20. Street Fighter 2

- id: `street-fighter-2`
- url: https://dos.zone/street-fighter-2/
- genre / category: Fighting / adventure
- release: The DOS release of Street Fighter II (base listing 'Street Fighter 2').
- requirements: Desktop browser with keyboard; two-player controls not evidenced.
- bundle: `https://br.cdn.dos.zone/published/br.fxttmi.Street-Fighter-2.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/fxttmi.street-fighter-ii_2.webp/87242456717269a799a3a991aa52000e.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Page gives no year or subtitle, so whether this is the original Street Fighter II or a later revision (Champion/Turbo Edition) is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 21. Dune II: The Building of a Dynasty (DOS)

- id: `dune-2-dos-1992`
- url: https://dos.zone/dune-2-dos-1992/
- genre / category: Real-time strategy / strategy
- release: The 1992 Westwood original that founded the RTS genre (page slug encodes 1992). Chosen over the site's separate 'dune-ii-the-building-of-a-dynasty-dec-1992' listing, which is titled '(Open Dune)' — a fan remake with no js-dos host block — and is excluded.
- requirements: Desktop browser with mouse and keyboard.
- bundle: `https://br.cdn.dos.zone/published/br.xpvdnk.dune2.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/xpvdnk.dune-ii-the-battle-for-arrakis-pc_1370612645.jpg/5b50e167c7122679d0c328134d3107ee.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Two near-identical Dune II listings exist on dos.zone; the '(Open Dune)' one was rejected because it carries a fan-remake label and exposes no emulator bundle.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 22. Theme Hospital

- id: `theme-hospital`
- url: https://dos.zone/theme-hospital/
- genre / category: Business / management simulation / simulation
- release: The 1997 Bullfrog original (base listing 'Theme Hospital').
- requirements: Desktop browser with mouse. Bundle runs on the dosboxX backend.
- bundle: `https://br.cdn.dos.zone/published/br.xmnogq.ThemHosEng.jsdos`
- images: https://dos.zone/images/containers/assets/backgrounds/syefrp.5g5eayf1.jpg/7b369f5a1a5e9f00063cae4a29c50095.webp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - Bundle is br.xmnogq.ThemHosEng.jsdos (English build); no edition/version marker beyond the language.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

### 23. RollerCoaster Tycoon Deluxe

- id: `rollercoaster-tycoon-deluxe`
- url: https://dos.zone/rollercoaster-tycoon-deluxe/
- genre / category: Construction / management simulation / simulation
- release: RollerCoaster Tycoon, listed only as the Deluxe edition (page title taken verbatim).
- requirements: Desktop browser with mouse. Bundle runs on the dosbox backend.
- bundle: `https://br.cdn.dos.zone/published/br.dshosk.RCTdeluxe.jsdos`
- images: https://dos.zone/assets/backgrounds/dshosk.61e8d27549c0f5260192ca9d42330b31.bmp, https://cdn.dos.zone/3dfx.png, https://cdn.dos.zone/mp/hubicon_2.png
- issues:
  - EDITION CAVEAT: dos.zone publishes no plain RollerCoaster Tycoon listing in its public sitemap, so the only route to this requested title is the Deluxe edition, which bundles the two expansion packs and is therefore not a pure base-game listing. Included only with this flag; drop it if a strict base-only rule is applied.
  - The 1999 original was a Windows title; the hosted dosbox bundle's provenance and whether it is a community DOS adaptation is unverified.
  - Embedding in the Gameflex player is not permitted by the page's own CSP: frame-ancestors allowlists dos.zone, cdn.dos.zone, sec.dos.zone, test.js-dos.com and discord.com only, so a Gameflex iframe would be blocked. Not inferring any hosting/streaming permission from this or from absent X-Frame-Options.
  - Playability is NOT verified: only the launch page and its bundle reference were observed. The js-dos emulator was never booted and no gameplay, input or save behaviour was tested. HTTP 200 does not prove the game runs.
  - Third-party emulation host (dos.zone, js-dos/dosbox). Distribution rights and the hosted build's provenance are unverified; dos.zone publishes a DMCA page but that does not establish permission.
  - Exact edition/build hosted (shareware vs full, regions, bundled content) is not established by the page markup and is marked unverified.
  - Bundle is fetched from cdn.dos.zone / br.cdn.dos.zone at play time, so first launch depends on that CDN and on host CPU for emulation performance.

## Excluded candidates

- **Grand Theft Auto (1997)** — https://dos.zone/grand-theft-auto-1997/  
  HTTP 200 but the response is a ~22 KB stub with no <div class="jsdos"> host block and no bundle reference. All five GTA/2/Vice City/London/3Dfx listings behave identically, i.e. no playable bundle is exposed. Excluded as an uncertain/non-playable entry.
- **Dune II ... (Open Dune)** — https://dos.zone/dune-ii-the-building-of-a-dynasty-dec-1992/  
  Page title labels the build '(Open Dune)' — a fan remake/open-source reimplementation — and the page has no js-dos host block. Excluded as a fan remake (the original DOS build is filed under dune-2-dos-1992).
- **Commander Keen 1-3** — https://dos.zone/commander-keen-1-3-1992/  
  Compilation bundle of three episodes; excluded in favour of the single-episode base listing (commander-keen4).
- **Fallout (1991)** — https://dos.zone/fallout-1991/  
  Date conflicts with the 1997 original and the listing duplicates the main Fallout page; excluded as an uncertain/duplicate entry.

## Not covered

- No Trello, Git, dist/ or publication changes were made. `dist/games.json` untouched.
- dos.zone is a third-party emulation host; rights and provenance of every hosted build remain unverified. Nothing here is an endorsement or a hosting/monetisation claim.
