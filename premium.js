'use strict';

const $ = function(selector) {
  return document.querySelector(selector);
};

const imageInput = $('#imageInput');
const imageDropZone = $('#imageDropZone');
const sourceSummary = $('#sourceSummary');
const rowsInput = $('#rows');
const colsInput = $('#cols');
const orderSelect = $('#orderSelect');
const edgeMode = $('#edgeMode');
const offsetXInput = $('#offsetX');
const offsetYInput = $('#offsetY');
const gapXInput = $('#gapX');
const gapYInput = $('#gapY');
const trimFramesToggle = $('#trimFramesToggle');
const liveUpdateToggle = $('#liveUpdateToggle');
const resetSettingsBtn = $('#resetSettingsBtn');
const sliceBtn = $('#sliceBtn');
const trimBtn = $('#trimBtn');
const clearResultsBtn = $('#clearResultsBtn');
const statusEl = $('#status');
const gridHint = $('#gridHint');
const preview = $('#preview');
const countBadge = $('#countBadge');
const headerFrameStat = $('#headerFrameStat');
const dimensionBadge = $('#dimensionBadge');
const resultHint = $('#resultHint');

const animationStage = $('#animationStage');
const animationCanvas = $('#animationCanvas');
const animationEmpty = $('#animationEmpty');
const animationSourceSelect = $('#animationSourceSelect');
const animationSeek = $('#animationSeek');
const animationFrameLabel = $('#animationFrameLabel');
const animationBadge = $('#animationBadge');
const playAnimationBtn = $('#playAnimationBtn');
const prevFrameBtn = $('#prevFrameBtn');
const nextFrameBtn = $('#nextFrameBtn');
const previewFps = $('#previewFps');
const previewZoom = $('#previewZoom');
const previewBackground = $('#previewBackground');
const downloadFrameBtn = $('#downloadFrameBtn');

const DEFAULT_SLICE_SETTINGS = {
  rows: 4,
  cols: 4,
  order: 'row-major',
  edgeMode: 'crop',
  offsetX: 0,
  offsetY: 0,
  gapX: 0,
  gapY: 0,
  trim: false
};
const MAX_FRAMES_PER_IMAGE = 4096;
const MAX_TOTAL_FRAMES = 12000;

let sourceItems = [];
let sliceSets = [];
let activeSetIndex = -1;
let liveUpdateTimer = 0;
let sliceRunId = 0;
let animationFrameRequest = 0;
let animationPlaying = false;
let animationFrameIndex = 0;
let animationLastTime = 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readInteger(input, fallback, min, max) {
  const parsed = Number(input.value);
  const value = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  const safe = clamp(value, min, max);
  input.value = String(safe);
  return safe;
}

function readNumber(input, fallback, min, max) {
  const parsed = Number(input.value);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  const safe = clamp(value, min, max);
  input.value = String(safe);
  return safe;
}

function setStatus(message, tone) {
  statusEl.textContent = message;
  statusEl.className = 'status-line' + (tone ? ' ' + tone : '');
}

function setVideoStatus(message, tone) {
  videoStatus.textContent = message;
  videoStatus.className = 'status-line' + (tone ? ' ' + tone : '');
}

