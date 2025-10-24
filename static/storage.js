// Fetches /api/storage/usage and fills the small dashboard storage bar/numbers.
// This version prefers server-provided human-readable fields (used_human, free_human, total_human)
// but will fall back to numeric values and format them client-side if needed.

(function(){
  const storageFill = document.getElementById('storage-fill');
  const storageLeft = document.getElementById('storage-left');
  const storageText = document.getElementById('storage-text');
  const storageUsedEl = document.getElementById('storage-used');
  const storageFreeEl = document.getElementById('storage-free');
  const storageTotalEl = document.getElementById('storage-total');

  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return '—';
    let num = Number(bytes);
    if (isNaN(num)) return '—';
    const units = ['B','KB','MB','GB','TB','PB'];
    let i = 0;
    while (num >= 1024 && i < units.length - 1) { num /= 1024; i++; }
    return `${(num < 10 && i>0) ? num.toFixed(2) : Math.round(num)} ${units[i]}`;
  }

  async function fetchStorage() {
    try {
      const res = await fetch('/api/storage/usage', { cache: 'no-store' });
      if (!res.ok) throw new Error('Storage API error');
      const json = await res.json();

      const percent = Math.min(100, Math.max(0, Number(json.percent) || 0));
      if (storageFill) storageFill.style.width = percent + '%';
      if (storageLeft) storageLeft.style.width = Math.max(0, 100 - percent) + '%';

      // Prefer human-readable strings if API returned them
      if (storageUsedEl) storageUsedEl.textContent = json.used_human || formatBytes(json.used);
      if (storageFreeEl) storageFreeEl.textContent = json.free_human || formatBytes(json.free);
      if (storageTotalEl) storageTotalEl.textContent = json.total_human || formatBytes(json.total);

      if (storageText) storageText.textContent = `${percent}% used`;

      const bar = document.querySelector('.storage-bar');
      if (bar) bar.setAttribute('aria-valuenow', String(percent));
    } catch (err) {
      if (storageText) storageText.textContent = 'Storage: error';
      if (storageUsedEl) storageUsedEl.textContent = '—';
      if (storageFreeEl) storageFreeEl.textContent = '—';
      if (storageTotalEl) storageTotalEl.textContent = '—';
      if (storageFill) storageFill.style.width = '0%';
      if (storageLeft) storageLeft.style.width = '100%';
      console.error('Storage fetch failed', err);
    }
  }

  // run on load and periodically refresh
  document.addEventListener('DOMContentLoaded', () => {
    fetchStorage();
    setInterval(fetchStorage, 30000); // every 30s
  });
})();
