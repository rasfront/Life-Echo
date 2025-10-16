import { Storage } from './storage.js';
import { createRecordingFeature } from './features/recording/index.js';
import { createGalleryFeature } from './features/gallery/index.js';
import { createBlinkFeature } from './features/blink/index.js';
import { createThumbFeature } from './features/thumb/index.js';
import { createBackupFeature } from './features/backup/index.js';
import { createStatusFeature } from './features/status/index.js';

const UI = {
  preview: document.getElementById('preview'),
  recordBtn: document.getElementById('recordBtn'),
  status: document.getElementById('status'),
  clips: document.getElementById('clips'),
  template: document.getElementById('clip-item-template'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  switchCam: document.getElementById('switchCam'),
};

// Features
let storage; let recording; let gallery; let blink; let thumb; let backup; let statusFx;
let cameraReady = false;
let isRecording = false;
let blinkStarted = false;

function wireUI() {
  UI.recordBtn.addEventListener('click', onRecordClick);
  UI.exportBtn?.addEventListener('click', backup.onExport);
  UI.importInput?.addEventListener('change', (e)=>{
    const f = e.target.files && e.target.files[0];
    if (f) backup.onImport(f);
  });
  UI.switchCam?.addEventListener('click', () => recording.switchCamera());
}

async function onRecordClick() {
  if (!cameraReady) { await ensureCamera(); if (!cameraReady) return; }
  if (isRecording) return;
  isRecording = true;
  try {
    statusFx.setBusy(true);
    statusFx.setStatus('Recording 3s...');
    const blob = await recording.recordFor(3000);
    statusFx.setStatus('Generating thumbnail...');
    const thumbBlob = await thumb.safeMakeThumbnail(blob);
    const ts = Date.now();
    const name = `clip-${new Date(ts).toISOString().replace(/[:.]/g,'-')}.webm`;
    await storage.saveClip({ filename: name, blob, timestamp: ts, thumbBlob });
    statusFx.setStatus('Clip saved');
    await gallery.renderClips();
  } catch (e) {
    console.error(e);
    statusFx.setStatus(e?.message || 'Recording error');
  } finally {
    statusFx.setBusy(false);
    isRecording = false;
  }
}

async function ensureCamera() {
  try {
    await recording.ensureCamera();
    cameraReady = true;
    if (!blinkStarted) { blink.start(); blinkStarted = true; }
    statusFx.setStatus('Ready');
  } catch (e) {
    console.error(e);
    statusFx.setStatus(e?.message || 'Camera error');
  }
}

async function main() {
  try {
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./service-worker.js'); } catch {}
    }

    storage = await Storage.init();

    statusFx = createStatusFeature(UI);
    recording = createRecordingFeature(UI);
    gallery = createGalleryFeature(UI, storage);
    thumb = createThumbFeature();
    blink = createBlinkFeature(UI, () => { if (!isRecording) onRecordClick(); });
    backup = createBackupFeature({ ...UI, setStatus: statusFx.setStatus, importInput: UI.importInput }, storage, async ()=>{
      await gallery.renderClips();
    });

    wireUI();

    // Auto-initialize camera on start (per request). Note: may show permission prompt on iOS.
    await ensureCamera();

    await gallery.renderClips();
  } catch (e) {
    console.error(e);
    statusFx?.setStatus(e?.message || 'Initialization error');
    statusFx?.setBusy(true);
  }
}

document.addEventListener('DOMContentLoaded', main);