function nextPaint() {
  return new Promise(function(resolve) {
    window.requestAnimationFrame(resolve);
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) return Math.max(0, bytes || 0) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatSeconds(value) {
  return Number(value || 0).toFixed(2) + 's';
}

function getFileStem(name) {
  return String(name || 'frame')
    .replace(/\.[^/.]+$/, '')
    .replace(/[\\/:*?"<>|]/g, '_') || 'frame';
}

function paddedFrameNumber(index) {
  return String(index + 1).padStart(3, '0');
}

function frameFileName(set, index) {
  return getFileStem(set.name) + '_frame_' + paddedFrameNumber(index) + '.png';
}

function canvasThumbnail(canvas) {
  const maxSize = 96;
  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(canvas.width * scale));
  thumb.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = thumb.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL('image/png');
}

function imageToCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas;
}

function loadImageFile(file) {
  if (typeof window.createImageBitmap === 'function') {
    return window.createImageBitmap(file).then(function(bitmap) {
      const canvas = imageToCanvas(bitmap);
      if (typeof bitmap.close === 'function') bitmap.close();
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        canvas: canvas,
        thumbnail: canvasThumbnail(canvas)
      };
    });
  }

  return new Promise(function(resolve, reject) {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = function() {
      const canvas = imageToCanvas(image);
      URL.revokeObjectURL(objectUrl);
      resolve({
        name: file.name,
        size: file.size,
        type: file.type,
        canvas: canvas,
        thumbnail: canvasThumbnail(canvas)
      });
    };
    image.onerror = function(error) {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
    image.src = objectUrl;
  });
}

function isImageFile(file) {
  return Boolean(file && (file.type.indexOf('image/') === 0 || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)));
}

function renderSourceSummary() {
  sourceSummary.replaceChildren();
  if (sourceItems.length === 0) {
    sourceSummary.className = 'source-summary empty';
    const empty = document.createElement('span');
    empty.textContent = '还没有导入图片';
    sourceSummary.appendChild(empty);
    return;
  }

  sourceSummary.className = 'source-summary';
  sourceItems.forEach(function(item) {
    const chip = document.createElement('div');
    chip.className = 'source-item';

    const image = document.createElement('img');
    image.className = 'source-thumb';
    image.src = item.thumbnail;
    image.alt = '';

    const copy = document.createElement('div');
    copy.className = 'source-copy';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const info = document.createElement('span');
    info.textContent = item.canvas.width + ' × ' + item.canvas.height + ' px · ' + formatBytes(item.size);
    copy.appendChild(name);
    copy.appendChild(info);

    chip.appendChild(image);
    chip.appendChild(copy);
    sourceSummary.appendChild(chip);
  });
}

async function handleImageFiles(fileList) {
  const files = Array.from(fileList || []).filter(isImageFile);
  if (files.length === 0) {
    setStatus('请选择 PNG、JPG、WEBP 等图片文件。', 'error');
    return;
  }

  stopAnimation();
  sliceRunId += 1;
  setStatus('正在加载 ' + files.length + ' 张图片...');
  imageDropZone.classList.remove('dragging');

  try {
    sourceItems = await Promise.all(files.map(loadImageFile));
    sliceSets = [];
    activeSetIndex = -1;
    renderSourceSummary();
    renderResults();
    updateGridHint();
    setStatus(sourceItems.length + ' 张图片已就绪，可以开始切分。', 'success');
  } catch (error) {
    sourceItems = [];
    sliceSets = [];
    activeSetIndex = -1;
    renderSourceSummary();
    renderResults();
    setStatus('图片加载失败，请更换文件后重试。', 'error');
  }
}

imageInput.addEventListener('change', function() {
  handleImageFiles(imageInput.files);
});

['dragenter', 'dragover'].forEach(function(eventName) {
  imageDropZone.addEventListener(eventName, function(event) {
    event.preventDefault();
    imageDropZone.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach(function(eventName) {
  imageDropZone.addEventListener(eventName, function(event) {
    event.preventDefault();
    if (eventName === 'drop') handleImageFiles(event.dataTransfer.files);
    imageDropZone.classList.remove('dragging');
  });
});

function getSliceSettings() {
  return {
    rows: readInteger(rowsInput, DEFAULT_SLICE_SETTINGS.rows, 1, 64),
    cols: readInteger(colsInput, DEFAULT_SLICE_SETTINGS.cols, 1, 64),
    order: orderSelect.value === 'column-major' ? 'column-major' : 'row-major',
    edgeMode: edgeMode.value === 'include' ? 'include' : 'crop',
    offsetX: readInteger(offsetXInput, DEFAULT_SLICE_SETTINGS.offsetX, 0, 100000),
    offsetY: readInteger(offsetYInput, DEFAULT_SLICE_SETTINGS.offsetY, 0, 100000),
    gapX: readInteger(gapXInput, DEFAULT_SLICE_SETTINGS.gapX, 0, 100000),
    gapY: readInteger(gapYInput, DEFAULT_SLICE_SETTINGS.gapY, 0, 100000),
    trim: trimFramesToggle.checked
  };
}

function estimateGrid(canvas, settings) {
  const availableWidth = canvas.width - settings.offsetX - settings.gapX * (settings.cols - 1);
  const availableHeight = canvas.height - settings.offsetY - settings.gapY * (settings.rows - 1);
  return {
    cellWidth: Math.floor(availableWidth / settings.cols),
    cellHeight: Math.floor(availableHeight / settings.rows),
    availableWidth: availableWidth,
    availableHeight: availableHeight
  };
}

function updateGridHint() {
  if (sourceItems.length === 0) {
    gridHint.textContent = '导入图片后显示预计尺寸';
    return;
  }

  const settings = getSliceSettings();
  const metrics = estimateGrid(sourceItems[0].canvas, settings);
  const expected = settings.rows * settings.cols * sourceItems.length;
  if (metrics.cellWidth < 1 || metrics.cellHeight < 1) {
    gridHint.textContent = '偏移或间距过大，无法生成有效帧';
    return;
  }
  const suffix = settings.edgeMode === 'include' ? ' · 末行/列包含余量' : ' · 尺寸一致';
  gridHint.textContent = '约 ' + metrics.cellWidth + ' × ' + metrics.cellHeight + ' px · ' + expected + ' 帧' + suffix;
}

function trimTransparentArea(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] === 0) continue;
    const pixel = (index - 3) / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  if (maxX < 0 || maxY < 0) {
    return { canvas: canvas, trimmed: false };
  }

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  if (cropWidth === width && cropHeight === height) {
    return { canvas: canvas, trimmed: false };
  }

  const output = document.createElement('canvas');
  output.width = cropWidth;
  output.height = cropHeight;
  output.getContext('2d').drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return { canvas: output, trimmed: true };
}

function makeFrame(sourceCanvas, x, y, width, height, row, col, shouldTrim) {
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = width;
  frameCanvas.height = height;
  const context = frameCanvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(sourceCanvas, x, y, width, height, 0, 0, width, height);

  const result = shouldTrim ? trimTransparentArea(frameCanvas) : { canvas: frameCanvas, trimmed: false };
  return {
    canvas: result.canvas,
    row: row,
    col: col,
    originalWidth: width,
    originalHeight: height,
    trimmed: result.trimmed,
    url: ''
  };
}

async function sliceSource(item, settings, currentRunId) {
  const metrics = estimateGrid(item.canvas, settings);
  if (metrics.cellWidth < 1 || metrics.cellHeight < 1) {
    throw new Error('图集尺寸不足以容纳当前偏移和间距。');
  }

  const positions = [];
  if (settings.order === 'column-major') {
    for (let col = 0; col < settings.cols; col += 1) {
      for (let row = 0; row < settings.rows; row += 1) {
        positions.push({ row: row, col: col });
      }
    }
  } else {
    for (let row = 0; row < settings.rows; row += 1) {
      for (let col = 0; col < settings.cols; col += 1) {
        positions.push({ row: row, col: col });
      }
    }
  }

  const frames = [];
  for (let index = 0; index < positions.length; index += 1) {
    if (currentRunId !== sliceRunId) return null;
    const position = positions[index];
    const x = settings.offsetX + position.col * (metrics.cellWidth + settings.gapX);
    const y = settings.offsetY + position.row * (metrics.cellHeight + settings.gapY);
    let width = metrics.cellWidth;
    let height = metrics.cellHeight;

    if (settings.edgeMode === 'include' && position.col === settings.cols - 1) {
      width = item.canvas.width - x;
    }
    if (settings.edgeMode === 'include' && position.row === settings.rows - 1) {
      height = item.canvas.height - y;
    }
    if (width < 1 || height < 1) continue;

    frames.push(makeFrame(item.canvas, x, y, width, height, position.row + 1, position.col + 1, settings.trim));
    if (index > 0 && index % 80 === 0) await nextPaint();
  }

  return {
    name: item.name,
    sourceName: item.name,
    frames: frames,
    settings: settings,
    sourceWidth: item.canvas.width,
    sourceHeight: item.canvas.height
  };
}

function totalFrameCount() {
  return sliceSets.reduce(function(total, set) {
    return total + set.frames.length;
  }, 0);
}

async function sliceAll() {
  if (sourceItems.length === 0) {
    setStatus('请先导入图集。', 'error');
    return;
  }

  const settings = getSliceSettings();
  const expectedPerImage = settings.rows * settings.cols;
  const expectedTotal = expectedPerImage * sourceItems.length;
  if (expectedPerImage > MAX_FRAMES_PER_IMAGE || expectedTotal > MAX_TOTAL_FRAMES) {
    setStatus('帧数过多，请减少行列数量后再生成（总帧数上限 ' + MAX_TOTAL_FRAMES + '）。', 'error');
    return;
  }

  const currentRunId = ++sliceRunId;
  stopAnimation();
  sliceBtn.disabled = true;
  trimBtn.disabled = true;
  clearResultsBtn.disabled = true;
  const nextSets = [];

  try {
    for (let index = 0; index < sourceItems.length; index += 1) {
      setStatus('正在切分 ' + (index + 1) + '/' + sourceItems.length + '：' + sourceItems[index].name + '...');
      const result = await sliceSource(sourceItems[index], settings, currentRunId);
      if (!result || currentRunId !== sliceRunId) return;
      nextSets.push(result);
      await nextPaint();
    }

    sliceSets = nextSets;
    activeSetIndex = sliceSets.length ? 0 : -1;
    renderResults();
    populateAnimationSources();
    updateGridHint();
    setStatus('已完成 ' + sourceItems.length + ' 张图集的切分，共生成 ' + totalFrameCount() + ' 帧。', 'success');
  } catch (error) {
    setStatus(error.message || '切分失败，请检查参数。', 'error');
  } finally {
    if (currentRunId === sliceRunId) {
      sliceBtn.disabled = false;
      trimBtn.disabled = false;
      clearResultsBtn.disabled = false;
    }
  }
}

async function trimAllImages() {
  if (sourceItems.length === 0) {
    setStatus('请先导入图集。', 'error');
    return;
  }

  const currentRunId = ++sliceRunId;
  stopAnimation();
  sliceBtn.disabled = true;
  trimBtn.disabled = true;
  clearResultsBtn.disabled = true;
  const nextSets = [];
  let trimmedCount = 0;

  try {
    for (let index = 0; index < sourceItems.length; index += 1) {
      if (currentRunId !== sliceRunId) return;
      const item = sourceItems[index];
      const result = trimTransparentArea(item.canvas);
      if (result.trimmed) trimmedCount += 1;
      nextSets.push({
        name: item.name + ' · 修剪',
        sourceName: item.name,
        frames: [{
          canvas: result.canvas,
          row: 1,
          col: 1,
          originalWidth: item.canvas.width,
          originalHeight: item.canvas.height,
          trimmed: result.trimmed,
          url: ''
        }],
        settings: null,
        sourceWidth: item.canvas.width,
        sourceHeight: item.canvas.height
      });
      await nextPaint();
    }

    sliceSets = nextSets;
    activeSetIndex = sliceSets.length ? 0 : -1;
    renderResults();
    populateAnimationSources();
    setStatus('透明边框修剪完成：' + trimmedCount + '/' + sourceItems.length + ' 张图片有变化。', 'success');
  } finally {
    if (currentRunId === sliceRunId) {
      sliceBtn.disabled = false;
      trimBtn.disabled = false;
      clearResultsBtn.disabled = false;
    }
  }
}

function frameUrl(frame) {
  if (!frame.url) frame.url = frame.canvas.toDataURL('image/png');
  return frame.url;
}

function createResultsEmpty() {
  const empty = document.createElement('div');
  empty.className = 'results-empty';
  const icon = document.createElement('span');
  icon.className = 'results-empty-icon';
  icon.textContent = '▧';
  const title = document.createElement('strong');
  title.textContent = '还没有切分结果';
  const hint = document.createElement('span');
  hint.textContent = '导入图集后设置行列并生成序列帧。';
  empty.appendChild(icon);
  empty.appendChild(title);
  empty.appendChild(hint);
  return empty;
}

function createTile(set, setIndex, frame, frameIndex) {
  const tile = document.createElement('article');
  tile.className = 'tile';
  tile.tabIndex = 0;
  tile.setAttribute('role', 'button');
  tile.setAttribute('aria-label', '预览第 ' + (frameIndex + 1) + ' 帧');
  tile.dataset.setIndex = String(setIndex);
  tile.dataset.frameIndex = String(frameIndex);

  const media = document.createElement('div');
  media.className = 'tile-media';
  const image = document.createElement('img');
  image.src = frameUrl(frame);
  image.alt = set.name + ' 第 ' + (frameIndex + 1) + ' 帧';
  image.loading = 'lazy';
  media.appendChild(image);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const copy = document.createElement('div');
  copy.className = 'meta-copy';
  const label = document.createElement('strong');
  label.textContent = '#' + paddedFrameNumber(frameIndex) + ' · R' + frame.row + ' C' + frame.col;
  const dimensions = document.createElement('span');
  dimensions.textContent = frame.canvas.width + ' × ' + frame.canvas.height + ' px' + (frame.trimmed ? ' · 已修剪' : '');
  copy.appendChild(label);
  copy.appendChild(dimensions);

  const download = document.createElement('a');
  download.href = image.src;
  download.download = frameFileName(set, frameIndex);
  download.textContent = '下载';
  download.addEventListener('click', function(event) {
    event.stopPropagation();
  });

  meta.appendChild(copy);
  meta.appendChild(download);
  tile.appendChild(media);
  tile.appendChild(meta);
  tile.addEventListener('click', function() {
    selectAnimationFrame(setIndex, frameIndex, true);
  });
  tile.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectAnimationFrame(setIndex, frameIndex, true);
    }
  });
  return tile;
}

