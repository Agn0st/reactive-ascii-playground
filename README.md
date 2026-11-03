# Reactive ASCII

Interactive ASCII art on a grid that never moves.

**[▶ Open the live playground](https://agn0st.github.io/reactive-ascii-playground/demo/)** — drop in your own art and tune every parameter with sliders.

[Українською](README.uk.md) · MIT · no dependencies, no build step

---

Every cell keeps its position for good. What changes is where the cell *reads
from*: it draws the glyph it finds at a shifted spot in the source art. Features
stretch under the pointer and settle back, but no glyph ever travels — the grid
stays rigid while the image appears to flow.

On top of that: a random trail that lands mostly in empty cells, cycles through
characters and fades out, and an optional chromatic aberration pass on WebGL2.
Displacement is hard-capped, and old strokes decay every frame — so circling the
cursor forever never winds the deformation up.

## Quick start

**1.** Copy `reactive-ascii.js` and `chromatic.js` next to your page.

**2.** Add a canvas, your art, and the scripts:

```html
<canvas id="ascii" style="width:100%;height:520px;background:#1F2533"></canvas>
<pre id="ascii-art" hidden>
  your ASCII art here
</pre>

<script src="chromatic.js"></script>
<script src="reactive-ascii.js"></script>
<script>
  ReactiveAscii.create({ canvas: '#ascii', art: '#ascii-art' });
</script>
```

**3.** Set the canvas `background` to the same colour as whatever sits behind it.
The shader needs it to composite the split colour channels without darkening edges.

That is the whole integration. `chromatic.js` is optional — leave it out and the
deformation and trail still run on plain Canvas 2D.

### Without writing any JavaScript

```html
<canvas data-reactive-ascii data-art="#ascii-art" data-radius="100" data-trail="0.8"></canvas>
```

Any option below works as a `data-` attribute.

## Your own art

Anything monospace works — a converted photo, a logo, or a plain block of text.
Keep the line padding intact; trailing spaces are what hold the grid square.

The playground takes art three ways: paste it into the textarea, drop a `.txt`
file onto the canvas, or replace [`demo/samples/art.txt`](demo/samples/art.txt),
which is what it loads on startup. A plain-text sample sits beside it in
[`demo/samples/`](demo/samples).

Every slider and the palette live in the URL, so a look you like is a link you
can send — **Copy link** puts the current settings on your clipboard. The
**Copy code** button does the same for a ready-to-paste embed snippet.

## Options

| Option | Default | Meaning |
|---|---|---|
| `art` | — | String, array of lines, an element, or a `"#selector"` pointing at one |
| `canvas` | — | Element or selector. Required |
| `radius` | `80` | Pointer reach, px |
| `strength` | `0.7` | How hard the pointer pulls, `0..1` |
| `recovery` | `2000` | Time to settle back, ms |
| `memory` | `1200` | How fast old strokes are forgotten, ms |
| `limit` | `24` | Hard cap on displacement, px |
| `aberration` | `0.5` | RGB split, `0..1.5`. Needs `chromatic.js` + WebGL2 |
| `trail` | `0.6` | Trail density, `0..1`. `0` turns it off |
| `trailDuration` | `1800` | Trail lifetime, ms |
| `color` | `'#F6F4F1'` | Glyph colour |
| `background` | `'#1F2533'` | Must match what is behind the canvas |
| `glyphs` | ``'.:;-=+*#%@/\\!?01'`` | Characters the trail cycles through |
| `fontSize` | `12` | px at scale 1 |
| `cellWidth` / `cellHeight` | `7.2` / `12` | Cell metrics at scale 1 |
| `paddingX` / `paddingY` | `32` / `80` | Space kept free when fitting the art |
| `respectReducedMotion` | `true` | Honour `prefers-reduced-motion` |

The art is scaled to fit the canvas automatically; `fontSize` and the cell
metrics only set the proportions.

## API

```js
const portrait = ReactiveAscii.create({ canvas: '#ascii', art: myText });

portrait.set({ radius: 120, trail: 0.9 });  // live, no grid rebuild
portrait.setArt(otherText);                 // swap the art, rebuild the grid
portrait.play(2600);                        // scripted sweep, for a "show me" button
portrait.reset();                           // drop deformation, keep settings
portrait.destroy();                         // listeners, observer, animation frame

portrait.config;                   // current settings
portrait.dimensions;               // { rows, cols }
portrait.supported.webgl2;         // false → aberration unavailable
ReactiveAscii.defaults;            // the table above, as an object
```

## How it works

**The grid never moves.** Each cell stores its own position and an offset
`dx, dy`. On every frame it draws `sourceChar(ax - dx/cellWidth, ay - dy/cellHeight)`
— the glyph from a shifted spot in the original. Moving the *sampling point*
instead of the glyph is what keeps the grid rigid while the portrait stretches.

**Two-stage spring.** The pointer position is smoothed first, so there is
inertia; the delta of that smoothed position drives the pull. Cells chase their
target fast while they are "hot" (touched in the last 110 ms) and slowly
afterwards — a sharp yank, a soft return.

**Bounded by construction.** Displacement is clamped three times per frame, and
targets decay by `exp(-dt·3/memory)` unconditionally. Because the decay hits the
*target* that the pointer accumulates into, continuous motion cannot run away.

**The trail** is emitted during the drag, not during the draw. An empty cell is
18× more likely to receive a glyph than an occupied one, each deposit gets its
own randomised lifetime, and as its glyph fades the cell's original character
cross-fades back in — so the portrait returns rather than blinking.

**Aberration** samples red at `-ab`, green at centre, blue at `+ab` along the
local displacement direction, with five taps for a directional smear. The
displacement field reaches the shader as an RGBA texture, one texel per cell.

## Browser support

Modern browsers. WebGL2 is needed only for the aberration — without it the
slider is disabled and everything else works. `prefers-reduced-motion` holds the
effect still.

## Publishing your own copy

The repository root is the library; the playground lives in `demo/`.

1. **Settings → Pages → Deploy from a branch → `main` / `/ (root)` → Save.**
   Serving the root is what lets `demo/` reach `../reactive-ascii.js`.
2. Wait a minute, then open `https://<user>.github.io/<repo>/`. The root
   `index.html` redirects to the demo.
3. On the repository page, click the gear next to **About** and tick
   **Use your GitHub Pages website** — that puts the link in the right-hand column.

## Layout

```
reactive-ascii.js   the engine and the public API
chromatic.js        optional WebGL2 aberration pass
index.html          redirect to the demo, so the Pages root resolves
demo/               the playground: sliders, palettes, art loading, embed export
```

## Credits

The chromatic coverage sampling is adapted from [Agn0st/portfolio](https://github.com/Agn0st/portfolio),
`js/liquid-heading.js`.

## License

MIT — see [LICENSE](LICENSE).
