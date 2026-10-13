# Emulator test checklist (manual, for the owner)

The automated suite (`npm run test:emulator`) proves that a ROM boots, renders, changes, takes a
keypress and is torn down again in Chrome, Edge and Firefox. It cannot tell you whether a game is
playable, whether the sound is right, or whether a save survives. This is the short list of things
only a person can check.

Do it once per game you intend to publish, and once after any change to `dist/player.mjs`,
`dist/emulator/` or `dist/player-config.json`.

## 1. Put your ROMs in the shelf

    D:\AI\Gameflex\test-roms\<system>\

One folder per system: `nes`, `snes`, `gb`, `gbc`, `gba`, `segaMD`, `segaMS`, `segaGG`, `sega32x`,
`psx`, `n64`, `nds`, `pce`, `atari2600`, `atari7800`, `arcade`. Accepted extension per folder is in
`test-roms\README.txt`, and a file the core does not accept is listed in the server banner and
skipped. The worktree's own `artifacts\roms\<system>\` is scanned too.

Files stay on your machine. This folder is ignored by git, and the shelf only exists while the dev
server below is running.

## 2. Run the dev server in shelf mode

    cd D:\AI\Gameflex\.worktrees\emulatorjs
    npm run dev:roms

Then open <http://127.0.0.1:4173>. The collection shows a **Test ROMs** row at the top; the plain
`npm run dev` never has one, and nothing from this shelf is in `dist/`.

Reload the page after adding or removing a file.

## 3. Per game, in the player

| Check | How | What good looks like |
|---|---|---|
| Start | Click the card, then **Start game** | The emulator boots the game; the toolbar status turns into the "Restart game" state and the game's own title or attract screen appears |
| Controls | Play for a minute | Movement, jump/fire and start all respond. Nothing sticks after key release |
| Gamepad | Plug in a controller, then press any button while the game is on screen | The stage hint "Controller? Press any button." disappears, and the pad plays the game. If it does not, press a button again and then click the game once: the browser only hands a pad to the page that has focus |
| Sound | Listen after the first keypress | Music and effects play, and the volume slider in the emulator's bottom bar changes it |
| Save state | Bottom-bar **Save State**, then **Load State** | The state loads back to where you were. Reload the page and it is still listed |
| Restart game | Toolbar **Restart game** | Audio restarts from the beginning, no second copy of the game overlaps the first |
| Fullscreen | Toolbar **Fullscreen** (or the emulator's own fullscreen button) | The stage fills the screen, Escape returns, the picture is not stretched oddly |
| Exit | **Back to games**, the Escape key, and browser Back | The player closes, audio stops immediately, the catalogue comes back and focus returns to the card you started from |
| Favourite | The heart in the toolbar | Still set after a reload (it lives in this browser's localStorage) |

### Default keys (Player 1)

Measured from the running emulator, not from the docs:

    Arrow keys   D-pad
    Z            A (the right-hand face button)
    X            B (the bottom face button)
    V            Select
    Enter        Start
    Q / E        L / R shoulder buttons

### Default pad buttons (Player 1)

Measured from the same runtime defaults, which are the standard gamepad layout (button indices as
the browser reports them):

    D-pad        D-pad buttons (up 12, down 13, left 14, right 15)
    A            button 0   (the bottom face button, cross/Xbox A)
    B            button 1   (the right face button, circle/Xbox B)
    Start        button 9
    Select       button 8
    L / R        buttons 4 / 5  (top shoulders)
    L2 / R2      buttons 6 / 7  (bottom shoulders)
    Sticks       buttons 10 / 11 click the sticks; the stick axes drive movement

A controller is assigned to **Player 1** automatically when the emulator starts, or as soon as it
is pressed. If it does not respond, click the game once and press a button again: browsers only
give a pad to the page that currently has focus.

Players can remap every button in the emulator's own bottom bar → **Controls** (next to the
on-screen gamepad, volume and shader menus); each control can take a key or a pad button, and the
mapping is saved per game in this browser's localStorage, so it survives a reload and does not
touch any other game.

Save state, load state, fast forward, rewind and the on-screen gamepad live in the emulator's own
bottom bar; the same bar has the volume, shader and control-remap menus. On a Game Boy game, A is
still `Z` and B is still `X` — the core's own button names are not the Game Boy's.

## 4. Published listings

The six listings the site publishes (`super-tilt-bro`, `tobu-tobu-girl`, `ucity`, `blind-jump`,
`zerosouls`, `240p-test-suite-snes`) are in `dist/`, so they can be checked without the shelf:

    npm run dev          # http://127.0.0.1:4173  — the ordinary server, no test shelf

Do the same table for each of them, then run:

    npm run check        # catalogue + emulator listing integrity
    npm run test:emulator

## 5. What counts as a failure

- A game that boots but never takes input: try the emulator's own bottom bar — if its buttons do
  nothing either, the frame has lost focus; if only the game ignores keys, note the core.
- A game that shows a blank or frozen screen: `npm run test:emulator` reports canvas colour count
  and frame change per ROM, so compare with its table.
- Audio that keeps playing after **Back to games**: that is a bug in the player's teardown, not in
  the game. Record the browser.
- A stop in the middle of a session: note the game, the browser and whether the toolbar status said
  anything. The frame's own panel (inside the stage) carries the emulator's error text.

## 6. Known limits

- Desktop Chrome, Edge and Firefox only. Mobile is not a target and is not tested.
- Gamepad support is verified in automation with a **simulated** standard-mapping pad (Chrome, Edge
  and Firefox, NES/SNES/GBA). That proves gameflex's own wiring — focus, the host page and the
  runtime's Player 1 slot. It cannot prove that a real browser exposes a real controller to the
  frame, and a pad that reports its D-pad as a hat axis instead of buttons is untested.
- The emulator needs WebGL2; a device without it gets an in-player explanation instead of a game.
- No BIOS file is shipped. Every core in the build starts without one, but a `psx`, `nds` or
  `segaCD` file that expects firmware may behave differently; test those by hand before publishing.
- Save states and SRAM (`.sav`, `.dsv`, `.srm`) live in this browser's IndexedDB, keyed per game id.
  Clearing site data clears them. Nothing is uploaded and there is no cloud save.
- The QA run says "booted and rendered". It never says a game is playable, and it never checks
  sound.
