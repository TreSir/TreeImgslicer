const input = document.getElementById('imageInput');
const rowsInput = document.getElementById('rows');
const colsInput = document.getElementById('cols');
const sliceBtn = document.getElementById('sliceBtn');
const trimBtn = document.getElementById('trimBtn');
const statusEl = document.getElementById('status');
const countBadge = document.getElementById('countBadge');
const preview = document.getElementById('preview');
let sourceItems = [];

const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const pages = Array.from(document.querySelectorAll('.page'));

function setActivePage(key) {
  pages.forEach(function(page) {
    page.classList.toggle('active', page.dataset.page === key);
  });
  navButtons.forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.target === key);
  });
}

navButtons.forEach(function(btn) {
  btn.addEventListener('click', function() {
    setActivePage(btn.dataset.target);
  });
});

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

const videoInput = document.getElementById('videoInput');
const videoPreview = document.getElementById('videoPreview');
const startRange = document.getElementById('startRange');
const endRange = document.getElementById('endRange');
const startTime = document.getElementById('startTime');
const endTime = document.getElementById('endTime');
const loopToggle = document.getElementById('loopToggle');
const frameCountInput = document.getElementById('frameCount');
const extractBtn = document.getElementById('extractBtn');
const clearFramesBtn = document.getElementById('clearFramesBtn');
const videoStatus = document.getElementById('videoStatus');
const framePreview = document.getElementById('framePreview');
const frameBadge = document.getElementById('frameBadge');
const chromaBtn = document.getElementById('chromaBtn');
const keyColor = document.getElementById('keyColor');
const keyTolerance = document.getElementById('keyTolerance');
const keyFeather = document.getElementById('keyFeather');

let videoObjectUrl = '';
let segmentStart = 0;
let segmentEnd = 0;
let frames = [];

function formatSeconds(value) {
  return value.toFixed(2) + 's';
}

function updateSegmentLabels() {
  startTime.textContent = formatSeconds(segmentStart);
  endTime.textContent = formatSeconds(segmentEnd);
}

function setDefaultFrameCount() {
  const length = Math.max(0, segmentEnd - segmentStart);
  const estimated = Math.max(1, Math.round(length * 30));
  frameCountInput.value = estimated;
}

function updateFrameBadge() {
  frameBadge.textContent = frames.length + ' frames';
}

function renderFrames() {
  framePreview.innerHTML = '';
  frames.forEach(function(frame, index) {
    const card = document.createElement('article');
    card.className = 'frame-card';
    const img = document.createElement('img');
    img.src = frame.url;
    const meta = document.createElement('div');
    meta.className = 'frame-meta';
    const label = document.createElement('div');
    label.textContent = 'Frame ' + (index + 1);
    const actions = document.createElement('div');
    actions.className = 'frame-actions';

    const upBtn = document.createElement('button');
    upBtn.textContent = 'Up';
    upBtn.addEventListener('click', function() {
      if (index === 0) return;
      const temp = frames[index - 1];
      frames[index - 1] = frames[index];
      frames[index] = temp;
      renderFrames();
    });

    const downBtn = document.createElement('button');
    downBtn.textContent = 'Down';
    downBtn.addEventListener('click', function() {
      if (index === frames.length - 1) return;
      const temp = frames[index + 1];
      frames[index + 1] = frames[index];
      frames[index] = temp;
      renderFrames();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', function() {
      frames.splice(index, 1);
      renderFrames();
    });

    const download = document.createElement('a');
    download.textContent = 'Download';
    download.href = frame.url;
    download.download = 'frame-' + (index + 1) + '.png';

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(download);

    meta.appendChild(label);
    meta.appendChild(actions);
    card.appendChild(img);
    card.appendChild(meta);
    framePreview.appendChild(card);
  });
  updateFrameBadge();
}

function resetFrames() {
  frames = [];
  renderFrames();
}

function seekVideo(targetTime) {
  return new Promise(function(resolve) {
    const handler = function() {
      videoPreview.removeEventListener('seeked', handler);
      resolve();
    };
    videoPreview.addEventListener('seeked', handler);
    videoPreview.currentTime = targetTime;
  });
}

async function captureFrames(frameCount) {
  const canvas = document.createElement('canvas');
  canvas.width = videoPreview.videoWidth;
  canvas.height = videoPreview.videoHeight;
  const ctx = canvas.getContext('2d');
  const length = Math.max(0.01, segmentEnd - segmentStart);
  const step = frameCount > 1 ? length / (frameCount - 1) : 0;
  const output = [];

  for (let i = 0; i < frameCount; i++) {
    const time = segmentStart + (step * i);
    await seekVideo(time);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(videoPreview, 0, 0, canvas.width, canvas.height);
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = canvas.width;
    frameCanvas.height = canvas.height;
    frameCanvas.getContext('2d').drawImage(canvas, 0, 0);
    output.push({ canvas: frameCanvas, url: frameCanvas.toDataURL('image/png') });
  }
  return output;
}