function renderResults() {
  preview.replaceChildren();
  if (sliceSets.length === 0) {
    preview.appendChild(createResultsEmpty());
    countBadge.textContent = '0 帧';
    headerFrameStat.textContent = '0';
    dimensionBadge.textContent = '—';
    resultHint.textContent = '点击任意帧即可在上方动画预览中定位。';
    clearAnimationPreview();
    return;
  }

  const fragment = document.createDocumentFragment();
  sliceSets.forEach(function(set, setIndex) {
    const group = document.createElement('section');
    group.className = 'batch-group';
    const title = document.createElement('h3');
    title.className = 'group-title';
    const name = document.createElement('span');
    name.textContent = set.name;
    const groupInfo = document.createElement('span');
    groupInfo.textContent = set.frames.length + ' 帧 · ' + set.sourceWidth + ' × ' + set.sourceHeight + ' px';
    title.appendChild(name);
    title.appendChild(groupInfo);

    const grid = document.createElement('div');
    grid.className = 'group-grid';
    set.frames.forEach(function(frame, frameIndex) {
      grid.appendChild(createTile(set, setIndex, frame, frameIndex));
    });
    group.appendChild(title);
    group.appendChild(grid);
    fragment.appendChild(group);
  });
  preview.appendChild(fragment);
  updateResultStats();
  if (activeSetIndex >= 0) setActiveAnimationSet(activeSetIndex, animationFrameIndex, false);
}

function updateResultStats() {
  const total = totalFrameCount();
  countBadge.textContent = total + ' 帧';
  headerFrameStat.textContent = String(total);
  if (activeSetIndex >= 0 && sliceSets[activeSetIndex]) {
    const set = sliceSets[activeSetIndex];
    const widths = set.frames.map(function(frame) { return frame.canvas.width; });
    const heights = set.frames.map(function(frame) { return frame.canvas.height; });
    const sameSize = widths.every(function(value) { return value === widths[0]; }) && heights.every(function(value) { return value === heights[0]; });
    dimensionBadge.textContent = sameSize ? widths[0] + ' × ' + heights[0] + ' px' : '混合尺寸';
    resultHint.textContent = sliceSets.length > 1 ? '共 ' + sliceSets.length + ' 组序列，使用右侧下拉框切换预览。' : '点击任意帧即可在上方动画预览中定位。';
  }
}

