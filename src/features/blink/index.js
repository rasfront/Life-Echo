// Blink feature: lightweight blink detection triggering onRecord
export function createBlinkFeature(ui, onBlink) {
  const video = ui.preview;
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  let baseline = null;
  let lowCount = 0;
  let riseCount = 0;
  const interval = 70;
  const minLow = 0, maxLow = 3;
  const lastVals = [];
  function pushVal(v) { lastVals.push(v); if (lastVals.length > 6) lastVals.shift(); }
  function variance() {
    if (lastVals.length < 3) return 0;
    const m = lastVals.reduce((a,b)=>a+b,0)/lastVals.length;
    return lastVals.reduce((a,b)=>a+(b-m)*(b-m),0)/lastVals.length;
  }
  let lastLowStart = 0;

  function flash() {
    video.classList.add('blink');
    try { if (navigator.vibrate) navigator.vibrate(50); } catch(_) {}
    setTimeout(()=> video.classList.remove('blink'), 120);
  }

  function stop() { stopped = true; }

  function start() {
    stopped = false;
    (function sample(){
      if (stopped) return;
      try {
        const w = video.videoWidth || 320;
        const h = video.videoHeight || 240;
        if (w && h) {
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
          lastVals.push(avg); if (lastVals.length > 6) lastVals.shift();
          const motion = variance();
          const adaptRate = lowCount ? 0.10 : 0.03;
          baseline = baseline == null ? avg : (baseline * (1 - adaptRate) + avg * adaptRate);
          const dropThreshold = baseline * 0.75;
          if (motion < 120) {
            if (avg < dropThreshold) {
              if (lowCount === 0) lastLowStart = performance.now();
              lowCount++; riseCount = 0;
            } else {
              const dur = performance.now() - lastLowStart;
              if (lowCount >= minLow && lowCount <= maxLow && dur <= 320) {
                riseCount++;
                if (riseCount >= 1) { flash(); onBlink(); lowCount = 0; riseCount = 0; }
              } else {
                if (lowCount > 6) { lowCount = 0; riseCount = 0; }
                else if (lowCount > 0) { riseCount++; if (riseCount > 2) { lowCount = 0; riseCount = 0; } }
              }
            }
          } else {
            lowCount = 0; riseCount = 0;
          }
        }
      } catch {}
      setTimeout(sample, interval);
    })();
  }

  return { start, stop };
}