function parseColor(colorValue) {
  const hex = colorValue.replace('#', '').trim();
  if (hex.length !== 6) return { r: 0, g: 255, b: 0 };
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

function applyChromaKeyToCanvas(canvas, key, tolerance, feather) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const softEdge = Math.max(0, feather);
  const softLimit = tolerance + softEdge;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) continue;
    const dr = r - key.r;
    const dg = g - key.g;
    const db = b - key.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= tolerance) {
      data[i + 3] = 0;
    } else if (softEdge > 0 && dist < softLimit) {
      const blend = (dist - tolerance) / (softLimit - tolerance);
      data[i + 3] = Math.round(a * blend);
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

videoInput.addEventListener('change', function() {
  const file = videoInput.files && videoInput.files[0];
  if (!file) {
    videoStatus.textContent = 'Please select a video.';
    return;
  }
  if (videoObjectUrl) {
    URL.revokeObjectURL(videoObjectUrl);
  }
  videoObjectUrl = URL.createObjectURL(file);
  videoPreview.src = videoObjectUrl;
  videoStatus.textContent = 'Loading video metadata...';
  videoPreview.load();
});

videoPreview.addEventListener('loadedmetadata', function() {
  segmentStart = 0;
  segmentEnd = Math.max(0, videoPreview.duration || 0);
  startRange.min = '0';
  endRange.min = '0';
  startRange.max = segmentEnd.toString();
  endRange.max = segmentEnd.toString();
  startRange.value = '0';
  endRange.value = segmentEnd.toString();
  updateSegmentLabels();
  setDefaultFrameCount();
  videoStatus.textContent = 'Video ready. Duration: ' + formatSeconds(segmentEnd);
});

startRange.addEventListener('input', function() {
  segmentStart = Math.min(Number(startRange.value), segmentEnd);
  if (segmentStart > segmentEnd) {
    segmentStart = segmentEnd;
    startRange.value = segmentStart;
  }
  updateSegmentLabels();
});

endRange.addEventListener('input', function() {
  segmentEnd = Math.max(Number(endRange.value), segmentStart);
  if (segmentEnd < segmentStart) {
    segmentEnd = segmentStart;
    endRange.value = segmentEnd;
  }
  updateSegmentLabels();
});

videoPreview.addEventListener('timeupdate', function() {
  if (!loopToggle.checked) return;
  if (videoPreview.currentTime > segmentEnd - 0.04) {
    videoPreview.currentTime = segmentStart;
  }
  if (videoPreview.currentTime < segmentStart) {
    videoPreview.currentTime = segmentStart;
  }
});

extractBtn.addEventListener('click', async function() {
  if (!videoPreview.src) {
    videoStatus.textContent = 'Upload a video first.';
    return;
  }
  const frameCount = Number(frameCountInput.value);
  if (!frameCount || frameCount < 1) {
    videoStatus.textContent = 'Frame count must be at least 1.';
    return;
  }
  if (segmentEnd <= segmentStart) {
    videoStatus.textContent = 'Segment end must be after start.';
    return;
  }
  videoStatus.textContent = 'Extracting frames...';
  extractBtn.disabled = true;
  try {
    frames = await captureFrames(frameCount);
    renderFrames();
    videoStatus.textContent = 'Extracted ' + frames.length + ' frames.';
  } catch (err) {
    videoStatus.textContent = 'Failed to extract frames.';
  } finally {
    extractBtn.disabled = false;
  }
});

clearFramesBtn.addEventListener('click', function() {
  resetFrames();
  videoStatus.textContent = 'Frames cleared.';
});

chromaBtn.addEventListener('click', function() {
  if (frames.length === 0) {
    videoStatus.textContent = 'Extract frames first.';
    return;
  }
  const key = parseColor(keyColor.value);
  const tolerance = Math.max(0, Math.min(255, Number(keyTolerance.value)));
  const feather = Math.max(0, Math.min(120, Number(keyFeather.value)));
  videoStatus.textContent = 'Applying chroma key...';
  frames.forEach(function(frame) {
    applyChromaKeyToCanvas(frame.canvas, key, tolerance, feather);
    frame.url = frame.canvas.toDataURL('image/png');
  });
  renderFrames();
  videoStatus.textContent = 'Chroma key applied.';
});