function syncSelectedTiles(scrollIntoView) {
  preview.querySelectorAll('.tile.selected').forEach(function(tile) {
    tile.classList.remove('selected');
    tile.removeAttribute('aria-current');
  });
  if (activeSetIndex < 0) return;
  const selected = preview.querySelector('.tile[data-set-index="' + activeSetIndex + '"][data-frame-index="' + animationFrameIndex + '"]');
  if (!selected) return;
  selected.classList.add('selected');
  selected.setAttribute('aria-current', 'true');
  if (scrollIntoView) selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function stopAnimation() {
  animationPlaying = false;
  animationLastTime = 0;
  if (animationFrameRequest) {
    window.cancelAnimationFrame(animationFrameRequest);
    animationFrameRequest = 0;
  }
  updatePlayButton();
}

function updatePlayButton() {
  playAnimationBtn.textContent = animationPlaying ? 'Ⅱ 暂停' : '▶ 播放';
}

function clearAnimationPreview() {
  stopAnimation();
  activeSetIndex = -1;
  animationFrameIndex = 0;
  animationSourceSelect.replaceChildren();
  const option = document.createElement('option');
  option.textContent = '暂无序列';
  animationSourceSelect.appendChild(option);
  animationSourceSelect.disabled = true;
  animationSeek.max = '0';
  animationSeek.value = '0';
  animationSeek.disabled = true;
  animationFrameLabel.textContent = '0 / 0';
  animationBadge.textContent = '未生成';
  playAnimationBtn.disabled = true;
  prevFrameBtn.disabled = true;
  nextFrameBtn.disabled = true;
  downloadFrameBtn.disabled = true;
  animationEmpty.hidden = false;
  animationCanvas.width = 320;
  animationCanvas.height = 240;
  animationCanvas.style.width = '320px';
  animationCanvas.style.height = '240px';
  animationCanvas.getContext('2d').clearRect(0, 0, 320, 240);
  updateResultStats();
}

function populateAnimationSources() {
  animationSourceSelect.replaceChildren();
  sliceSets.forEach(function(set, index) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = (index + 1) + '. ' + set.name + ' · ' + set.frames.length + ' 帧';
    animationSourceSelect.appendChild(option);
  });
  animationSourceSelect.disabled = sliceSets.length === 0;
  if (sliceSets.length === 0) {
    clearAnimationPreview();
    return;
  }
  const nextIndex = activeSetIndex >= 0 ? activeSetIndex : 0;
  setActiveAnimationSet(nextIndex, 0, false);
}

function setActiveAnimationSet(setIndex, frameIndex, scrollIntoView) {
  if (!sliceSets[setIndex]) {
    clearAnimationPreview();
    return;
  }
  activeSetIndex = setIndex;
  animationFrameIndex = clamp(frameIndex || 0, 0, Math.max(0, sliceSets[setIndex].frames.length - 1));
  animationSourceSelect.value = String(setIndex);
  animationSeek.max = String(Math.max(0, sliceSets[setIndex].frames.length - 1));
  animationSeek.value = String(animationFrameIndex);
  animationSeek.disabled = false;
  playAnimationBtn.disabled = false;
  prevFrameBtn.disabled = false;
  nextFrameBtn.disabled = false;
  downloadFrameBtn.disabled = false;
  animationBadge.textContent = sliceSets[setIndex].frames.length + ' 帧';
  renderAnimationFrame();
  syncSelectedTiles(scrollIntoView);
  updateResultStats();
}

function renderAnimationFrame() {
  const set = sliceSets[activeSetIndex];
  if (!set || set.frames.length === 0) {
    animationEmpty.hidden = false;
    return;
  }

  const frames = set.frames;
  const frame = frames[animationFrameIndex];
  const maxWidth = Math.max.apply(null, frames.map(function(item) { return item.canvas.width; }));
  const maxHeight = Math.max.apply(null, frames.map(function(item) { return item.canvas.height; }));
  animationCanvas.width = Math.max(1, maxWidth);
  animationCanvas.height = Math.max(1, maxHeight);
  const context = animationCanvas.getContext('2d');
  context.clearRect(0, 0, maxWidth, maxHeight);
  context.imageSmoothingEnabled = false;
  const x = Math.round((maxWidth - frame.canvas.width) / 2);
  const y = Math.round((maxHeight - frame.canvas.height) / 2);
  context.drawImage(frame.canvas, x, y);

  const zoom = clamp(Number(previewZoom.value) || 2, 1, 4);
  const fit = Math.min(1, 640 / Math.max(1, maxWidth), 420 / Math.max(1, maxHeight));
  const displayScale = fit * zoom;
  animationCanvas.style.width = Math.max(1, Math.round(maxWidth * displayScale)) + 'px';
  animationCanvas.style.height = Math.max(1, Math.round(maxHeight * displayScale)) + 'px';
  animationEmpty.hidden = true;
  animationSeek.value = String(animationFrameIndex);
  animationFrameLabel.textContent = (animationFrameIndex + 1) + ' / ' + frames.length + ' · ' + frame.canvas.width + ' × ' + frame.canvas.height + ' px';
  downloadFrameBtn.disabled = false;
  syncSelectedTiles(false);
}

function selectAnimationFrame(setIndex, frameIndex, scrollIntoView) {
  stopAnimation();
  setActiveAnimationSet(setIndex, frameIndex, Boolean(scrollIntoView));
}

function animationTick(timestamp) {
  if (!animationPlaying) return;
  const set = sliceSets[activeSetIndex];
  if (!set || set.frames.length === 0) {
    stopAnimation();
    return;
  }
  const fps = clamp(Number(previewFps.value) || 12, 1, 120);
  const interval = 1000 / fps;
  if (!animationLastTime) animationLastTime = timestamp;
  if (timestamp - animationLastTime >= interval) {
    const advance = Math.max(1, Math.floor((timestamp - animationLastTime) / interval));
    animationFrameIndex = (animationFrameIndex + advance) % set.frames.length;
    animationLastTime = timestamp;
    renderAnimationFrame();
  }
  animationFrameRequest = window.requestAnimationFrame(animationTick);
}

function setAnimationPlaying(playing) {
  if (playing && sliceSets.length === 0) return;
  animationPlaying = playing;
  animationLastTime = 0;
  updatePlayButton();
  if (animationPlaying) animationFrameRequest = window.requestAnimationFrame(animationTick);
}

function changeAnimationFrame(delta) {
  const set = sliceSets[activeSetIndex];
  if (!set || set.frames.length === 0) return;
  stopAnimation();
  animationFrameIndex = (animationFrameIndex + delta + set.frames.length) % set.frames.length;
  renderAnimationFrame();
  syncSelectedTiles(true);
}

function downloadCurrentFrame() {
  const set = sliceSets[activeSetIndex];
  if (!set || !set.frames[animationFrameIndex]) return;
  const link = document.createElement('a');
  link.href = frameUrl(set.frames[animationFrameIndex]);
  link.download = frameFileName(set, animationFrameIndex);
  link.click();
}

function queueLiveUpdate() {
  updateGridHint();
  if (!liveUpdateToggle.checked || sourceItems.length === 0) return;
  window.clearTimeout(liveUpdateTimer);
  liveUpdateTimer = window.setTimeout(function() {
    sliceAll();
  }, 180);
}

