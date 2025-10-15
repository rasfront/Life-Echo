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
};

let recorder;
let storage;
let deferredPrompt = null;

function setStatus(text) {
  UI.status.textContent = text || '';
}

function setBusy(busy) {
  UI.recordBtn.disabled = !!busy;
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
    img.src = URL.createObjectURL(thumbBlob);
    img.onload = ()=> URL.revokeObjectURL(img.src);
    // play handler
    node.querySelector('.thumb-btn').addEventListener('click', async () => {
      const player = node.querySelector('.player');
      const blob = await storage.getClip(item.id);
      const url = URL.createObjectURL(blob);
      player.src = url;
      player.play().catch(()=>{});
      player.onended = () => { URL.revokeObjectURL(url); };
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
      // Optionally, you can show a UI button to install here.
    });

    setStatus('Инициализация камеры...');
    storage = await Storage.init();
    recorder = await initRecorder(UI.preview);
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

document.addEventListener('DOMContentLoaded', main);
