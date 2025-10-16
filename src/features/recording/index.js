// Recording feature: encapsulates camera init, record logic, and camera switching
// Keeps UI updates minimal and isolates state transitions
import { initRecorder } from '../../recorder.js';

export function createRecordingFeature(ui) {
  // Internal state
  let recorder = null;
  let isRecording = false;
  let cameraReady = false;
  let currentFacing = (localStorage.getItem('le-facing') || 'user');

  // UI helpers (no cross-feature imports to keep feature self-contained)
  const setStatus = (t) => { ui.status.textContent = t || ''; };
  const setBusy = (b) => { ui.recordBtn.disabled = !!b; };
  const flashPreview = () => {
    ui.preview.classList.add('blink');
    try { navigator.vibrate?.(50); } catch(_) {}
    setTimeout(() => ui.preview.classList.remove('blink'), 120);
  };

  // Guards
  const hasActiveStream = () => Boolean(recorder?.stream);

  // Public API implementations
  async function ensureCamera() {
    if (hasActiveStream()) { cameraReady = true; return; }
    setStatus('Initializing camera...');
    try {
      recorder = await initRecorder(ui.preview, { facingMode: currentFacing });
      cameraReady = true;
      setStatus('Ready');
    } catch (e) {
      console.error(e);
      cameraReady = false;
      setStatus(e?.message || 'Camera error');
      throw e; // bubble up to caller for centralized handling
    }
  }

  async function recordFor(ms) {
    if (!cameraReady) { await ensureCamera(); }
    if (!cameraReady || isRecording) return null;
    isRecording = true;
    try {
      setBusy(true);
      setStatus(`Recording ${Math.round(ms/1000)}s...`);
      const blob = await recorder.recordFor(ms);
      flashPreview();
      return blob;
    } finally {
      setBusy(false);
      isRecording = false;
    }
  }

  async function switchCamera() {
    setStatus('Switching camera...');
    try {
      // Stop current stream safely
      try { recorder?.stop?.(); } catch(_) {}
      recorder = null;
      cameraReady = false;
      // Toggle facing mode and persist
      currentFacing = currentFacing === 'user' ? 'environment' : 'user';
      localStorage.setItem('le-facing', currentFacing);
      // Re-init
      await ensureCamera();
    } catch (e) {
      console.error(e);
      setStatus('Failed to switch camera');
    }
  }

  return {
    ensureCamera,
    recordFor,
    switchCamera,
    get facing() { return currentFacing; }
  };
}