[rowsInput, colsInput, orderSelect, edgeMode, offsetXInput, offsetYInput, gapXInput, gapYInput, trimFramesToggle].forEach(function(control) {
  control.addEventListener('input', queueLiveUpdate);
  control.addEventListener('change', queueLiveUpdate);
});

resetSettingsBtn.addEventListener('click', function() {
  rowsInput.value = String(DEFAULT_SLICE_SETTINGS.rows);
  colsInput.value = String(DEFAULT_SLICE_SETTINGS.cols);
  orderSelect.value = DEFAULT_SLICE_SETTINGS.order;
  edgeMode.value = DEFAULT_SLICE_SETTINGS.edgeMode;
  offsetXInput.value = String(DEFAULT_SLICE_SETTINGS.offsetX);
  offsetYInput.value = String(DEFAULT_SLICE_SETTINGS.offsetY);
  gapXInput.value = String(DEFAULT_SLICE_SETTINGS.gapX);
  gapYInput.value = String(DEFAULT_SLICE_SETTINGS.gapY);
  trimFramesToggle.checked = DEFAULT_SLICE_SETTINGS.trim;
  queueLiveUpdate();
  setStatus('已恢复默认切分参数。');
});

sliceBtn.addEventListener('click', sliceAll);
trimBtn.addEventListener('click', trimAllImages);

clearResultsBtn.addEventListener('click', function() {
  sliceRunId += 1;
  sliceSets = [];
  clearAnimationPreview();
  renderResults();
  setStatus('结果已清空，可以重新生成。');
});

animationSourceSelect.addEventListener('change', function() {
  stopAnimation();
  setActiveAnimationSet(Number(animationSourceSelect.value), 0, false);
});

animationSeek.addEventListener('input', function() {
  stopAnimation();
  animationFrameIndex = Number(animationSeek.value) || 0;
  renderAnimationFrame();
});

playAnimationBtn.addEventListener('click', function() {
  setAnimationPlaying(!animationPlaying);
});

prevFrameBtn.addEventListener('click', function() {
  changeAnimationFrame(-1);
});

nextFrameBtn.addEventListener('click', function() {
  changeAnimationFrame(1);
});

previewFps.addEventListener('change', function() {
  readInteger(previewFps, 12, 1, 120);
});

previewZoom.addEventListener('change', renderAnimationFrame);
previewBackground.addEventListener('change', function() {
  animationStage.dataset.background = previewBackground.value;
});
downloadFrameBtn.addEventListener('click', downloadCurrentFrame);

const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const pages = Array.from(document.querySelectorAll('.page'));

function setActivePage(key) {
  pages.forEach(function(page) {
    page.classList.toggle('active', page.dataset.page === key);
  });
  navButtons.forEach(function(button) {
    button.classList.toggle('active', button.dataset.target === key);
  });
}

navButtons.forEach(function(button) {
  button.addEventListener('click', function() {
    setActivePage(button.dataset.target);
  });
});

const videoInput = $('#videoInput');
const videoDropZone = $('#videoDropZone');
const videoFileLabel = $('#videoFileLabel');
const videoStage = $('#videoStage');
const videoEmpty = $('#videoEmpty');
const videoPreview = $('#videoPreview');
const videoDurationBadge = $('#videoDurationBadge');
const videoFrameSizeBadge = $('#videoFrameSizeBadge');
const videoFormatBadge = $('#videoFormatBadge');
const videoCurrentTime = $('#videoCurrentTime');
const videoCodecHint = $('#videoCodecHint');
const startRange = $('#startRange');
const endRange = $('#endRange');
const startTime = $('#startTime');
const endTime = $('#endTime');
const segmentLengthLabel = $('#segmentLengthLabel');
const loopToggle = $('#loopToggle');
const setStartFromCurrentBtn = $('#setStartFromCurrentBtn');
const setEndFromCurrentBtn = $('#setEndFromCurrentBtn');
const resetSegmentBtn = $('#resetSegmentBtn');
const playSegmentBtn = $('#playSegmentBtn');
const sampleModeSelect = $('#sampleMode');
const frameCountInput = $('#frameCount');
const sampleFpsInput = $('#sampleFps');
const outputScaleSelect = $('#outputScale');
const sampleStepLabel = $('#sampleStepLabel');
const extractBtn = $('#extractBtn');
const clearFramesBtn = $('#clearFramesBtn');
const videoStatus = $('#videoStatus');
const framePreview = $('#framePreview');
const frameBadge = $('#frameBadge');
const videoOutputHint = $('#videoOutputHint');
const outputResolution = $('#outputResolution');
const sampleSummary = $('#sampleSummary');
const downloadAllFramesBtn = $('#downloadAllFramesBtn');
const chromaBtn = $('#chromaBtn');
const keyColor = $('#keyColor');
const keyTolerance = $('#keyTolerance');
const keyFeather = $('#keyFeather');

const MIN_SEGMENT_LENGTH = 0.01;
let videoObjectUrl = '';
let videoFile = null;
let segmentStart = 0;
let segmentEnd = 0;
let videoFrames = [];
let activeVideoFrameIndex = -1;
let videoCaptureRunId = 0;
let videoProcessing = false;

function videoDuration() {
  return Number.isFinite(videoPreview.duration) ? Math.max(0, videoPreview.duration) : 0;
}

function formatTimecode(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = (safe % 60).toFixed(2).padStart(5, '0');
  return String(minutes).padStart(2, '0') + ':' + remainder;
}

function getVideoFormat(file) {
  const type = file && file.type ? file.type.split('/')[1] : '';
  if (type) return type.toUpperCase();
  const match = file && file.name ? file.name.match(/\.([^.]+)$/) : null;
  return match ? match[1].toUpperCase() : 'VIDEO';
}

function updateCurrentTimeLabel() {
  videoCurrentTime.textContent = formatTimecode(videoPreview.currentTime);
}

function updateSegmentLabels() {
  startTime.textContent = formatSeconds(segmentStart);
  endTime.textContent = formatSeconds(segmentEnd);
  segmentLengthLabel.textContent = formatSeconds(Math.max(0, segmentEnd - segmentStart));
  updateSamplingControls();
}

function updateSegmentInputs() {
  startRange.value = String(segmentStart);
  endRange.value = String(segmentEnd);
  updateSegmentLabels();
}

function applySegment(start, end) {
  const duration = videoDuration();
  if (!duration) {
    segmentStart = 0;
    segmentEnd = 0;
    updateSegmentInputs();
    return;
  }
  const minimum = Math.min(MIN_SEGMENT_LENGTH, duration);
  segmentStart = clamp(Number(start) || 0, 0, Math.max(0, duration - minimum));
  segmentEnd = clamp(Number(end) || duration, segmentStart + minimum, duration);
  updateSegmentInputs();
}

