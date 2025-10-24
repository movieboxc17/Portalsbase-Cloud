/**
 * Minimal file manager client (vanilla JS)
 *
 * Expects the server API:
 * GET  /api/storage/usage
 * GET  /api/files?path=<relative>
 * GET  /api/files/preview?path=<relative>
 * GET  /api/files/download?path=<relative>
 *
 * Place this file at /public/file-manager.js and the HTML will reference it.
 */
(function(){
  const fileListEl = document.getElementById('file-list');
  const previewEl = document.getElementById('preview');
  const breadcrumbsEl = document.getElementById('breadcrumbs');
  const storageFill = document.getElementById('storage-fill');
  const storageText = document.getElementById('storage-text');
  const searchInput = document.getElementById('search');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnBack = document.getElementById('btn-back');
  const downloadLink = document.getElementById('download-link');

  let currentPath = '';
  let currentList = [];

  async function fetchStorage() {
    try {
      const r = await fetch('/api/storage/usage');
      if (!r.ok) throw new Error('Not ok');
      const json = await r.json();
      storageFill.style.width = (json.percent || 0) + '%';
      storageText.textContent = `${formatBytes(json.used)} used of ${formatBytes(json.total)} (${json.percent || 0}%)`;
    } catch (err) {
      storageText.textContent = 'Storage: error';
    }
  }

  async function fetchFiles(path='') {
    const encoded = encodeURIComponent(path);
    const r = await fetch(`/api/files?path=${encoded}`);
    if (!r.ok) {
      fileListEl.innerHTML = `<div class="file-row">Cannot load files</div>`;
      return;
    }
    const json = await r.json();
    currentPath = json.path || '';
    currentList = json.list || [];
    renderList(currentList);
    breadcrumbsEl.textContent = '/' + (currentPath || '');
    downloadLink.style.display = 'none';
    previewEl.innerHTML = 'Select a file to preview';
  }

  function renderList(list) {
    const filter = (searchInput.value || '').toLowerCase();
    fileListEl.innerHTML = '';
    list.filter(item => item.name.toLowerCase().includes(filter)).forEach(item => {
      const row = document.createElement('div');
      row.className = 'file-row';
      const left = document.createElement('div');
      left.className = 'file-name';
      const icon = document.createElement('div');
      icon.textContent = item.type === 'directory' ? '📁' : '📄';
      const name = document.createElement('div');
      name.textContent = item.name;
      left.appendChild(icon);
      left.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'file-meta';
      if (item.type === 'file') meta.textContent = `${formatBytes(item.size)} • ${item.mime || ''}`;
      row.appendChild(left);
      row.appendChild(meta);
      row.addEventListener('click', () => {
        if (item.type === 'directory') {
          navigateTo(item.path);
        } else {
          previewFile(item);
        }
      });
      fileListEl.appendChild(row);
    });

    if ((fileListEl.childElementCount) === 0) {
      fileListEl.innerHTML = `<div class="file-row">No files</div>`;
    }
  }

  function navigateTo(path) {
    fetchFiles(path);
  }

  async function previewFile(item) {
    const p = item.path;
    // set download link
    downloadLink.href = `/api/files/download?path=${encodeURIComponent(p)}`;
    downloadLink.style.display = 'inline-block';

    // handle different mime types
    const mime = item.mime || '';
    previewEl.innerHTML = '';
    if (mime.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = `/api/files/preview?path=${encodeURIComponent(p)}`;
      previewEl.appendChild(img);
    } else if (mime.startsWith('video/')) {
      const v = document.createElement('video');
      v.controls = true;
      v.src = `/api/files/preview?path=${encodeURIComponent(p)}`;
      previewEl.appendChild(v);
    } else if (mime.startsWith('audio/')) {
      const a = document.createElement('audio');
      a.controls = true;
      a.src = `/api/files/preview?path=${encodeURIComponent(p)}`;
      previewEl.appendChild(a);
    } else if (mime.startsWith('text/') || mime === 'application/json' || mime.endsWith('+json')) {
      // fetch as text and display
      previewEl.innerHTML = '<pre>Loading...</pre>';
      try {
        const r = await fetch(`/api/files/preview?path=${encodeURIComponent(p)}`);
        const txt = await r.text();
        previewEl.innerHTML = '';
        const pre = document.createElement('pre');
        pre.textContent = txt;
        previewEl.appendChild(pre);
      } catch (err) {
        previewEl.textContent = 'Could not load preview';
      }
    } else {
      previewEl.innerHTML = 'No preview available. Use the download button.';
    }
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '—';
    const units = ['B','KB','MB','GB','TB'];
    let i = 0;
    let val = Number(bytes);
    while (val >= 1024 && i < units.length-1) { val /= 1024; i++; }
    return `${val.toFixed(val < 10 && i>0 ? 2:0)} ${units[i]}`;
  }

  btnRefresh.addEventListener('click', () => {
    fetchFiles(currentPath);
    fetchStorage();
  });

  btnBack.addEventListener('click', () => {
    if (!currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const next = parts.join('/');
    fetchFiles(next);
  });

  searchInput.addEventListener('input', () => renderList(currentList));

  // initial
  fetchFiles('');
  fetchStorage();
  // refresh storage every 30s
  setInterval(fetchStorage, 30000);
})();
