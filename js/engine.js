class QuadraEngine {
  constructor() {
    this.renderer = new Renderer();
    this.input = new InputManager(this);
    this.stats = {
      pieces: { O:0, I:0, Z:0, J:0, L:0, S:0, T:0, Total:0 },
      clears: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0, 10:0, 11:0, 12:0, 13:0, 14:0, more:0, Total:0 }
    };
    this.cfg = { baseGravity: 1, softDropSpeed: 20, das: 150, arr: 30 };
    this.state = {
      grid: Array.from({ length: CONFIG.ROWS }, () => Array(CONFIG.COLS).fill(0)),
      bag: [], score: 0, lines: 0, level: 1, pieceIdCtr: 1, gameOver: false, paused: false,
      current: null, nextQueue: [], dropCounter: 0, lastTime: 0,
      isFlashing: false, flashTimer: 0, pendingRows: [],
      isCascading: false, fragments: [], combo: 1, cascadeLines: 0,
      gameTimeMs: 0,
      softDropSuppressed: false
    };
    this.tempVisited = Array.from({ length: CONFIG.ROWS }, () => Array(CONFIG.COLS).fill(false));
    this.loadSettings();
    this.renderer.drawMiniPieces();
    for(let i=0; i<3; i++) this.state.nextQueue.push({ type: this.getBagPiece(), rot: 0 });
    this.spawnNext();
    requestAnimationFrame(t => this.loop(t));
  }

  loadSettings() {
    try {
      const s = localStorage.getItem('quadraSettings');
      if (s) { const p = JSON.parse(s); delete p.hold; Object.assign(this.input.keys, p); }
      const c = localStorage.getItem('quadraConfig');
      if (c) Object.assign(this.cfg, JSON.parse(c));
    } catch (e) {}
  }

  saveSettings() {
    localStorage.setItem('quadraSettings', JSON.stringify(this.input.keys));
    localStorage.setItem('quadraConfig', JSON.stringify(this.cfg));
  }

  getDropInterval() {
    return Math.max(80, (1000 / this.cfg.baseGravity) - (this.state.level - 1) * 90);
  }

  getBagPiece() {
    if (this.state.bag.length === 0) {
      this.state.bag = Object.keys(CONFIG.BASE_SHAPES).sort(() => Math.random() - 0.5);
    }
    return this.state.bag.pop();
  }

  updateGhostY() {
    if (!this.state.current) return;
    let gy = this.state.current.y;
    while (!this.checkCollision(this.state.current.x, gy + 1, this.state.current.rot, this.state.current.type)) {
      gy++;
    }
    this.state.current.ghostY = gy;
  }

  spawnNext() {
    const nextPiece = this.state.nextQueue.shift();
    const matrix = PRECALC_ROTATIONS[nextPiece.type][0];
    let minR = matrix.length;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) { minR = Math.min(minR, r); break; }
      }
    }
    this.state.current = {
      type: nextPiece.type, rot: 0,
      x: Math.floor((CONFIG.COLS - PRECALC_ROTATIONS[nextPiece.type][0][0].length) / 2),
      y: -minR - 1
    };
    this.updateGhostY();
    this.state.nextQueue.push({ type: this.getBagPiece(), rot: 0 });

    if (this.state.current) {
      this.stats.pieces[this.state.current.type]++;
      this.stats.pieces.Total++;
      this.renderer.updateStat('count', this.state.current.type, this.stats.pieces[this.state.current.type]);
      this.renderer.updateStat('count', 'Total', this.stats.pieces.Total);

      if (this.input && this.input.state) {
        const inp = this.input.state;
        if (inp.active.left && inp.lastDir === 'left') this.action('left');
        else if (inp.active.right && inp.lastDir === 'right') this.action('right');
      }

      if (this.checkCollision(this.state.current.x, this.state.current.y, this.state.current.rot)) {
        this.triggerGameOver();
      }
    }

    if (this.input && this.input.syncSliderThumb) {
      this.input.syncSliderThumb();
    }
  }

  checkCollision(tx, ty, tRot, type = this.state.current.type) {
    const matrix = PRECALC_ROTATIONS[type][tRot];
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          const nx = tx + c, ny = ty + r;
          if (nx < 0 || nx >= CONFIG.COLS || ny >= CONFIG.ROWS || (ny >= 0 && this.state.grid[ny][nx] !== 0)) return true;
        }
      }
    }
    return false;
  }

  lockPiece() {
    const { current, grid } = this.state;
    const matrix = PRECALC_ROTATIONS[current.type][current.rot];
    this.state.pieceIdCtr++;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0 && current.y + r >= 0) {
          grid[current.y + r][current.x + c] = { type: current.type, id: this.state.pieceIdCtr };
        }
      }
    }

    this.state.softDropSuppressed = true; // Spärra softdrop för nästa kloss
    this.state.current = null;
    this.state.dropCounter = 0;

    let fullRows = [];
    for (let r = 0; r < CONFIG.ROWS; r++) {
      if (grid[r].every(val => val !== 0)) fullRows.push(r);
    }

    if (fullRows.length > 0) {
      this.state.pendingRows = fullRows;
      this.state.isFlashing = true;
      this.state.flashTimer = 0;
    } else {
      this.spawnNext();
    }
  }

  processCascade() {
    const { grid, pendingRows, combo } = this.state;
    pendingRows.forEach(r => grid[r].fill(0));
    const lCount = pendingRows.length;
    this.state.cascadeLines += lCount;
    const pts = [0, 100, 300, 500, 800, 1200, 1800];
    this.state.score += (pts[lCount] || 2000) * this.state.level * combo;
    this.state.lines += lCount;
    this.state.level = Math.floor(this.state.lines / 10) + 1;
    this.renderer.updateUI(this.state.score, this.state.lines, this.state.level);
    this.tempVisited.forEach(row => row.fill(false));
    let frags = [];
    let fragId = 1;

    for (let r = 0; r < CONFIG.ROWS; r++) {
      for (let c = 0; c < CONFIG.COLS; c++) {
        if (grid[r][c] !== 0 && !this.tempVisited[r][c]) {
          const origId = grid[r][c].id, type = grid[r][c].type;
          let blocks = [], stack = [{r, c}];
          this.tempVisited[r][c] = true;
          while (stack.length > 0) {
            const p = stack.pop();
            blocks.push(p);
            [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => {
              const nr = p.r + dr, nc = p.c + dc;
              if (nr >= 0 && nr < CONFIG.ROWS && nc >= 0 && nc < CONFIG.COLS && !this.tempVisited[nr][nc] && grid[nr][nc] !== 0 && grid[nr][nc].id === origId) {
                this.tempVisited[nr][nc] = true;
                stack.push({r: nr, c: nc});
              }
            });
          }

          const blockSet = new Set(blocks.map(b => `${b.r},${b.c}`));
          blocks.forEach(b => {
            b.edges = {
              top: !blockSet.has(`${b.r - 1},${b.c}`),
              bottom: !blockSet.has(`${b.r + 1},${b.c}`),
              left: !blockSet.has(`${b.r},${b.c - 1}`),
              right: !blockSet.has(`${b.r},${b.c + 1}`)
            };
          });
          frags.push({ fId: fragId++, blocks, type, origId, dropCount: 0, v: 0, cy: 0, done: false });
        }
      }
    }

    let tempGrid = Array.from({ length: CONFIG.ROWS }, () => Array(CONFIG.COLS).fill(0));
    frags.forEach(f => f.blocks.forEach(b => tempGrid[b.r][b.c] = f));
    let moved = true;
    while (moved) {
      moved = false;
      frags.forEach(f => {
        let canDrop = true;
        for (let b of f.blocks) {
          if (b.r + 1 >= CONFIG.ROWS) { canDrop = false; break; }
          const cell = tempGrid[b.r + 1][b.c];
          if (cell !== 0 && cell.fId !== f.fId) { canDrop = false; break; }
        }
        if (canDrop) {
          f.blocks.forEach(b => tempGrid[b.r][b.c] = 0);
          f.blocks.forEach(b => b.r++);
          f.blocks.forEach(b => tempGrid[b.r][b.c] = f);
          f.dropCount++;
          moved = true;
        }
      });
    }

    this.state.fragments = frags.filter(f => f.dropCount > 0);
    grid.forEach(row => row.fill(0));
    frags.forEach(f => {
      if (f.dropCount === 0) {
        f.blocks.forEach(b => grid[b.r][b.c] = { type: f.type, id: `f_${f.fId}_${f.origId}` });
      } else {
        f.blocks.forEach(b => b.r -= f.dropCount);
      }
    });

    if (this.state.fragments.length > 0) {
      this.state.isCascading = true;
    } else {
      this.finalizeCascade();
    }
  }

  finalizeCascade() {
    if (this.state.cascadeLines > 0) {
      const t = this.state.cascadeLines;
      if (t <= 14) {
        this.stats.clears[t]++;
        this.renderer.updateStat('lines', t, this.stats.clears[t]);
      } else {
        this.stats.clears.more++;
        this.renderer.updateStat('lines', 'more', this.stats.clears.more);
      }
      this.stats.clears.Total += t;
      this.renderer.updateStat('lines', 'Total', this.stats.clears.Total);
      this.state.cascadeLines = 0;
    }
    this.state.combo = 1;
    this.spawnNext();
  }

  triggerGameOver() {
    this.state.gameOver = true;
    this.renderer.showGameOver(this.state.score, this.state.lines, this.state.level, this.state.gameTimeMs, this.stats.pieces.Total);
  }

  action(type) {
    if (!this.state.current || this.state.gameOver || this.state.paused) return;
    const cur = this.state.current;
    switch (type) {
      case 'left':
        if (!this.checkCollision(cur.x - 1, cur.y, cur.rot)) { cur.x--; this.updateGhostY(); }
        break;
      case 'right':
        if (!this.checkCollision(cur.x + 1, cur.y, cur.rot)) { cur.x++; this.updateGhostY(); }
        break;
      case 'rotateCW':
      case 'rotateCCW':
      case 'rotate180': {
        const rotMap = { 'rotateCW': 1, 'rotateCCW': 3, 'rotate180': 2 };
        const nRot = (cur.rot + rotMap[type]) % 4;
        for (let k of CONFIG.KICKS) {
          if (!this.checkCollision(cur.x + k.x, cur.y + k.y, nRot)) {
            cur.rot = nRot; cur.x += k.x; cur.y += k.y;
            this.updateGhostY();
            break;
          }
        }
        break;
      }
      case 'hardDrop':
        while (!this.checkCollision(cur.x, cur.y + 1, cur.rot)) { cur.y++; this.state.score += 2; }
        this.lockPiece();
        break;
    }

    if (this.input && this.input.syncSliderThumb) {
      this.input.syncSliderThumb();
    }
  }

  update(dt) {
    if (this.state.gameOver || this.state.paused) return;
    this.state.gameTimeMs += dt;

    if (this.state.isFlashing) {
      this.state.flashTimer += dt;
      if (this.state.flashTimer > CONFIG.FLASH_DURATION) {
        this.state.isFlashing = false;
        this.processCascade();
      }
    } else if (this.state.isCascading) {
      let stillFalling = false;
      const deltaSec = Math.min(dt, 50) / 16.66;
      this.state.fragments.forEach(f => {
        if (!f.done) {
          f.v += 1.2 * deltaSec; f.cy += f.v * deltaSec;
          const targetY = f.dropCount * CONFIG.BLOCK_SIZE;
          if (f.cy >= targetY) {
            f.cy = targetY;
            f.blocks.forEach(b => this.state.grid[b.r + f.dropCount][b.c] = { type: f.type, id: `f_${f.fId}_${f.origId}` });
            f.done = true;
          } else stillFalling = true;
        }
      });
      if (!stillFalling) {
        this.state.isCascading = false;
        let fr = false;
        for (let r = 0; r < CONFIG.ROWS; r++) if (this.state.grid[r].every(v => v !== 0)) fr = true;
        if (fr) {
          this.state.combo++;
          let full = [];
          for(let r=0; r<CONFIG.ROWS; r++) if(this.state.grid[r].every(v=>v!==0)) full.push(r);
          this.state.pendingRows = full; this.state.isFlashing = true; this.state.flashTimer = 0;
        } else {
          this.finalizeCascade();
        }
      }
    } else if (this.state.current) {
      const inp = this.input.state;

      // Lås upp softdrop om användaren släppt knappen
      if (!inp.active.softDrop) {
        this.state.softDropSuppressed = false;
      }

      if (inp.active.left || inp.active.right) {
        inp.dasTimer += dt;
        if (inp.dasTimer > this.cfg.das) {
          inp.arrTimer += dt;
          while (inp.arrTimer > this.cfg.arr) {
            if (inp.lastDir === 'left' && inp.active.left) this.action('left');
            else if (inp.lastDir === 'right' && inp.active.right) this.action('right');
            inp.arrTimer -= this.cfg.arr;
          }
        }
      }

      const isSoftDropping = inp.active.softDrop && !this.state.softDropSuppressed;
      this.state.dropCounter += isSoftDropping ? Math.max(dt * this.cfg.softDropSpeed, this.getDropInterval()) : dt;
      const dInt = this.getDropInterval();

      while (this.state.dropCounter > dInt && this.state.current) {
        if (!this.checkCollision(this.state.current.x, this.state.current.y + 1, this.state.current.rot)) {
          this.state.current.y++;
          this.updateGhostY();
          if (isSoftDropping) {
            this.state.score++;
            this.renderer.updateUI(this.state.score, this.state.lines, this.state.level);
          }
        } else {
          this.lockPiece(); break;
        }
        this.state.dropCounter -= dInt;
      }
    }
  }

  loop(time) {
    if (this.state.lastTime === 0) this.state.lastTime = time;
    const dt = time - this.state.lastTime;
    this.state.lastTime = time;
    this.update(dt);
    this.renderer.draw(this.state, this);
    requestAnimationFrame(t => this.loop(t));
  }

  toggleSettings() {
    this.state.paused = !this.state.paused;
    document.getElementById('settingsModal').classList.toggle('hidden');
    if (this.state.paused) {
      this.renderer.renderSettings(this.input.keys, (action, btn) => this.input.startBinding(action, btn));
      ['DAS','ARR','Gravity','SoftDrop'].forEach(id => {
        const val = id==='Gravity'?this.cfg.baseGravity:id==='SoftDrop'?this.cfg.softDropSpeed:this.cfg[id.toLowerCase()];
        document.getElementById(`range${id}`).value = val; document.getElementById(`val${id}`).innerText = val;
      });
    } else {
      this.state.lastTime = performance.now();
      this.input.state.bindingAction = null;
      Object.keys(this.input.state.active).forEach(k => this.input.state.active[k] = false);
      this.cfg.das = parseInt(document.getElementById('rangeDAS').value);
      this.cfg.arr = parseInt(document.getElementById('rangeARR').value);
      this.cfg.baseGravity = parseInt(document.getElementById('rangeGravity').value);
      this.cfg.softDropSpeed = parseInt(document.getElementById('rangeSoftDrop').value);
      this.saveSettings();
    }
  }
}
