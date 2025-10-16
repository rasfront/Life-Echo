import { initRecorder } from './recorder.js';
import { Storage } from './storage.js';
import { makeThumbnail } from './thumbnail.js';

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

let recorder;
let storage;
let deferredPrompt = null;
let isRecording = false;
let blinkLoopStop = null;
let currentFacing = 'user';

function setStatus(text) {
  UI.status.textContent = text || '';
}

function setBusy(busy) {
  UI.recordBtn.disabled = !!busy;
}

function flashPreview() {
  UI.preview.classList.add('blink');
  try { if (navigator.vibrate) navigator.vibrate(50); } catch(_) {}
  setTimeout(()=> UI.preview.classList.remove('blink'), 120);
}

function formatTS(ts) {
  const d = new Date(ts);
  const pad = (n)=> String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function renderClips() {
  const items = await storage.listClips();
  UI.clips.innerHTML = '';
  for (const item of items) {
    const node = UI.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.querySelector('.title').textContent = item.filename;
    node.querySelector('.time').textContent = formatTS(item.timestamp);
    // thumbnail
    const thumbBlob = await storage.getThumb(item.id);
    const img = node.querySelector('.thumb');
    const url = URL.createObjectURL(thumbBlob);
    img.src = url;
    img.onload = ()=> URL.revokeObjectURL(url);
    // play handler: show player on demand, hide others
    node.querySelector('.thumb-btn').addEventListener('click', async () => {
      // hide any other visible players
      document.querySelectorAll('.clip-item .player:not([hidden])').forEach(v=>{
        v.pause(); v.removeAttribute('src'); v.load(); v.hidden = true;
      });
      const player = node.querySelector('.player');
      const blob = await storage.getClip(item.id);
      const purl = URL.createObjectURL(blob);
      player.hidden = false;
      player.src = purl;
      player.play().catch(()=>{});
      const cleanup = () => { URL.revokeObjectURL(purl); player.hidden = true; };
      player.onended = cleanup;
      player.onpause = () => { if (player.currentTime === 0 || player.currentTime === player.duration) cleanup(); };
    });
    // delete handler
    const delBtn = node.querySelector('.delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        const ok = confirm('Удалить этот клип без возможности восстановления?');
        if (!ok) return;
        try {
          await storage.deleteClip(item.id);
          await renderClips();
        } catch (e) {
          console.error(e);
          setStatus('Не удалось удалить клип');
        }
      });
    }
    UI.clips.appendChild(node);
  }
}

async function onRecordClick() {
  if (isRecording) return;
  isRecording = true;
  try {
    setBusy(true);
    setStatus('Запись 3 сек...');
    const blob = await recorder.recordFor(3000);
    setStatus('Генерация миниатюры...');
    const thumb = await makeThumbnail(blob);
    const ts = Date.now();
    const name = `clip-${new Date(ts).toISOString().replace(/[:.]/g,'-')}.webm`;
    await storage.saveClip({ filename: name, blob, timestamp: ts, thumbBlob: thumb });
    setStatus('Клип сохранён');
    await renderClips();
  } catch (e) {
    console.error(e);
    setStatus(e?.message || 'Ошибка записи');
  } finally {
    setBusy(false);
    isRecording = false;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}

async function onExport() {
  try {
    setStatus('Экспорт...');
    const blob = await storage.exportAll();
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    downloadBlob(blob, `life-echo-backup-${ts}.json`);
    setStatus('Экспорт завершён');
  } catch (e) {
    console.error(e);
    setStatus('Ошибка экспорта');
  }
}

async function onImport(file) {
  try {
    setStatus('Импорт...');
    await storage.importData(file);
    await renderClips();
    setStatus('Импорт завершён');
  } catch (e) {
    console.error(e);
    setStatus('Ошибка импорта');
  } finally {
    UI.importInput.value = '';
  }
}

async function switchCamera() {
  try {
    setStatus('Переключение камеры...');
    // stop current
    try { recorder?.stop(); } catch(_) {}
    currentFacing = currentFacing === 'user' ? 'environment' : 'user';
    recorder = await initRecorder(UI.preview, { facingMode: currentFacing });
    setStatus('Готово');
  } catch (e) {
    console.error(e);
    setStatus('Не удалось переключить камеру');
  }
}

function startBlinkDetection() {
  const video = UI.preview;
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  let rafId = 0;
  let stopped = false;
  let lastAvg = null;
  let lowCount = 0;
  let armed = false; // fall detected, waiting for rise
  const interval = 120; // ms

  async function sample() {
    if (stopped) return;
    try {
      const w = video.videoWidth || 320;
      const h = video.videoHeight || 240;
      if (w && h) {
        cvs.width = 160; // scale down to save CPU
        cvs.height = Math.max(1, Math.floor((h * (1/3)) * (160 / w))); // top third scaled
        const regionH = Math.floor(h / 3);
        ctx.drawImage(video, 0, 0, w, regionH, 0, 0, cvs.width, cvs.height);
        const data = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          // perceived luminance
          sum += (0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2]);
        }
        const avg = sum / (data.length / 4);
        // EMA to smooth noise
        lastAvg = lastAvg == null ? avg : (lastAvg * 0.7 + avg * 0.3);
        const thr = (lastAvg * 0.75); // dynamic threshold 25% drop

        if (!isRecording) {
          if (!armed) {
            // detect fall below threshold for 1-3 consecutive samples
            if (avg < thr) lowCount++; else lowCount = 0;
            if (lowCount >= 1 && lowCount <= 3) {
              armed = true; // fall detected, now wait for rise
            } else if (lowCount > 3) {
              // too long low -> not a blink
              lowCount = 0; armed = false;
            }
          } else {
            // wait for brightness recovery
            if (avg >= thr) {
              // blink!
              flashPreview();
              onRecordClick();
              armed = false; lowCount = 0;
            }
          }
        } else {
          // ignore during recording
          armed = false; lowCount = 0;
        }
      }
    } catch (_) {}
    setTimeout(sample, interval);
  }
  sample();
  return () => { stopped = true; if (rafId) cancelAnimationFrame(rafId); };
}

async function main() {
  try {
    // Register service worker
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./service-worker.js'); } catch {}
    }
    // Install prompt handling
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });

    setStatus('Инициализация камеры...');
    storage = await Storage.init();
    recorder = await initRecorder(UI.preview, { facingMode: currentFacing });
    blinkLoopStop = startBlinkDetection();
    setStatus('Готово');
    await renderClips();
  } catch (e) {
    console.error(e);
    setStatus(e?.message || 'Ошибка инициализации');
    setBusy(true);
  }
}

UI.recordBtn.addEventListener('click', onRecordClick);
UI.exportBtn?.addEventListener('click', onExport);
UI.importInput?.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0];
  if (f) onImport(f);
});
UI.switchCam?.addEventListener('click', switchCamera);

document.addEventListener('DOMContentLoaded', main);
