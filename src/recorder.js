// Recorder module: handles camera preview and 3s recording using MediaRecorder
// Exports: initRecorder(videoEl, opts?) -> { recordFor(ms), stream, stop, facing }

export async function initRecorder(videoEl, opts = {}) {
  // Polyfill for Safari iOS: provide mediaDevices.getUserMedia via webkitGetUserMedia
  if (typeof navigator.mediaDevices === 'undefined') {
    navigator.mediaDevices = {};
  }
  if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
    const legacyGetUM = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    if (legacyGetUM) {
      navigator.mediaDevices.getUserMedia = (constraints) => new Promise((resolve, reject) => {
        legacyGetUM.call(navigator, constraints, resolve, reject);
      });
    }
  }

  // After polyfill, if still not available — give clear guidance
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw new Error('WebRTC не поддерживается или требуется запуск через HTTPS/localhost (iOS Safari)');
  }

  const facing = opts.facingMode || 'user';

  // Ask for video (and optionally audio). Muted preview avoids feedback.
  const constraintsPrimary = { video: { facingMode: facing }, audio: true };
  const constraintsVideoOnly = { video: { facingMode: facing }, audio: false };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraintsPrimary);
  } catch (e) {
    // On iOS devices, audio can cause NotAllowedError if mic is blocked; try video-only fallback
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NotReadableError')) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraintsVideoOnly);
      } catch (e2) {
        throw normalizeGetUMError(e2);
      }
    } else {
      throw normalizeGetUMError(e);
    }
  }

  // Prepare preview element for iOS inline playback behavior
  try {
    videoEl.muted = true; // avoid feedback
    videoEl.playsInline = true; // iOS inline
  } catch (_) {}
  videoEl.srcObject = stream;

  function stop() {
    try { videoEl.srcObject = null; } catch(_) {}
    if (stream) {
      stream.getTracks().forEach(t=>{ try { t.stop(); } catch(_) {} });
    }
  }

  async function recordFor(ms) {
    if (!window.MediaRecorder) throw new Error('MediaRecorder не поддерживается в этом браузере');

    const chunks = [];
    const mime = selectMimeType();
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 96_000 });
    } catch (e) {
      // Fallback without explicit mime
      try {
        rec = new MediaRecorder(stream);
      } catch (e2) {
        throw new Error('Не удалось создать MediaRecorder');
      }
    }

    return new Promise((resolve, reject) => {
      const chunksLocal = chunks;
      const onData = e => { if (e.data && e.data.size) chunksLocal.push(e.data); };
      const onStop = () => {
        cleanup();
        const type = rec.mimeType || mime || 'video/webm';
        resolve(new Blob(chunksLocal, { type }));
      };
      const onError = e => {
        const err = e?.error || e;
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        rec.removeEventListener('dataavailable', onData);
        rec.removeEventListener('stop', onStop);
        rec.removeEventListener('error', onError);
      };

      rec.addEventListener('dataavailable', onData);
      rec.addEventListener('stop', onStop);
      rec.addEventListener('error', onError);

      try { rec.start(); } catch (e) { cleanup(); return reject(e); }
      setTimeout(() => { try { rec.stop(); } catch (_) {} }, ms);
    });
  }

  return { recordFor, stream, stop, facing };
}

function selectMimeType() {
  // iOS Safari supports MediaRecorder since 14.3+, but mime support is limited; allow auto
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function normalizeGetUMError(e) {
  if (!e) return new Error('Неизвестная ошибка доступа к камере');
  const name = e.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new Error('Доступ к камере/микрофону отклонён. Разрешите доступ в настройках браузера.');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new Error('Камера или микрофон не найдены. Подключите устройство и попробуйте снова.');
  if (name === 'NotReadableError') return new Error('Устройство камеры занято другой программой. Закройте её и повторите.');
  return e;
}
