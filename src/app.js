import { initRecorder } from './recorder.js';
import { Storage } from './storage.js';
import { makeThumbnail } from './thumbnail.js';

// Minimal, robust bootstrapping for MVP
const els = {
  preview: document.getElementById('preview'),
  recordBtn: document.getElementById('recordBtn'),
  status: document.getElementById('status'),
  clips: document.getElementById('clips'),
  tpl: document.getElementById('clip-item-template')
};

let recorder; // { start, stop, stream }
let storage;

function setStatus(msg) {
  els.status.textContent = msg || '';
}

function disableBtn(disabled) {
  els.recordBtn.disabled = !!disabled;
}

async function init() {
  try {
    setStatus('Запрашиваем доступ к камере...');
    recorder = await initRecorder(els.preview);
    storage = await Storage.init();
    setStatus('Готово. Нажмите “Записать 3s”.');
    disableBtn(false);
    els.recordBtn.addEventListener('click', onRecordClick);
    await renderClips();
  } catch (e) {
    console.error(e);
    setStatus('Ошибка инициализации: ' + e.message);
    disableBtn(true);
  }
}

async function onRecordClick() {
  disableBtn(true);
  setStatus('Запись 3 секунды...');
  try {
    const blob = await recorder.recordFor(3000); // returns Blob
    setStatus('Сохраняем клип...');
    const ts = new Date();
    const filename = `clip-${ts.toISOString().replaceAll(':','').replaceAll('.','-')}.webm`;
    const thumbBlob = await makeThumbnail(blob);
    await storage.saveClip({ filename, blob, timestamp: ts.toISOString(), thumbBlob });
    setStatus('Клип сохранён');
    await renderClips();
  } catch (e) {
    console.error(e);
    setStatus('Ошибка записи: ' + e.message);
  } finally {
    disableBtn(false);
  }
}

async function renderClips() {
  const clips = await storage.listClips();
  els.clips.innerHTML = '';
  for (const clip of clips) {
    const li = els.tpl.content.firstElementChild.cloneNode(true);
    const btn = li.querySelector('.thumb-btn');
    const img = li.querySelector('.thumb');
    const title = li.querySelector('.title');
    const time = li.querySelector('.time');
    const player = li.querySelector('.player');

    title.textContent = clip.filename;
    time.textContent = new Date(clip.timestamp).toLocaleString();
    img.src = URL.createObjectURL(await storage.getThumb(clip.id));

    let opened = false;
    btn.addEventListener('click', async () => {
      if (!opened) {
        const blob = await storage.getClip(clip.id);
        player.src = URL.createObjectURL(blob);
        opened = true;
      }
      player.scrollIntoView({ behavior: 'smooth', block: 'center' });
      player.play().catch(()=>{});
    });

    els.clips.appendChild(li);
  }
}

init();
