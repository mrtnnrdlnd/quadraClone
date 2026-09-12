class Renderer {
  constructor() {
    this.ctx = document.getElementById('board').getContext('2d');
    this.nextCtx = document.getElementById('nextCanvas').getContext('2d');
    this.ui = {
      score: document.getElementById('score'),
      lines: document.getElementById('lines'),
      level: document.getElementById('level')
    };
  }

  drawBlock(ctx, px, py, size, color, edges) {
    ctx.fillStyle = color;
    ctx.fillRect(px, py, size, size);
    if (edges.top) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(px, py, size, 2); }
    if (edges.left) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(px, py, 2, size); }
    if (edges.bottom) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px, py + size - 2, size, 2); }
    if (edges.right) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px + size - 2, py, 2, size); }
  }

  drawMiniPieces() {
    const bs = CONFIG.BLOCK_SIZE;
    Object.keys(CONFIG.BASE_SHAPES).forEach(type => {
      const cvs = document.getElementById(`prev-${type}`);
      if (!cvs) return;
      const mCtx = cvs.getContext('2d');
      const matrix = CONFIG.BASE_SHAPES[type];
      let minR = matrix.length, maxR = 0, minC = matrix[0].length, maxC = 0;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c] !== 0) {
            minR = Math.min(minR, r); maxR = Math.max(maxR, r);
            minC = Math.min(minC, c); maxC = Math.max(maxC, c);
          }
        }
      }
      cvs.width = (maxC - minC + 1) * bs;
      cvs.height = (maxR - minR + 1) * bs;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c] !== 0) {
            this.drawBlock(mCtx, (c - minC) * bs, (r - minR) * bs, bs, CONFIG.COLORS[type], {
              top: r===0 || matrix[r-1][c]===0,
              bottom: r===matrix.length-1 || matrix[r+1][c]===0,
              left: c===0 || matrix[r][c-1]===0,
              right: c===matrix[r].length-1 || matrix[r][c+1]===0
            });
          }
        }
      }
    });
  }

  updateUI(score, lines, level) {
    this.ui.score.innerText = score;
    this.ui.lines.innerText = lines;
    this.ui.level.innerText = level;
  }

  updateBPM(bpm) {
    const el = document.getElementById('bpm');
    if (el) el.innerText = bpm;
  }

  updateStat(prefix, key, value) {
    const el = document.getElementById(`${prefix}-${key}`);
    if(el) el.innerText = value;
  }

  // Render a small preview of a piece (used for button icons)
  renderButtonPreview(canvas, pieceType, rot) {
    if (!canvas || !pieceType) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Preferred CSS size: use clientWidth/clientHeight so we don't pick up transform scaling
    let cssW = canvas.clientWidth || parseFloat(canvas.style.width) || (canvas.width ? canvas.width / dpr : 36);
    let cssH = canvas.clientHeight || parseFloat(canvas.style.height) || (canvas.height ? canvas.height / dpr : 36);
    cssW = Math.max(1, Math.round(cssW));
    cssH = Math.max(1, Math.round(cssH));

    // Determine buffer size in device pixels, clamp to safe maximum
    const MAX_CANVAS_PX = 2048;
    let bufW = Math.round(cssW * dpr);
    let bufH = Math.round(cssH * dpr);
    if (!bufW || !bufH) { bufW = bufH = 64; }
    bufW = Math.max(1, Math.min(bufW, MAX_CANVAS_PX));
    bufH = Math.max(1, Math.min(bufH, MAX_CANVAS_PX));

    canvas.width = bufW;
    canvas.height = bufH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    // Map CSS units to buffer pixels
    const scaleX = bufW / Math.max(1, cssW);
    const scaleY = bufH / Math.max(1, cssH);
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    // Clear in CSS coordinate space (transform will map to buffer)
    ctx.clearRect(0, 0, cssW, cssH);

    const matrix = (PRECALC_ROTATIONS[pieceType] && PRECALC_ROTATIONS[pieceType][rot]) ? PRECALC_ROTATIONS[pieceType][rot] : CONFIG.BASE_SHAPES[pieceType];
    if (!matrix) return;

    // Compute bounding box of occupied cells
    let minR = matrix.length, maxR = 0, minC = matrix[0].length, maxC = 0;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          minR = Math.min(minR, r); maxR = Math.max(maxR, r);
          minC = Math.min(minC, c); maxC = Math.max(maxC, c);
        }
      }
    }
    const cols = Math.max(1, maxC - minC + 1);
    const rows = Math.max(1, maxR - minR + 1);

    // Determine block size with padding (in CSS units)
    const padding = Math.floor(Math.min(cssW, cssH) * 0.12);
    const blockSize = Math.max(1, Math.floor(Math.min((cssW - padding * 2) / cols, (cssH - padding * 2) / rows)));
    const ox = Math.round((cssW - blockSize * cols) / 2);
    const oy = Math.round((cssH - blockSize * rows) / 2);

    // Draw blocks using ghost color so they look like a shadow
    const color = CONFIG.COLORS.GHOST;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          const drawX = ox + (c - minC) * blockSize;
          const drawY = oy + (r - minR) * blockSize;
          const edges = {
            top: r === 0 || matrix[r-1][c] === 0,
            bottom: r === matrix.length-1 || matrix[r+1][c] === 0,
            left: c === 0 || matrix[r][c-1] === 0,
            right: c === matrix[r].length-1 || matrix[r][c+1] === 0
          };
          this.drawBlock(ctx, drawX, drawY, blockSize, color, edges);
        }
      }
    }
  }

  draw(state, engine) {
    this.ctx.clearRect(0, 0, 240, 480);
    const { grid, isFlashing, flashTimer, pendingRows, isCascading, fragments, current } = state;
    const BS = CONFIG.BLOCK_SIZE;

    this.ctx.beginPath();
    for (let r = 0; r < CONFIG.ROWS; r++) {
      for (let c = 0; c < CONFIG.COLS; c++) {
        if (grid[r][c] !== 0) {
          const id = grid[r][c].id;
          const edges = {
            top: r===0 || grid[r-1][c].id !== id, bottom: r===CONFIG.ROWS-1 || grid[r+1][c].id !== id,
            left: c===0 || grid[r][c-1].id !== id, right: c===CONFIG.COLS-1 || grid[r][c+1].id !== id
          };
          this.drawBlock(this.ctx, c * BS, r * BS, BS, CONFIG.COLORS[grid[r][c].type], edges);
        }
      }
    }
    this.ctx.stroke();

    if (isFlashing && (Math.floor(flashTimer / 25) % 2 === 0)) {
      this.ctx.fillStyle = '#ffffff';
      pendingRows.forEach(r => this.ctx.fillRect(0, r * BS, 240, BS));
    }

    if (isCascading) {
      fragments.forEach(f => {
        if (!f.done) f.blocks.forEach(b => this.drawBlock(this.ctx, b.c * BS, b.r * BS + f.cy, BS, CONFIG.COLORS[f.type], b.edges));
      });
    }

    if (current && !isCascading && !isFlashing) {
      const gy = current.ghostY !== undefined ? current.ghostY : current.y;
      const matrix = PRECALC_ROTATIONS[current.type][current.rot];
      const isBlocked = engine.checkCollision(current.x, current.y + 1, current.rot, current.type);
      const smoothOffset = isBlocked ? 0 : Math.min(1, state.dropCounter / engine.getDropInterval());

      for(let g = 0; g < 2; g++) {
        const isGhost = g === 0;
        const pixelYOffset = isGhost ? gy * BS : Math.round((current.y + smoothOffset) * BS);
        const color = isGhost ? CONFIG.COLORS.GHOST : CONFIG.COLORS[current.type];

        for (let r = 0; r < matrix.length; r++) {
          for (let c = 0; c < matrix[r].length; c++) {
            // Always draw piece blocks even if they're above the visible grid so the piece
            // appears whole while entering (canvas will clip negative coordinates).
            if (matrix[r][c] !== 0) {
              this.drawBlock(this.ctx, (current.x + c) * BS, pixelYOffset + r * BS, BS, color, {
                top: r===0 || matrix[r-1][c]===0, bottom: r===matrix.length-1 || matrix[r+1][c]===0,
                left: c===0 || matrix[r][c-1]===0, right: c===matrix[r].length-1 || matrix[r][c+1]===0
              });
            }
          }
        }
      }
    }

    this.nextCtx.clearRect(0, 0, 240, 60);
    const sizes = [18, 11, 5];
    const xCenters = [120, 60, 25];

    state.nextQueue.forEach((piece, index) => {
      const matrix = PRECALC_ROTATIONS[piece.type][0];
      const bSize = sizes[index];
      let minR = matrix.length, maxR = 0, minC = matrix[0].length, maxC = 0;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c] !== 0) {
            minR = Math.min(minR, r); maxR = Math.max(maxR, r);
            minC = Math.min(minC, c); maxC = Math.max(maxC, c);
          }
        }
      }
      const pieceWidth = (maxC - minC + 1) * bSize;
      const pieceHeight = (maxR - minR + 1) * bSize;
      const ox = xCenters[index] - pieceWidth / 2;
      const oy = (60 - pieceHeight) / 2;

      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c] !== 0) {
            this.drawBlock(this.nextCtx, ox + (c - minC) * bSize, oy + (r - minR) * bSize, bSize, CONFIG.COLORS[piece.type], {
              top: r===0 || matrix[r-1][c]===0,
              bottom: r===matrix.length-1 || matrix[r+1][c]===0,
              left: c===0 || matrix[r][c-1]===0,
              right: c===matrix[r].length-1 || matrix[r][c+1]===0
            });
          }
        }
      }
    });
  }

  showGameOver(score, lines, level, gameTimeMs, totalPieces) {
    const minutes = gameTimeMs / 60000;
    const bpm = minutes > 0 ? Math.round(totalPieces / minutes) : 0;
    const ppm = minutes > 0 ? Math.round(score / minutes) : 0;
    document.getElementById('go-ppm').innerText = ppm;
    document.getElementById('go-bpm').innerText = bpm;
    document.getElementById('go-score').innerText = score;
    document.getElementById('go-lines').innerText = lines;
    document.getElementById('go-level').innerText = level;
    document.getElementById('go-time').innerText = gameTimeMs > 0 ? new Date(gameTimeMs).toISOString().substring(14, 19) : "00:00";
    document.getElementById('gameOverScreen').classList.remove('hidden');
  }

  renderSettings(keys, bindCallback, cfg, cfgChangeCallback) {
    const list = document.getElementById('controlsList');
    list.innerHTML = '';

    // Control mode selector (rotation vs orientation)
    const modeRow = document.createElement('div');
    modeRow.style.marginBottom = '12px';
    const modeLabel = document.createElement('div'); modeLabel.className = 'setting-label';
    modeLabel.innerHTML = '<span>Control buttons</span><span></span>';
    modeRow.appendChild(modeLabel);

    const opts = document.createElement('div');
    opts.style.display = 'flex'; opts.style.gap = '8px';
    opts.style.justifyContent = 'flex-start';
    opts.style.marginBottom = '8px';

    const modes = [
      { v: 'rotation', t: 'Rotation buttons' },
      { v: 'orientation', t: 'Orientation buttons' }
    ];

    modes.forEach(m => {
      const id = `controlMode-${m.v}`;
      const wrapper = document.createElement('label');
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '6px';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'controlMode'; input.value = m.v; input.id = id;
      const cur = (cfg && cfg.controlMode) ? cfg.controlMode : 'rotation';
      if (cur === m.v) input.checked = true;
      input.addEventListener('change', (e) => {
        if (e.target.checked && typeof cfgChangeCallback === 'function') cfgChangeCallback('controlMode', m.v);
      });
      const span = document.createElement('span'); span.innerText = m.t; span.style.fontSize = '13px';
      wrapper.appendChild(input); wrapper.appendChild(span);
      opts.appendChild(wrapper);
    });
    modeRow.appendChild(opts);
    list.appendChild(modeRow);

    // Key binding rows
    Object.keys(keys).forEach(action => {
      const r = document.createElement('div'); r.className = 'control-row';
      const lbl = document.createElement('span'); lbl.innerText = CONFIG.TRANSLATIONS[action];
      const btn = document.createElement('button'); btn.innerText = keys[action];
      btn.onclick = () => bindCallback(action, btn);
      r.append(lbl, btn); list.appendChild(r);
    });
  }
}