function updateSamplingControls() {
  const length = Math.max(0, segmentEnd - segmentStart);
  const fpsMode = sampleModeSelect.value === 'fps';
  const fps = readInteger(sampleFpsInput, 12, 1, 120);
  sampleFpsInput.disabled = !fpsMode;
  frameCountInput.disabled = fpsMode;

  let count;
  if (fpsMode) {
    count = clamp(Math.floor(length * fps) + (length > 0 ? 1 : 0), 1, 2000);
    frameCountInput.value = String(count);
  } else {
    count = readInteger(frameCountInput, 1, 1, 2000);
  }

  if (!length) {
    sampleStepLabel.textContent = '选择有效片段后显示采样计划';
    return;
  }
  const interval = count > 1 ? length / (count - 1) : length;
  sampleStepLabel.textContent = count + ' 帧 · 每 ' + interval.toFixed(3) + ' 秒采样';
}

function updateVideoMetadata() {
  const duration = videoDuration();
  if (!duration || !videoPreview.videoWidth) return;
  videoDurationBadge.textContent = formatSeconds(duration);
  videoFrameSizeBadge.textContent = videoPreview.videoWidth + ' × ' + videoPreview.videoHeight;
  videoFormatBadge.textContent = getVideoFormat(videoFile);
  videoCodecHint.textContent = 'Canvas 本地处理';
}

function setDefaultFrameCount() {
  const length = Math.max(0, segmentEnd - segmentStart);
  frameCountInput.value = String(Math.max(1, Math.min(2000, Math.round(length * 30))));
  updateSamplingControls();
}

function updateVideoResultStats() {
  frameBadge.textContent = videoFrames.length + ' 帧';
  downloadAllFramesBtn.disabled = videoFrames.length === 0 || videoProcessing;
  chromaBtn.disabled = videoFrames.length === 0 || videoProcessing;
  if (videoFrames.length === 0) {
    outputResolution.textContent = '—';
    sampleSummary.textContent = '—';
    videoOutputHint.textContent = '生成后可点击帧卡片定位视频时间。';
    return;
  }
  const first = videoFrames[0];
  outputResolution.textContent = first.canvas.width + ' × ' + first.canvas.height;
  sampleSummary.textContent = videoFrames.length + ' 帧 · ' + formatSeconds(segmentStart) + '–' + formatSeconds(segmentEnd);
  videoOutputHint.textContent = '点击帧卡片或“定位”按钮，可跳转到该帧在视频中的时间。';
}

function createVideoEmpty() {
  const empty = document.createElement('div');
  empty.className = 'results-empty';
  const icon = document.createElement('span');
  icon.className = 'results-empty-icon';
  icon.textContent = '▧';
  const title = document.createElement('strong');
  title.textContent = '还没有提取结果';
  const hint = document.createElement('span');
  hint.textContent = '选择视频、片段和采样方式后开始提取。';
  empty.appendChild(icon);
  empty.appendChild(title);
  empty.appendChild(hint);
  return empty;
}

function syncActiveVideoFrameCard() {
  framePreview.querySelectorAll('.frame-card').forEach(function(card, index) {
    card.classList.toggle('selected', index === activeVideoFrameIndex);
  });
}

function selectVideoFrame(index) {
  const frame = videoFrames[index];
  if (!frame) return;
  activeVideoFrameIndex = index;
  if (videoPreview.src) videoPreview.currentTime = frame.time;
  syncActiveVideoFrameCard();
  videoOutputHint.textContent = '已定位到第 ' + (index + 1) + ' 帧 · ' + formatSeconds(frame.time) + '。';
}

function renderVideoFrames() {
  framePreview.replaceChildren();
  if (videoFrames.length === 0) {
    framePreview.appendChild(createVideoEmpty());
    updateVideoResultStats();
    return;
  }

  const fragment = document.createDocumentFragment();
  videoFrames.forEach(function(frame, index) {
    const card = document.createElement('article');
    card.className = 'frame-card' + (index === activeVideoFrameIndex ? ' selected' : '');
    card.dataset.frameIndex = String(index);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const image = document.createElement('img');
    image.src = frame.url;
    image.alt = '视频第 ' + (index + 1) + ' 帧';
    image.loading = 'lazy';

    const meta = document.createElement('div');
    meta.className = 'frame-meta';
    const label = document.createElement('div');
    label.textContent = '#' + paddedFrameNumber(index) + ' · ' + formatSeconds(frame.time) + ' · ' + frame.canvas.width + ' × ' + frame.canvas.height + ' px';
    const actions = document.createElement('div');
    actions.className = 'frame-actions';

    const locate = document.createElement('button');
    locate.className = 'frame-locate-btn';
    locate.type = 'button';
    locate.textContent = '定位';
    locate.addEventListener('click', function(event) {
      event.stopPropagation();
      selectVideoFrame(index);
    });

    const download = document.createElement('a');
    download.textContent = '下载';
    download.href = frame.url;
    download.download = 'video-frame-' + paddedFrameNumber(index) + '.png';
    download.addEventListener('click', function(event) {
      event.stopPropagation();
    });

    actions.appendChild(locate);
    actions.appendChild(download);
    meta.appendChild(label);
    meta.appendChild(actions);
    card.appendChild(image);
    card.appendChild(meta);
    card.addEventListener('click', function() {
      selectVideoFrame(index);
    });
    card.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectVideoFrame(index);
      }
    });
    fragment.appendChild(card);
  });
  framePreview.appendChild(fragment);
  updateVideoResultStats();
}

function resetVideoFrames() {
  videoFrames = [];
  activeVideoFrameIndex = -1;
  renderVideoFrames();
}

function setVideoFile(file) {
  if (!file || (file.type && file.type.indexOf('video/') !== 0 && !/\.(mp4|webm|mov|m4v|ogg|ogv|avi)$/i.test(file.name))) {
    setVideoStatus('请选择 MP4、WebM、MOV 等视频文件。', 'error');
    return;
  }
  videoCaptureRunId += 1;
  videoProcessing = false;
  videoFile = file;
  if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
  videoObjectUrl = URL.createObjectURL(file);
  videoFileLabel.textContent = file.name;
  videoFormatBadge.textContent = getVideoFormat(file);
  videoDurationBadge.textContent = '—';
  videoFrameSizeBadge.textContent = '—';
  videoCodecHint.textContent = '读取媒体信息...';
  videoEmpty.hidden = false;
  videoStage.classList.remove('ready');
  videoPreview.src = videoObjectUrl;
  resetVideoFrames();
  setVideoStatus('正在读取视频信息...');
  videoPreview.load();
}

function handleVideoFileList(fileList) {
  const file = Array.from(fileList || []).find(function(item) {
    return item && (item.type.indexOf('video/') === 0 || /\.(mp4|webm|mov|m4v|ogg|ogv|avi)$/i.test(item.name));
  });
  if (file) setVideoFile(file);
  else setVideoStatus('没有找到可识别的视频文件。', 'error');
  videoDropZone.classList.remove('dragging');
}

videoInput.addEventListener('change', function() {
  handleVideoFileList(videoInput.files);
});

