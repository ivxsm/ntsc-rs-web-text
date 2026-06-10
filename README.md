# ntsc-rs (Web Edition)

This is an experimental, browser-based version of [ntsc-rs](https://github.com/ntsc-rs/ntsc-rs), a video effects application that simulates NTSC/VHS composite video signals. It runs entirely clientside in the browser using Preact and Vite.

This version is based on [valadaptive's ntsc-rs-web](https://github.com/ntsc-rs/ntsc-rs-web).

---

## Additional Features

This fork includes custom styling and overlay capabilities to personalize your VHS/NTSC video outputs:

- **Text Overlay (Text tab)**: Burn a custom title card/text directly into the video frames.
  - Features: Enable/disable toggle, custom text input, display duration, font size control, position alignment (center, top, or bottom), and six Thmanyah serif font options.
- **VHS Date Stamp (Date tab)**: Adds a retro-style VHS date overlay to the video.
  - Features: Enable/disable toggle, positioning (bottom-left or bottom-right), size slider, and custom date selector (defaults to current date).


## Getting Started

### Run Development Server

To run the application locally for development with hot module reloading:

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```
