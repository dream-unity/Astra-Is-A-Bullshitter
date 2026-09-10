# The Motion Thief

**An after-hours heist in a museum where movement can be stolen.**

Take the movement out of a bridge: it freezes exactly where it is. Give that movement to an empty floor: it becomes a ferry. Borrow a sculpture’s rise to make a lift. Move an entire security cage. Walk out with the tiny movement that keeps the museum alive, then give it to something that should be free.

This is a complete spatial puzzle game with native 3D rendering, seven museum chambers, an outside ending, mouse and keyboard controls, touch movement, procedural sound, undo, resets, hints, optional catalogue notes, and local progress saving.

## Publish and play

In **Settings → Pages**, select:

- **Source:** Deploy from a branch
- **Branch:** main
- **Folder:** / (root)

After GitHub publishes the repository, the game is available at:

**https://dream-unity.github.io/Astra-Is-A-Bullshitter/**

No build step, account, API key, external CDN, installation, or backend is needed. All code and artwork are included. `.nojekyll` keeps GitHub Pages delivery static.

## How to play

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Walk | WASD or arrow keys | Drag the on-screen stick |
| Take / give / exchange motion | Click an exhibit or its card; number keys 1–4 | Tap the exhibit or its card |
| Turn the view | Q / E or view buttons | View buttons |
| Zoom | + / − or mouse wheel | + / − buttons |
| Undo an exchange | Z | Undo |
| Reset this room | R | Reset room |
| Progressive hints | H | A little help |
| Pause | Escape | Pause button |
| Sound | M | Sound button |

There is **no jumping**. Platforms carry you. Board at the correct height, wait for your destination, and step off.

Orange exhibits contain motion. Still exhibits can receive motion. You have one hand: taking an occupied exhibit while already carrying a motion exchanges them. Every receiving exhibit has its own fixed track, so repeated stealing cannot move a track indefinitely. Hovering over a destination previews how your carried motion would move it.

Your last exchanges can be undone, including your position at the moment of the exchange. Falling or triggering an alarm returns you to the starting landing; your puzzle changes remain in place. Reset restores the entire chamber. There is no death counter penalty or game-over interruption.

## The chambers

1. **Please keep moving** — make an unreliable bridge stay useful.
2. **Heavy art** — a sculpture’s movement makes a better lift.
3. **A useful absence** — one theft creates both a landing and its elevator.
4. **Security ballet** — turn a scanner’s movement into public transport.
5. **The long way around** — borrow an orbit to cross a broken floor plan.
6. **Everything goes somewhere** — conserve several movements while making a still route.
7. **The curator’s cage** — open the cage without losing your way out.
8. **An unauthorized dawn** — finish the heist with a gift.

Each moving exhibit contributes a musical instrument. Stealing a movement removes its voice; giving it to another object changes the instrumentation. The final theft stops the museum and its score together.

White catalogue slips are optional. Collected slips and unlocked rooms are saved on this browser, and cannot be collected repeatedly to inflate the count. Continue restarts the saved room. Play still works when browser storage or audio is unavailable.

## Run locally

Serve this directory with a static HTTP server, for example:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. Because the game uses ES modules, use HTTP rather than opening `index.html` directly with `file://`.

## Verification

With Node.js 20 or newer:

```sh
node --test tests/heist.test.mjs
```

The nine dependency-free tests cover motion conservation, exact freeze positions, bounded tracks, transfers, undo, moving-platform support, catalogue persistence, prize access, recoverability, rendering coordinates, and the complete seven-chamber route followed by the final bird interaction. The route test uses actual walking, stealing, giving, and waiting, with no player teleportation. All seven rooms complete without falls or alarms on that route.

The renderer has a WebGL path with depth testing and directional lighting, and a Canvas 2D projection fallback. The automated renderer test exercises geometry generation, projection, and the software path across all eight scenes at wide and tall aspect ratios. It does not substitute for physical-device or browser visual testing; WebGL shader compilation is not covered by the Node suite.

## Source

- `engine.js`: movement, collision, platform support, conserved motions, inventory, undo, and progression.
- `levels.js`: all rooms, geometry, exhibit programs, notes, and graduated hints.
- `render.js`: native WebGL and software projection, architecture, character, interaction previews, and effects.
- `game.js`: interface, keyboard/mouse/touch controls, saves, camera controls, and game loop.
- `sound.js`: procedural instruments that follow the moving exhibits.
- `assets/motion-study.webp`: original artwork generated for this game.
- `tests/heist.test.mjs`: deterministic gameplay and rendering checks.

Created by Astra for Dream Unity. All runtime dependencies are included in this repository; there are no third-party JavaScript packages to download.
