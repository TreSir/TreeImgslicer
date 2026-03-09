const input = document.getElementById('imageInput');
const rowsInput = document.getElementById('rows');
const colsInput = document.getElementById('cols');
const sliceBtn = document.getElementById('sliceBtn');
const trimBtn = document.getElementById('trimBtn');
const statusEl = document.getElementById('status');
const countBadge = document.getElementById('countBadge');
const preview = document.getElementById('preview');
let sourceItems = [];

function imageToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

function loadFile(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() {
      const img = new Image();
      img.onload = function() { resolve({ name: file.name, canvas: imageToCanvas(img) }); };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function trimTransparentArea(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) {
      const p = (i - 3) / 4;
      const x = p % w;
      const y = Math.floor(p / w);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX === -1) return { canvas: canvas, trimmed: false };
  if (maxY === -1) return { canvas: canvas, trimmed: false };
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  out.getContext('2d').drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  let trimmed = false;
  if (cropW !== w) trimmed = true;
  if (cropH !== h) trimmed = true;
  return { canvas: out, trimmed: trimmed };
}

function makeGroup(title) {
  const group = document.createElement('section');
  group.className = 'batch-group';
  const h = document.createElement('h3');
  h.className = 'group-title';
  h.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'group-grid';
  group.appendChild(h);
  group.appendChild(grid);
  preview.appendChild(group);
  return grid;
}

function addTile(container, canvas, name) {
  const url = canvas.toDataURL('image/png');
  const tile = document.createElement('article');
  tile.className = 'tile';
  const img = document.createElement('img');
  img.src = url;
  const meta = document.createElement('div');
  meta.className = 'meta';
  const left = document.createElement('span');
  left.textContent = name;
  const link = document.createElement('a');
  link.href = url;
  link.download = name + '.png';
  link.textContent = 'Download';
  meta.appendChild(left);
  meta.appendChild(link);
  tile.appendChild(img);
  tile.appendChild(meta);
  container.appendChild(tile);
}

input.addEventListener('change', async function() {
  const files = input.files ? Array.from(input.files) : [];
  if (files.length === 0) { sourceItems = []; statusEl.textContent = 'Please select images.'; return; }
  statusEl.textContent = 'Loading images...';
  try {
    sourceItems = await Promise.all(files.map(loadFile));
    statusEl.textContent = sourceItems.length + ' images loaded. Ready.';
  } catch (e) {
    sourceItems = [];
    statusEl.textContent = 'Failed to load one or more images.';
  }
});

trimBtn.addEventListener('click', function() {
  if (sourceItems.length === 0) { statusEl.textContent = 'Upload images first.'; return; }
  preview.innerHTML = '';
  let total = 0;
  let trimmed = 0;
  for (const item of sourceItems) {
    const result = trimTransparentArea(item.canvas);
    const g = makeGroup(item.name + ' (trim)');
    addTile(g, result.canvas, 'trimmed-subject');
    total += 1;
    if (result.trimmed) trimmed += 1;
  }
  countBadge.textContent = total + ' tiles';
  statusEl.textContent = 'Trim complete for ' + trimmed + '/' + sourceItems.length + ' images.';
});

sliceBtn.addEventListener('click', function() {
  if (sourceItems.length === 0) { statusEl.textContent = 'Upload images first.'; return; }
  const rows = Number(rowsInput.value);
  const cols = Number(colsInput.value);
  if (rows < 1) { statusEl.textContent = 'Rows must be greater than 0.'; return; }
  if (cols < 1) { statusEl.textContent = 'Columns must be greater than 0.'; return; }
  preview.innerHTML = '';
  let total = 0;
  for (const item of sourceItems) {
    const src = item.canvas;
    const tileW = Math.floor(src.width / cols);
    const tileH = Math.floor(src.height / rows);
    if (tileW < 1) { makeGroup(item.name + ' (skipped)'); continue; }
    if (tileH < 1) { makeGroup(item.name + ' (skipped)'); continue; }
    const g = makeGroup(item.name);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = document.createElement('canvas');
        tile.width = tileW;
        tile.height = tileH;
        tile.getContext('2d').drawImage(src, c * tileW, r * tileH, tileW, tileH, 0, 0, tileW, tileH);
        addTile(g, tile, 'R' + (r + 1) + '-C' + (c + 1));
        total += 1;
      }
    }
  }
  countBadge.textContent = total + ' tiles';
  statusEl.textContent = 'Batch slice complete for ' + sourceItems.length + ' images.';

});

const hoverPreview = document.createElement('div');
hoverPreview.className = 'hover-preview';
const hoverImg = document.createElement('img');
const hoverInfo = document.createElement('div');
hoverInfo.className = 'info';
hoverPreview.appendChild(hoverImg);
hoverPreview.appendChild(hoverInfo);
document.body.appendChild(hoverPreview);

function moveHoverPreview(ev) {
  const x = ev.clientX + 16;
  const y = ev.clientY + 16;
  hoverPreview.style.left = x + 'px';
  hoverPreview.style.top = y + 'px';
}

function showHoverPreview(img, ev) {
  hoverImg.src = img.src;
  hoverInfo.textContent = 'Resolution: ' + img.naturalWidth + ' x ' + img.naturalHeight;
  moveHoverPreview(ev);
  hoverPreview.classList.add('show');
}

function hideHoverPreview() {
  hoverPreview.classList.remove('show');
}

preview.addEventListener('mouseover', function(ev) {
  const t = ev.target;
  if (!(t instanceof HTMLImageElement)) return;
  if (!t.closest('.tile')) return;
  showHoverPreview(t, ev);
});

preview.addEventListener('mousemove', function(ev) {
  if (!hoverPreview.classList.contains('show')) return;
  moveHoverPreview(ev);
});

preview.addEventListener('mouseout', function(ev) {
  const t = ev.target;
  if (!(t instanceof HTMLImageElement)) return;
  if (!t.closest('.tile')) return;
  hideHoverPreview();
  hideHoverPreview();
});
