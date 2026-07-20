# Book Page Text Renderer

## Goal

A small JavaScript tool that takes arbitrary user text (including
non-Latin scripts — Hebrew, Japanese, Greek, etc.) and exports a
high-resolution image of that text rendered as realistic ink on a
curved, textured book page, with user-controllable 3D positioning of
the output.

This doc is the starting brief for Claude Code (or a human) to pick up
in a fresh repo/Codespace. It describes the target architecture,
sequencing, and open decisions — not final code.

## Core pipeline

1. **Text layer (2D canvas)**
   - Render user-provided text to an offscreen `<canvas>`.
   - Must support RTL scripts (Hebrew: `ctx.direction = 'rtl'`) and
     scripts without space-based line breaking (Japanese: use
     `Intl.Segmenter` for line-wrapping, not `split(' ')`).
   - Load appropriate web fonts per script up front; fall back
     gracefully if a glyph isn't covered.
   - Apply slight blur + low-opacity noise to the text before
     compositing, so it doesn't read as crisp vector text pasted on
     paper.

2. **Paper layer**
   - Source a high-res paper texture (albedo) + its matching normal /
     height map from [cc0-textures.com](https://cc0-textures.com/).
   - Composite ink layer onto paper using `multiply` or `darken` blend
     mode as a first pass.

3. **Ink/paper realism pass**
   - Use the paper's normal map to add a subtle bump-lighting response
     so both the paper grain and the ink read as lit by the same
     light source.
   - Optional: light `screen`-mode highlight pass on paper high points
     at low opacity.
   - This can be done as a WebGL fragment shader (recommended) or
     faked with layered Canvas 2D composite operations.

4. **3D page curvature (the new piece)**
   - Use **Three.js / WebGL**, not WebGPU — this workload (one
     textured, displaced plane, a couple of shader passes) doesn't
     need WebGPU's compute advantage, and Three.js's ecosystem
     (loaders, normal-map helpers, post-processing) saves real time.
   - Subdivide a plane geometry (enough segments to bend smoothly,
     e.g. 64×64).
   - Vertex shader: displace along a shallow curve function (start
     with a simple sine/cosine bend across the horizontal axis;
     optionally add a secondary bend near the "spine" edge for a
     gutter-shadow effect).
   - Recompute normals after displacement so lighting responds
     correctly to the curve — this sells realism more than the curve
     shape itself.
   - Apply the composited paper+ink texture from steps 1–3 as the
     material map.

5. **User-controlled axis transform**
   - Expose position/rotation (x, y, z) as parameters on the mesh or
     camera.
   - This is just standard Three.js `object.position` /
     `object.rotation` — no new technique needed.

6. **Export**
   - Render to an offscreen canvas sized at the target export
     resolution (independent of on-screen preview resolution).
   - Export via `canvas.toBlob()` / `toDataURL()`.

## Suggested repo structure

```
/src
  textLayer.js       # canvas text rendering, multi-script handling
  paperTexture.js     # loading + compositing paper albedo/normal maps
  inkComposite.js     # blend modes / shader-based ink-on-paper pass
  pageGeometry.js      # plane subdivision + curvature displacement
  shaders/
    page.vert.glsl
    page.frag.glsl
  exporter.js          # offscreen render target + image export
  main.js              # wiring + UI controls
/assets
  textures/            # downloaded CC0 paper textures (albedo + normal)
/public
  index.html
PROJECT_BRIEF.md        # this file
README.md
```

## Suggested build order

1. Text layer with multi-script support, rendered flat to canvas —
   verify Hebrew/Japanese/Greek all render and wrap correctly first,
   before touching 3D.
2. Paper texture load + flat multiply-blend composite (2D only).
3. Move the composited flat texture onto a flat (non-curved) Three.js
   plane, confirm the axis transform (x/y/z) and export pipeline work
   end-to-end at high resolution.
4. Add curvature displacement to the plane + normal recalculation.
5. Add normal-map-driven lighting pass for ink/paper realism.
6. Polish: noise/blur tuning on text layer, gutter shadow, edge
   vignette, export resolution/quality options.

Doing it in this order means there's a working (flat) export early,
and curvature/lighting are added as refinements rather than
blocking the whole pipeline.

## Key open decisions for Claude to help think through

- **Curve function**: pure sine bend vs. a more book-like profile
  (flatter near the spine, more curved toward the outer edge)?
- **Font sourcing**: which specific web fonts per script, and how to
  handle a user typing a script with no loaded font available?
- **Texture set**: which specific CC0 paper texture(s) to start with,
  and whether to support hot-swapping between a few paper styles.
- **Performance target**: what export resolution is "high-res" for
  this use case (affects segment count, texture size, and whether
  render-to-texture happens in multiple passes)?
- **UI surface**: minimal (a few sliders + text box) vs. more full
  editor — out of scope for the core pipeline but worth deciding
  early since it affects how parameters are wired through.

## Non-goals (for now)

- WebGPU — not needed for this workload; revisit only if a future
  feature (e.g. batch-rendering many pages, particle-based paper
  fiber simulation) actually demands its compute model.
- Full book/spine binding simulation — just a single curved page.
- OCR-style text-to-handwriting variation — flat, single-style ink
  rendering only, for now.