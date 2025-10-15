import { initRecorder } from './recorder.js';
import { Storage } from './storage.js';
import { makeThumbnail } from './thumbnail.js';

const UI = {
  preview: document.getElementById('preview'),
  recordBtn: document.getElementById('recordBtn'),
  status: document.getElementById('status'),
  clips: document.getElementById('clips'),
  template: document.getElementById('clip-item-template'),
};

let recorder;
let storage;

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
    const thumbBlob = await storage.getThumbnail(item.id);
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
    await storage.saveClip({ filename: name, blob, timestamp: ts, thumbnail: thumb });
    setStatus('Клип сохранён');
    await renderClips();
  } catch (e) {
    console.error(e);
    setStatus(e?.message || 'Ошибка записи');
  } finally {
    setBusy(false);
  }
}

async function main() {
  try {
    // Register service worker
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('/service-worker.js'); } catch {}
    }
    setStatus('Инициализация камеры...');
    storage = new Storage();
    await storage.init();
    recorder = await initRecorder(UI.preview);
    setStatus('Готово');
  } catch (e) {
    console.error(e);
    setStatus(e?.message || 'Ошибка инициализации');
    setBusy(true);
  }
}

UI.recordBtn.addEventListener('click', onRecordClick);

document.addEventListener('DOMContentLoaded', main);
