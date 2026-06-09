# Tomorrow's Implementation Plan

## Part 1: Rename "Title" tab to "Text"

**File:** `src/components/App/App.tsx`
- Change `title: 'Title'` to `title: 'Text'`

---

## Part 2: VHS Date/Time Overlay

### New State (`src/app-state.ts`)

Add to `TextOverlayPosition` type or create new types:

```ts
export type DateTimeMode = 'both' | 'date-only' | 'time-only' | 'none';
export type DateTimePosition = 'bottom-right' | 'bottom-left';
```

New signals in `AppState` class:

| Signal | Type | Default | Description |
|--------|------|---------|-------------|
| `vhsDateTimeEnabled` | `boolean` | `false` | Master toggle for the date/time overlay |
| `vhsDateTimeMode` | `DateTimeMode` | `'both'` | What to show: both, date only, time only |
| `vhsDateTimePosition` | `DateTimePosition` | `'bottom-right'` | Corner position |

Add to:
- `SavedState` type
- Constructor initialization
- Persistence (throttled save)
- `loadState()` keys
- `addRenderJob()` effectSettings object

### Font Setup

**Copy font:** already done (`src/assets/fonts/VCR_OSD_MONO_1.001.ttf`)

**CSS** (`src/css/fonts.css`):
```css
@font-face {
  font-display: swap;
  font-family: 'VCR OSD Mono';
  font-style: normal;
  font-weight: 400;
  src: url('../assets/fonts/VCR_OSD_MONO_1.001.ttf') format('truetype');
}
```

**Worker** (`src/util/effect-worker.worker.ts`):
- Import the font URL: `import vcrFontUrl from '../assets/fonts/VCR_OSD_MONO_1.001.ttf';`
- Register it in init: `new FontFace('VCR OSD Mono', \`url(${vcrFontUrl})\`)`
- Add to font registration loop

### Pipeline Types

**`PipelineSettings`** (`src/util/media-player.ts`):
```ts
vhsDateTimeEnabled: boolean;
vhsDateTimeMode: DateTimeMode;
vhsDateTimePosition: DateTimePosition;
```

**`RenderFrameSettings`** (`src/util/effect-worker-pool.ts`) — same fields (auto-spread)

**`RenderFrame`** (`src/util/effect-worker.worker.ts`) — same fields (need type defs)

### Worker Rendering (`src/util/effect-worker.worker.ts`)

In the `renderFrame` function, after the existing title overlay block and before the `switch (format)`:

```ts
if (vhsDateTimeEnabled && vhsDateTimeMode !== 'none') {
  // Generate date/time string from current time
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).replace(/\//g, '-'); // DD-MM-YYYY
  
  const timeStr = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }); // HH:MM:SS
  
  // Pick what to draw
  const lines: string[] = [];
  if (vhsDateTimeMode === 'both' || vhsDateTimeMode === 'date-only') lines.push(dateStr);
  if (vhsDateTimeMode === 'both' || vhsDateTimeMode === 'time-only') lines.push(timeStr);
  
  // Draw on canvas using VCR OSD Mono font
  // Position: bottom-right or bottom-left
  // Style: white text, black shadow (classic VCR look)
  // Font size: relative to frame height (e.g. ~3% of height)
}
```

Key rendering details:
- Font: `VCR OSD Mono`
- Color: white with black shadow (classic VCR timer look)
- Size: ~3-4% of frame height, min ~14px
- Padding: ~2% from edges
- Line height: 1.2x font size

### UI Component

**New file:** `src/components/VhsDateTimePane/VhsDateTimePane.tsx`

```
[Enable VHS date/time]  <toggle>
┌─────────────────────────────────────────┐
│  Mode: [Dropdown ▼]                    │
│        - Both (date + time)            │
│        - Date only                     │
│        - Time only                     │
│                                         │
│  Position: [Dropdown ▼]                │
│           - Bottom Right               │
│           - Bottom Left                │
└─────────────────────────────────────────┘
```

**SCSS:** `src/components/VhsDateTimePane/style.module.scss` — same grid layout as TitleOverlayPane

### App Integration

**`src/components/App/App.tsx`** — add tab:
```tsx
{
  id: 'vhs-datetime',
  panel: <VhsDateTimePane />,
  title: 'Date/Time',
}
```

Now there will be 3 tabs under "Text":
1. **Text** — title overlay (renamed)
2. **Date/Time** — VHS date/time overlay (new)
3. **Render** — render settings (existing)

### VideoPlayer Integration

**`src/components/VideoPlayer/VideoPlayer.tsx`**:
- Pass VHS date/time settings when creating MediaPlayer (in the initial PipelineSettings object)
- Add `useLayoutEffect` to reactively update `player.vhsDateTimeSettings`

### MediaPlayer Integration

**`src/util/media-player.ts`**:
- Add `vhsDateTimeSettings` getter/setter that updates `pipelineSettings`

### Render Job Integration

**`src/app-state.ts`** `addRenderJob()`:
- Add VHS date/time fields to the `effectSettings` object passed to `RenderJob`
