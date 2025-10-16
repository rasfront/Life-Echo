# Life Echo

Life Echo turns your camera into short-term memory.

With a single tap — or even just a blink — you can instantly record a 3-second video clip. Everything is stored locally, offline, with thumbnails for quick recall.

Instead of taking scattered notes or blurry photos, Life Echo captures moments as they happen — parking spots, posters, faces, ideas — in their real context.

Built entirely with Web APIs inside CodeGryphon, it works on mobile and desktop, supports front/rear camera switching, hands-free blink triggering, offline PWA install, and export/import for backups.

It’s fast, private, and feels like having a personal “memory buffer” in your pocket.

## Project Structure

- index.html — minimal UI (camera preview, record button, status, gallery, template)
- styles.css — dark theme, responsive layout for camera and gallery
- manifest.json — PWA metadata (name, theme, icons)
- service-worker.js — offline cache (cache-first), versioned
- src/
  - app.js — app bootstrap: wires features together
  - recorder.js — getUserMedia + MediaRecorder wrapper
  - storage.js — IndexedDB storage for clips and thumbnails
  - thumbnail.js — generate PNG thumbnails from video blobs
  - features/
    - recording/ — camera init, record, switch camera
    - gallery/ — render list, play, delete
    - blink/ — lightweight blink detector using canvas luminance samples
    - thumb/ — safeMakeThumbnail with timeout and fallback
    - status/ — setStatus and setBusy helpers
    - backup/ — export/import handlers
  - utils/
    - download.js — client-side blob downloader
  - data/ — reserved for future data modules

## Key Features

- One-tap recording of 3-second video clips (MediaRecorder)
- Local offline storage (IndexedDB) with thumbnails for quick recall
- Gallery with playback and deletion
- Blink-triggered hands-free capture (adaptive luminance baseline)
- Camera switching (front/rear) with remembered setting
- Offline-first PWA: installable, works without network
- Export/Import backups (single JSON file bundle)

## Technical Highlights

- 100% Web APIs: MediaDevices, MediaRecorder, Canvas, IndexedDB, Service Worker
- No external libraries, no network required to operate
- Cache-first service worker with versioned CACHE_NAME (bump on asset changes)
- Relative paths for GitHub Pages-friendly deployments
- iOS-friendly: playsinline preview, user-gesture camera paths supported
- Robust thumbnail generation with timeout and black-fallback
- Safe ObjectURL lifecycle management for images and players

## How It Works

- Recording: initRecorder attaches a Stream to <video#preview>. recordFor() starts MediaRecorder, collects Blob chunks, resolves after duration.
- Storage: IndexedDB object store "clips" keeps { id, filename, timestamp, blob, thumbnail }. Listing returns metadata; blobs are fetched on demand.
- Thumbnails: We seek a frame and draw to canvas at 320px width, return PNG Blob (or fallback on timeout).
- Blink detection: Samples ROI brightness every ~70ms; detects short darkness drop and rise versus adaptive baseline; triggers recording once per capture window.
- PWA: service-worker.js precaches core assets; fetch handler serves cached responses and updates cache opportunistically.

## Setup & Run

- Serve over HTTPS or localhost for camera access
- Deploy on GitHub Pages or any static hosting
- First run may require granting camera permission

Local dev (any static server):
- Use a simple static server, e.g. `python -m http.server` and open https via a proxy, or use a local HTTPS server setup.

## Build & CI

- CI workflow validates JS syntax and ensures required files exist, then deploys to GitHub Pages
- No bundling/build step required; ES modules are used directly

## Usage

- Open the app
- Switch camera if needed (🔄)
- Tap Record to capture 3s; or let the blink detector trigger hands-free
- Clips appear in the list with thumbnails; tap to play
- Export all clips to a JSON backup; restore via Import

## Privacy

- All data stays on your device. No analytics, no external APIs.

## Troubleshooting

- If updates don’t appear, unregister the Service Worker and hard-reload; CACHE_NAME is bumped to force updates
- On iOS, permissions may prompt more often; you can start camera via a user gesture to reduce prompts
