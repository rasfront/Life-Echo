// Feature: status and busy-state helpers
export function createStatusFeature(ui) {
  function setStatus(text) { ui.status.textContent = text || ''; }
  function setBusy(busy) { ui.recordBtn.disabled = !!busy; }
  return { setStatus, setBusy };
}
