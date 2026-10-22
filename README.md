# ECDYSIS — Editorial Metamorphosis Laboratory (v2)

A revised independent website for the ECDYSIS speculative social-design project, with an eight-second introductory sequence, two unnumbered chapters (**ECDYSIS** and **MOLT**) and a native WebGL2 surface experiment. Inspired by the generous image scale, generous whitespace and clear editorial hierarchy at giordanobetti.com; this is an original implementation, not a copy of its code, assets, or exact design.

## Start locally in Visual Studio Code (Mac)

1. Unzip, then open the **ECDYSIS** folder in VS Code (the folder containing `package.json`).
2. Open **Terminal → New Terminal** and execute:

   ```bash
   npm run dev
   ```

3. Open **http://localhost:5173/** in Safari or Chrome. No `npm install` is required; Node.js 18+ is sufficient.
4. Save edited `.js`, `.html`, `.css` or stage image files with **Command+S**. The dev server broadcasts a full-page reload automatically. `sessionStorage` skips the intro on subsequent reloads within the same tab; use **REPLAY INTRO** to view it again.
5. Stop the server with **Control+C**. If that port is in use, `PORT=5180 npm run dev`.

## Drop these four PNGs in the exact location

```
ECDYSIS/
├── assets/
│   ├── cocoon7.png      ← original image: intro and website artwork
│   ├── cocoon7-ink.png  ← derived duotone artwork for cream backgrounds
│   ├── cocoon1.png      ← COCOON / 0%  (ADD THIS)
│   ├── cocoon2.png      ← HATCH / 33%  (ADD THIS)
│   ├── cocoon3.png      ← MOLT / 67%   (ADD THIS)
│   └── cocoon4.png      ← SPECIALIZE / 100% (ADD THIS)
├── index.html
├── styles.css
├── app.js
├── webgl.js
├── storage.js
├── dev-server.mjs
└── package.json
```

Until `cocoon1.png`–`cocoon4.png` exist, all four slots deliberately use `cocoon7.png` as a temporary specimen. To replace them permanently, save exact filenames in `ECDYSIS/assets`, and reload. Alternatively, press **REPLACE ↗** for any stage in the MOLT tab: browser uploads are saved locally in IndexedDB and take priority over assets in that browser. If you want to switch back to permanent files after experimenting with browser uploads, clear the site storage for localhost:5173 in browser settings, or use a fresh browser profile.

**Note**: The black background of the source image is masked in the shader and does not appear as a black rectangle on the parchment-colored webpage. The intro/web graphics use a duotone derivative of `cocoon7.png`, created only from the image supplied for this project.

## The actual 3D effect

The laboratory uses a native **WebGL2 183×137-vertex rectangular triangulated mesh**. Images drive the height of its vertices according to their sampled pixel intensity and opacity. Four textures are smoothly interpolated from 0% to 100%; the resulting raised field can be orbited with mouse/touch and zoomed with wheel/trackpad. SURFACE renders transparent textured geometry, WIREFRAME shows mesh-edge filaments, PARTICLES shows a 3D particle point cloud. Six visual parameters control relief, twist, noise, dispersion, scale and chromatic aberration. Automatic orbit and transformation playback are available; PNG exports include the current visual state.

**Important limitation:** One flat PNG cannot contain an object's unseen back and its exact depth. This is a real GPU height-field, not a full reconstructed photogrammetry/sculpted closed 3D object. For a full volumetric object, provide GLB/GLTF model(s) later.

The system is completely local and needs no API, cloud storage or accounts. Safari/Chrome with WebGL2 is required. If WebGL2 is blocked, a labeled 2D graphic-preview fallback remains functional (it is not the 3D engine). The website is responsive.

## Typeface

The default display font references the **Gothic Ultra OT** font installed locally on your Mac using `local('GothicUltraOT')` and alternate font family names. To install your licensed file: double-click the `.otf` file on your Mac and choose **Install Font** in Font Book, then reload the page. The font file itself is intentionally **not included in this ZIP**. If the installed font is unavailable, the fallback is Impact/Arial Black; body and Korean fallback fonts use system fonts. The main bold headings share the display typeface. The intro has dynamic width fitting after `document.fonts.ready` to prevent the right side of ECDYSIS from being clipped in Safari.

## Palette

Background: `#fffaee`, secondary background `#e8dec4`; primary lettering/ink `#72092a`; accent `#c7f9e4`; subdued secondary text uses a brown-neutral derived from the primary palette. No pure black section backgrounds.

## Implementation files

- `index.html`: two-tab editorial page, semantic structure, controls and intro
- `styles.css`: paper-toned art direction, mobile responsive, oversized fluid typography
- `app.js`: 8-second intro, routing, circular dial, stage mixing, uploads, play/replay, PNG export
- `webgl.js`: GPU image-driven 3D deformation/interaction and three visualization modes
- `storage.js`: local IndexedDB for uploaded images
- `dev-server.mjs`: zero-dependency local dev server with live reload on saved files

### Troubleshooting

- **No font:** Confirm `Gothic Ultra OT` appears in Font Book; then quit/reopen Safari.
- **No 3D:** Check that GPU acceleration/WebGL2 is available in the browser. Safari Settings > Advanced may contain relevant developer options.
- **Image not showing:** Check exact case-sensitive filename/path, e.g. `assets/cocoon3.png`. Black background is filtered out; very dark strokes can be dim.
- **Updates not visible:** Verify the terminal is still running `npm run dev`, ensure the file was saved, then reload once manually (`Command+R`).
- **Intro not showing after saving:** This is deliberate for fast development. Click **REPLAY INTRO** in the footer or open a new tab session.
- **Uploads override saved PNG files:** Clear the localhost site storage in browser settings.
