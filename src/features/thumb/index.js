// Feature: safe thumbnail creation with timeout and fallback
import { makeThumbnail } from '../../thumbnail.js';

export function createThumbFeature() {
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
      // fallback: black image
      const v = document.createElement('canvas');
      v.width = 320; v.height = 180;
      const b = await new Promise(res=> v.toBlob(res,'image/png'));
      return b;
    } finally {
      clearTimeout(timer);
    }
  }

  return { safeMakeThumbnail };
}