['dragenter', 'dragover'].forEach(function(eventName) {
  videoDropZone.addEventListener(eventName, function(event) {
    event.preventDefault();
    videoDropZone.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach(function(eventName) {
  videoDropZone.addEventListener(eventName, function(event) {
    event.preventDefault();
    if (eventName === 'drop') handleVideoFileList(event.dataTransfer.files);
    if (eventName === 'dragleave') videoDropZone.classList.remove('dragging');
  });
});

videoPreview.addEventListener('loadedmetadata', function() {
  const duration = videoDuration();
  if (duration <= 0) {
    updateCurrentTimeLabel();
    return;
  }
  segmentStart = 0;
  segmentEnd = duration;
  startRange.min = '0';
  endRange.min = '0';
  startRange.max = String(segmentEnd);
  endRange.max = String(segmentEnd);
  startRange.step = '0.01';
  endRange.step = '0.01';
  updateSegmentInputs();
  setDefaultFrameCount();
  updateVideoMetadata();
  videoEmpty.hidden = true;
  videoStage.classList.add('ready');
  setVideoStatus('视频就绪 · ' + formatSeconds(duration) + ' · ' + videoPreview.videoWidth + ' × ' + videoPreview.videoHeight, 'success');
});

function refreshVideoState() {
  const duration = videoDuration();
  if (duration <= 0) return;
  if (segmentEnd <= 0 || Number(endRange.max) <= 0) {
    segmentStart = 0;
    segmentEnd = duration;
    startRange.min = '0';
    endRange.min = '0';
    startRange.max = String(duration);
    endRange.max = String(duration);
    updateSegmentInputs();
    setDefaultFrameCount();
  }
  updateVideoMetadata();
  videoEmpty.hidden = true;
  videoStage.classList.add('ready');
  if (!videoProcessing && videoFrames.length === 0) {
    setVideoStatus('视频就绪 · ' + formatSeconds(duration) + ' · ' + videoPreview.videoWidth + ' × ' + videoPreview.videoHeight, 'success');
  }
}

videoPreview.addEventListener('loadeddata', function() {
  refreshVideoState();
  updateCurrentTimeLabel();
});

videoPreview.addEventListener('durationchange', refreshVideoState);
videoPreview.addEventListener('canplay', refreshVideoState);

videoPreview.addEventListener('timeupdate', function() {
  updateCurrentTimeLabel();
  if (!loopToggle.checked || videoProcessing || videoPreview.paused || segmentEnd <= segmentStart) return;
  if (videoPreview.currentTime >= segmentEnd - 0.035) videoPreview.currentTime = segmentStart;
});

videoPreview.addEventListener('play', function() {
  playSegmentBtn.textContent = 'Ⅱ 暂停片段';
});

videoPreview.addEventListener('pause', function() {
  playSegmentBtn.textContent = '▶ 播放片段';
});

videoPreview.addEventListener('ended', function() {
  playSegmentBtn.textContent = '▶ 播放片段';
});

startRange.addEventListener('input', function() {
  const duration = videoDuration();
  const minimum = Math.min(MIN_SEGMENT_LENGTH, duration || MIN_SEGMENT_LENGTH);
  segmentStart = clamp(Number(startRange.value) || 0, 0, Math.max(0, duration - minimum));
  if (segmentStart >= segmentEnd) segmentEnd = Math.min(duration, segmentStart + minimum);
  updateSegmentInputs();
});

endRange.addEventListener('input', function() {
  const duration = videoDuration();
  const minimum = Math.min(MIN_SEGMENT_LENGTH, duration || MIN_SEGMENT_LENGTH);
  segmentEnd = clamp(Number(endRange.value) || 0, Math.min(duration, segmentStart + minimum), duration);
  if (segmentEnd <= segmentStart) segmentStart = Math.max(0, segmentEnd - minimum);
  updateSegmentInputs();
});

setStartFromCurrentBtn.addEventListener('click', function() {
  if (!videoPreview.src || !videoDuration()) {
    setVideoStatus('请先选择视频。', 'error');
    return;
  }
  const minimum = Math.min(MIN_SEGMENT_LENGTH, videoDuration());
  segmentStart = clamp(videoPreview.currentTime, 0, Math.max(0, videoDuration() - minimum));
  if (segmentStart >= segmentEnd) segmentEnd = Math.min(videoDuration(), segmentStart + minimum);
  updateSegmentInputs();
});

setEndFromCurrentBtn.addEventListener('click', function() {
  if (!videoPreview.src || !videoDuration()) {
    setVideoStatus('请先选择视频。', 'error');
    return;
  }
  const minimum = Math.min(MIN_SEGMENT_LENGTH, videoDuration());
  segmentEnd = clamp(videoPreview.currentTime, Math.min(videoDuration(), segmentStart + minimum), videoDuration());
  if (segmentEnd <= segmentStart) segmentStart = Math.max(0, segmentEnd - minimum);
  updateSegmentInputs();
});

resetSegmentBtn.addEventListener('click', function() {
  applySegment(0, videoDuration());
});

playSegmentBtn.addEventListener('click', async function() {
  if (!videoPreview.src || !videoDuration()) {
    setVideoStatus('请先选择视频。', 'error');
    return;
  }
  if (!videoPreview.paused && videoPreview.currentTime >= segmentStart && videoPreview.currentTime < segmentEnd - 0.035) {
    videoPreview.pause();
    return;
  }
  if (videoPreview.currentTime < segmentStart || videoPreview.currentTime >= segmentEnd - 0.035) videoPreview.currentTime = segmentStart;
  try {
    await videoPreview.play();
  } catch (error) {
    setVideoStatus('浏览器阻止了自动播放，请使用视频控件开始播放。', 'error');
  }
});

sampleModeSelect.addEventListener('change', updateSamplingControls);
sampleFpsInput.addEventListener('input', updateSamplingControls);
sampleFpsInput.addEventListener('change', updateSamplingControls);
frameCountInput.addEventListener('input', updateSamplingControls);
frameCountInput.addEventListener('change', updateSamplingControls);
outputScaleSelect.addEventListener('change', function() {
  if (videoFrames.length) setVideoStatus('输出尺寸已改变，请重新提取以应用。');
});

function seekVideo(targetTime) {
  return new Promise(function(resolve) {
    const safeTime = clamp(targetTime, 0, Math.max(0, videoDuration() - 0.001));
    let finished = false;
    let timeoutId = 0;
    const finish = function() {
      if (finished) return;
      finished = true;
      videoPreview.removeEventListener('seeked', finish);
      window.clearTimeout(timeoutId);
      resolve();
    };
    timeoutId = window.setTimeout(finish, 1800);
    videoPreview.addEventListener('seeked', finish, { once: true });
    if (Math.abs(videoPreview.currentTime - safeTime) < 0.001) window.requestAnimationFrame(finish);
    else videoPreview.currentTime = safeTime;
  });
}

async function waitForVideoFrame() {
  if (typeof videoPreview.requestVideoFrameCallback === 'function') {
    await new Promise(function(resolve) {
      let finished = false;
      let timeoutId = 0;
      const finish = function() {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeoutId);
        resolve();
      };
      timeoutId = window.setTimeout(finish, 500);
      videoPreview.requestVideoFrameCallback(finish);
    });
  } else {
    await nextPaint();
  }
}

async function captureVideoFrames(frameCount, currentRunId) {
  const scale = clamp(Number(outputScaleSelect.value) || 1, 0.25, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(videoPreview.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(videoPreview.videoHeight * scale));
  const context = canvas.getContext('2d');
  const length = Math.max(MIN_SEGMENT_LENGTH, segmentEnd - segmentStart);
  const step = frameCount > 1 ? length / (frameCount - 1) : 0;
  const output = [];

  for (let index = 0; index < frameCount; index += 1) {
    if (currentRunId !== videoCaptureRunId) throw new Error('视频任务已取消。');
    const time = Math.min(segmentEnd, segmentStart + step * index);
    setVideoStatus('正在提取 ' + (index + 1) + '/' + frameCount + ' · ' + formatSeconds(time));
    await seekVideo(time);
    await waitForVideoFrame();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(videoPreview, 0, 0, canvas.width, canvas.height);
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = canvas.width;
    frameCanvas.height = canvas.height;
    frameCanvas.getContext('2d').drawImage(canvas, 0, 0);
    output.push({ canvas: frameCanvas, url: frameCanvas.toDataURL('image/png'), time: time });
    if (index > 0 && index % 16 === 0) await nextPaint();
  }
  return output;
}

extractBtn.addEventListener('click', async function() {
  if (!videoPreview.src || !videoPreview.videoWidth) {
    setVideoStatus('请先选择一个可播放的视频。', 'error');
    return;
  }
  updateSamplingControls();
  const frameCount = readInteger(frameCountInput, 1, 1, 2000);
  if (segmentEnd - segmentStart < MIN_SEGMENT_LENGTH) {
    setVideoStatus('片段太短，请把结束时间调晚一些。', 'error');
    return;
  }
  const currentRunId = ++videoCaptureRunId;
  videoProcessing = true;
  videoPreview.pause();
  extractBtn.disabled = true;
  clearFramesBtn.disabled = true;
  chromaBtn.disabled = true;
  downloadAllFramesBtn.disabled = true;
  try {
    videoFrames = await captureVideoFrames(frameCount, currentRunId);
    activeVideoFrameIndex = videoFrames.length ? 0 : -1;
    renderVideoFrames();
    setVideoStatus('已提取 ' + videoFrames.length + ' 帧 · 输出 ' + outputResolution.textContent + '。', 'success');
  } catch (error) {
    if (currentRunId === videoCaptureRunId) setVideoStatus(error.message === '视频任务已取消。' ? '视频任务已取消。' : '视频帧提取失败，请确认浏览器支持该视频格式。', 'error');
  } finally {
    if (currentRunId === videoCaptureRunId) {
      videoProcessing = false;
      extractBtn.disabled = false;
      clearFramesBtn.disabled = false;
      chromaBtn.disabled = videoFrames.length === 0;
      downloadAllFramesBtn.disabled = videoFrames.length === 0;
    }
  }
});

clearFramesBtn.addEventListener('click', function() {
  videoCaptureRunId += 1;
  videoProcessing = false;
  resetVideoFrames();
  extractBtn.disabled = false;
  chromaBtn.disabled = true;
  setVideoStatus('视频帧已清空。');
});

function parseColor(colorValue) {
  const hex = String(colorValue || '').replace('#', '').trim();
  if (hex.length !== 6) return { r: 0, g: 255, b: 0 };
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

function applyChromaKeyToCanvas(canvas, key, tolerance, feather) {
  const context = canvas.getContext('2d');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const softEdge = Math.max(0, feather);
  const softLimit = tolerance + softEdge;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 0) continue;
    const redDistance = data[index] - key.r;
    const greenDistance = data[index + 1] - key.g;
    const blueDistance = data[index + 2] - key.b;
    const distance = Math.sqrt(redDistance * redDistance + greenDistance * greenDistance + blueDistance * blueDistance);
    if (distance <= tolerance) {
      data[index + 3] = 0;
    } else if (softEdge > 0 && distance < softLimit) {
      const blend = (distance - tolerance) / (softLimit - tolerance);
      data[index + 3] = Math.round(alpha * blend);
    }
  }
  context.putImageData(imageData, 0, 0);
}

chromaBtn.addEventListener('click', function() {
  if (videoFrames.length === 0) {
    setVideoStatus('请先提取视频帧。', 'error');
    return;
  }
  const key = parseColor(keyColor.value);
  const tolerance = readInteger(keyTolerance, 60, 0, 255);
  const feather = readInteger(keyFeather, 24, 0, 120);
  const targetRunId = videoCaptureRunId;
  const targetFrames = videoFrames;
  setVideoStatus('正在应用色键透明...');
  chromaBtn.disabled = true;
  window.setTimeout(function() {
    if (targetRunId !== videoCaptureRunId || targetFrames !== videoFrames) return;
    targetFrames.forEach(function(frame) {
      applyChromaKeyToCanvas(frame.canvas, key, tolerance, feather);
      frame.url = frame.canvas.toDataURL('image/png');
    });
    renderVideoFrames();
    chromaBtn.disabled = false;
    setVideoStatus('色键透明已应用。', 'success');
  }, 0);
});

downloadAllFramesBtn.addEventListener('click', async function() {
  if (videoFrames.length === 0) return;
  downloadAllFramesBtn.disabled = true;
  setVideoStatus('正在准备下载 ' + videoFrames.length + ' 帧...');
  for (let index = 0; index < videoFrames.length; index += 1) {
    const link = document.createElement('a');
    link.href = videoFrames[index].url;
    link.download = 'video-frame-' + paddedFrameNumber(index) + '.png';
    link.click();
    await new Promise(function(resolve) { window.setTimeout(resolve, 70); });
  }
  downloadAllFramesBtn.disabled = false;
  setVideoStatus('已发起 ' + videoFrames.length + ' 个 PNG 下载。', 'success');
});

window.addEventListener('keydown', function(event) {
  const activeTag = document.activeElement && document.activeElement.tagName;
  if (activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'TEXTAREA') return;
  if (!sliceSets.length || !$('.page[data-page="slicer"]').classList.contains('active')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    setAnimationPlaying(!animationPlaying);
  } else if (event.key === 'ArrowLeft') {
    changeAnimationFrame(-1);
  } else if (event.key === 'ArrowRight') {
    changeAnimationFrame(1);
  }
});

window.addEventListener('beforeunload', function() {
  if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
});

renderSourceSummary();
renderResults();
renderVideoFrames();
animationStage.dataset.background = previewBackground.value;
