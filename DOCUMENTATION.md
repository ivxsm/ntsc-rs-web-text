# ntsc-rs-web

**Live at [web.ntsc.rs](https://web.ntsc.rs)**

A web-based (Preact/Vite) client for [ntsc-rs](https://github.com/ntsc-rs/ntsc-rs) — applies realistic VHS and analog TV effects to videos and images entirely in the browser. No uploads needed; all processing happens client-side via WASM.

## Architecture

```
ntsc-rs-web/
├── src/                      # Preact frontend (TypeScript)
│   ├── app-state.ts          # Global state (signals-based)
│   ├── index.tsx             # Entry point
│   ├── components/           # UI components
│   │   ├── App/              # Root app component
│   │   ├── VideoPlayer/      # Video preview + playback
│   │   ├── SettingsList/     # Effect parameter controls
│   │   ├── PresetManager/    # OPFS-based preset save/load
│   │   ├── TabbedPanel/      # Tabbed settings panes
│   │   ├── Widgets/          # Reusable UI widgets (sliders, spinboxes, etc.)
│   │   ├── Overlay/          # Overlay/modal system
│   │   ├── Modal/            # Generic modal
│   │   ├── Toast/            # Toast notifications
│   │   ├── Loader/           # Loading screen
│   │   ├── Icon/             # SVG icon component
│   │   ├── PanicModal/       # WASM panic error display
│   │   ├── AboutModal/       # About dialog
│   │   ├── CreditsModal/     # License credits
│   │   ├── DisclaimerModal/  # First-load disclaimer
│   │   ├── PwaUpdatePrompt/  # PWA update notification
│   │   ├── RenderSettingsPane/ # Render output settings
│   │   └── ResizablePanel/   # Draggable panel dividers
│   ├── util/                 # Utilities & worker code
│   │   ├── effect-worker-pool.ts  # WASM worker pool
│   │   ├── effect-worker.worker.ts # Per-frame WASM processing
│   │   ├── render-job.ts     # Render job lifecycle
│   │   ├── ntsc-rs-module.ts # WASM module bootstrap
│   │   ├── opfs-render-jobs.ts # OPFS render job persistence
│   │   ├── media-player.ts   # Abstracted media playback
│   │   ├── still-image-media.ts # Still-image input handling
│   │   ├── undoer.ts         # Settings undo/redo engine
│   │   ├── worker-rpc.ts     # RPC layer for workers
│   │   ├── queue.ts          # Async queue
│   │   ├── save-to-file.ts   # File save/download helpers
│   │   ├── signalize-fs.ts   # Reactive OPFS directory wrapper
│   │   ├── floating.ts       # Floating UI positioning
│   │   ├── aac-codec.ts      # AAC encoder polyfill (Chrome)
│   │   ├── encode-png.ts     # PNG frame export
│   │   └── ...               # misc helpers
│   ├── css/                  # Global styles
│   └── assets/               # Fonts, icons
├── ntsc-rs-web-wrapper/      # Rust WASM crate
│   ├── src/                  # Rust source (wasm-bindgen bindings)
│   ├── generated/            # Generated TypeScript bindings
│   ├── Cargo.toml            # Rust dependencies (ntsc-rs, fast_image_resize, etc.)
│   └── build.sh              # WASM build script
├── aac-codec/                # ffmpeg-wasm AAC encoder polyfill
│   ├── FFmpeg/               # FFmpeg submodule (LGPL)
│   └── build.sh              # Emscripten build
├── vite.config.ts            # Vite config (WASM, PWA, COOP/COEP, license merge)
├── package.json
└── todo.md
```

### Key Technologies

- **Frontend**: Preact 10 + `@preact/signals` for reactive state
- **Build**: Vite 7 with `vite-plugin-wasm`, `vite-plugin-pwa`, `@preact/preset-vite`
- **WASM core**: Rust crate `ntsc-rs-web-wrapper` compiled via `wasm-bindgen`; links to [`ntsc-rs`](https://github.com/ntsc-rs/ntsc-rs) for the actual effect processing
- **AAC polyfill**: Custom Emscripten build of FFmpeg's AAC encoder (needed for Chrome, which doesn't support AAC encoding natively in `MediaRecorder`)
- **Media parsing**: [mediabunny](https://github.com/valadaptive/mediabunny) for demuxing
- **PWA**: Fully offline-capable via service worker + workbox
- **License management**: Auto-merges JS (Vite) and Rust (cargo-about) licenses at build time

## Current State

The app is functional and deployed. Key status:

### ✅ Implemented
- VHS/analog TV effect rendering on video and still-image input via WASM
- Video playback with realtime effect preview (full, disabled, or split-screen)
- Render jobs: export processed video with configurable codec/bitrate
- Still-image input with configurable framerate and duration
- OPFS-based preset manager (save/load/delete presets)
- OPFS-based render job storage with save-to-disk
- Undo/redo for effect settings
- Drag-and-drop preset loading
- Settings persistence across sessions (localStorage)
- Responsive / portrait mode support
- PWA with offline support
- WASM panic handling with error display
- AAC encoder polyfill for Chrome
- Split WASM builds (with/without relaxed SIMD for Safari compatibility)
- "Copy frame" and "Save frame" buttons
- License credits modal

### 🚧 Known Issues & Incomplete
- **Documentation** (this file is a start, but no thorough user docs)
- **EXIF rotation**: Applied during processing, but incorrect dimensions shown and "Resize to" doesn't account for logical rotation
- **iPhone .mov files**: `getSample` returns null intermittently (upstream mediabunny bug); negative audio timestamps patched
- **Variable framerate** not supported
- **No Safari testing** confirmed
- **Firefox on Android**: may not decode/encode anything — no warning displayed
- **No image-sequence output** in Chrome (needs directory picker support)
- No FFV1 via WASM
- No tooltip/inline help component
- No keyboard shortcuts
- No pinch-to-zoom
- No render completion notification
- Non-square pixel aspect ratio not handled

## Development

```sh
npm run dev      # Start dev server (with COOP/COEP headers)
npm run build    # Production build into dist/
npm run preview  # Preview production build
npm run lint     # ESLint
```

The WASM crate must be built separately (via Docker) before `npm run build` — see `ntsc-rs-web-wrapper/build.sh`. The AAC polyfill also needs a Docker build (see `aac-codec/README.md`).

## CI/CD

GitHub Actions builds and deploys to GitHub Pages on pushes to `main`. The workflow:
1. Checks out submodules (FFmpeg)
2. Builds the WASM crate via Docker (with caching)
3. Runs `vite build`
4. Deploys to `gh-pages` branch with custom domain `web.ntsc.rs`
