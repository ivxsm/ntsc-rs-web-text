# ntsc-rs-web

This is the (experimental) web version of [ntsc-rs](https://github.com/ntsc-rs/ntsc-rs). It uses Preact, and is built via Vite.

Based on [ntsc-rs-web](https://github.com/ntsc-rs/ntsc-rs-web).

## What I added

- **Text overlay** — custom title text burned into video frames (Text tab): enable/disable, text input, duration, font size, position (center/top/bottom), and six Thmanyah serif font choices
- **VHS date stamp** — retro date overlay (Date tab): enable/disable, bottom-left/right position, size slider, optional custom date (defaults to today)

Overlays are drawn in the effect worker via canvas after the NTSC pass (`src/util/effect-worker.worker.ts`).

## Building

To run a development server:

```
npm run dev
```


To build into `dist`:


```
npm run build
```
