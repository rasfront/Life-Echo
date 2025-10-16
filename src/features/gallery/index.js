// Gallery feature: render, play, and delete clips with safe URL lifecycle
export function createGalleryFeature(ui, storage) {
  const revokeLater = (url) => setTimeout(()=> URL.revokeObjectURL(url), 0);

  function formatTS(ts) {
    const d = new Date(ts);
    const pad = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function hideAllPlayersExcept(node) {
    document.querySelectorAll('.clip-item .player:not([hidden])').forEach(v => {
      if (!node || !node.contains(v)) {
        v.pause(); v.removeAttribute('src'); v.load(); v.hidden = true;
      }
    });
  }

  function wireDelete(node, id) {
    const delBtn = node.querySelector('.delete-btn');
    if (!delBtn) return;
    delBtn.addEventListener('click', async () => {
      const ok = confirm('Delete this clip permanently?');
      if (!ok) return;
      try {
        await storage.deleteClip(id);
        await renderClips();
      } catch (e) {
        console.error(e);
        ui.setStatus?.('Failed to delete clip');
      }
    });
  }

  function wirePlay(node, id) {
    const btn = node.querySelector('.thumb-btn');
    const player = node.querySelector('.player');
    if (!btn || !player) return;

    btn.addEventListener('click', async () => {
      try {
        hideAllPlayersExcept(node);
        const blob = await storage.getClip(id);
        const url = URL.createObjectURL(blob);
        player.hidden = false;
        player.src = url;
        player.play().catch(()=>{});

        const cleanup = () => { player.pause(); player.removeAttribute('src'); player.load(); player.hidden = true; revokeLater(url); };
        player.onended = cleanup;
        player.onpause = () => {
          if (player.currentTime === 0 || player.currentTime === player.duration) cleanup();
        };
      } catch (e) {
        console.error(e);
        ui.setStatus?.('Failed to play clip');
      }
    });
  }

  async function renderClips() {
    const items = await storage.listClips();
    ui.clips.innerHTML = '';
    for (const item of items) {
      const node = ui.template.content.firstElementChild.cloneNode(true);
      node.dataset.id = item.id;
      node.querySelector('.title').textContent = item.filename;
      node.querySelector('.time').textContent = formatTS(item.timestamp);

      // thumbnail
      try {
        const thumbBlob = await storage.getThumb(item.id);
        const img = node.querySelector('.thumb');
        const turl = URL.createObjectURL(thumbBlob);
        img.src = turl;
        img.onload = () => revokeLater(turl);
      } catch (e) {
        console.error(e);
        // thumb is optional; continue
      }

      wirePlay(node, item.id);
      wireDelete(node, item.id);
      ui.clips.appendChild(node);
    }
  }

  return { renderClips };
}
