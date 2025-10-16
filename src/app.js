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
let currentFacing = localStorage.getItem('le-facing') || 'user';
let cameraReady = false;

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
    const thumbBlob = await storage.getThumb(item.id);
    const img = node.querySelector('.thumb');
    const url = URL.createObjectURL(thumbBlob);
    img.src = url;
    img.onload = ()=> URL.revokeObjectURL(url);
    node.querySelector('.thumb-btn').addEventListener('click', async () => {
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

async function safeMakeThumbnail(blob) {
  const timeoutMs = 8000;
  let timer;
  try {
    const race = Promise.race([
      makeThumbnail(blob),
      new Promise((_,rej)=>{ timer = setTimeout(()=> rej(new Error('thumb-timeout')), timeoutMs); })
    ]);
    return await race;
  } catch (e) {
    const v = document.createElement('canvas');
    v.width = 320; v.height = 180;
    const b = await new Promise(res=> v.toBlob(res,'image/png'));
    return b;
  } finally {
    clearTimeout(timer);
  }
}

async function onRecordClick() {
  if (!cameraReady) {
    await ensureCamera();
    if (!cameraReady) return;
  }
  if (isRecording) return;
  isRecording = true;
  try {
    setBusy(true);
    setStatus('Запись 3 сек...');
    const blob = await recorder.recordFor(3000);
    setStatus('Генерация миниатюры...');
    const thumb = await safeMakeThumbnail(blob);
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

async function ensureCamera() {
  try {
    if (recorder?.stream) { cameraReady = true; return; }
    setStatus('Инициализация камеры...');
    recorder = await initRecorder(UI.preview, { facingMode: currentFacing });
    cameraReady = true;
    if (!blinkLoopStop) blinkLoopStop = startBlinkDetection();
    setStatus('Готово');
  } catch (e) {
    console.error(e);
    setStatus(e?.message || 'Ошибка камеры');
  }
}

async function switchCamera() {
  try {
    setStatus('Переключение камеры...');
    try { recorder?.stop(); } catch(_) {}
    currentFacing = currentFacing === 'user' ? 'environment' : 'user';
    localStorage.setItem('le-facing', currentFacing);
    cameraReady = false;
    await ensureCamera();
  } catch (e) {
    console.error(e);
    setStatus('Не удалось переключить камеру');
  }
}

function startBlinkDetection() {
  const video = UI.preview;
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  let baseline = null;
  let lowCount = 0;
  let riseCount = 0;
  const interval = 70; // ms faster sampling
  const minLow = 0, maxLow = 3; // allow instantaneous dips

  const lastVals = [];
  function pushVal(v) { lastVals.push(v); if (lastVals.length > 6) lastVals.shift(); }
  function variance() {
    if (lastVals.length < 3) return 0;
    const m = lastVals.reduce((a,b)=>a+b,0)/lastVals.length;
    return lastVals.reduce((a,b)=>a+(b-m)*(b-m),0)/lastVals.length;
  }

  let lastLowStart = 0;

  async function sample() {
    if (stopped) return;
    try {
      const w = video.videoWidth || 320;
      const h = video.videoHeight || 240;
      if (w && h) {
        // ROI: 30%-60% height, 15%-85% width
        const yStart = Math.floor(h * 0.30);
        const roiH = Math.floor(h * 0.30);
        const xStart = Math.floor(w * 0.15);
        const roiW = Math.floor(w * 0.70);
        const targetW = 160;
        const targetH = Math.max(1, Math.floor(roiH * (targetW / roiW)));
        cvs.width = targetW; cvs.height = targetH;
        ctx.drawImage(video, xStart, yStart, roiW, roiH, 0, 0, targetW, targetH);
        const data = ctx.getImageData(0, 0, targetW, targetH).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += (0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2]);
        const avg = sum / (data.length / 4);
        pushVal(avg);
        const motion = variance();
        const adaptRate = lowCount ? 0.10 : 0.03;
        baseline = baseline == null ? avg : (baseline * (1 - adaptRate) + avg * adaptRate);
        const dropThreshold = baseline * 0.75; // 25% drop

        if (!isRecording && motion < 120) {
          if (avg < dropThreshold) {
            if (lowCount === 0) lastLowStart = performance.now();
            lowCount++;
            riseCount = 0;
          } else {
            // fast blink path: short dip-and-rise within ~300ms
            const dur = performance.now() - lastLowStart;
            if (lowCount >= minLow && lowCount <= maxLow && dur <= 320) {
              riseCount++;
              if (riseCount >= 1) {
                flashPreview();
                onRecordClick();
                lowCount = 0; riseCount = 0;
              }
            } else {
              if (lowCount > 6) { lowCount = 0; riseCount = 0; }
              else if (lowCount > 0) { riseCount++; if (riseCount > 2) { lowCount = 0; riseCount = 0; } }
            }
          }
        } else {
          lowCount = 0; riseCount = 0;
        }
      }
    } catch (_) {}
    setTimeout(sample, interval);
  }
  sample();
  return () => { stopped = true; };
}

async function main() {
  try {
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./service-worker.js'); } catch {}
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });

    storage = await Storage.init();

    UI.preview.addEventListener('click', ensureCamera, { once: true });
    UI.recordBtn.addEventListener('click', ensureCamera, { once: true });
    ensureCamera();

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
