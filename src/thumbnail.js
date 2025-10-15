// Create a small thumbnail from a recorded video blob using <video> + <canvas>
// Returns a Blob (image/png)
export async function makeThumbnail(videoBlob) {
  const url = URL.createObjectURL(videoBlob);
  try {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    await once(video, 'loadeddata');

    // Seek near 0.2s to avoid black first frame
    const target = Math.min(0.2, Math.max(0, (video.duration || 1) * 0.1));
    try { video.currentTime = target; } catch(_) {}
    await Promise.race([
      once(video, 'seeked'),
      timeout(300)
    ]);

    const canvas = document.createElement('canvas');
    const w = 320;
    const scale = w / (video.videoWidth || 320);
    canvas.width = w;
    canvas.height = Math.round((video.videoHeight || 180) * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.92));
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(el, ev) {
  return new Promise((res, rej) => {
    const on = () => { cleanup(); res(); };
    const onErr = () => { cleanup(); rej(new Error('media error')); };
    const cleanup = () => {
      el.removeEventListener(ev, on);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(ev, on, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

function timeout(ms) { return new Promise(res => setTimeout(res, ms)); }
