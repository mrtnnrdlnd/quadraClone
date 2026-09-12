class InputManager {
  constructor(engine) {
    this.engine = engine;
    this.sliderTrack = null;
    this.sliderThumb = null;
    this.keys = {
      left: 'ArrowLeft', right: 'ArrowRight', softDrop: 'ArrowDown',
      hardDrop: 'Space', rotateCW: 'ArrowUp', rotateCCW: 'KeyZ', rotate180: 'KeyA'
    };
    this.state = { active: {}, lastDir: null, dasTimer: 0, arrTimer: 0, bindingAction: null };
    this.bindEvents();
    this.bindTouchEvents();
  }

  bindEvents() {
    window.addEventListener('keydown', e => {
      if (this.state.bindingAction) {
        e.preventDefault();
        this.keys[this.state.bindingAction] = e.code;
        this.state.bindingAction = null;
        this.engine.saveSettings();
        this.engine.renderer.renderSettings(this.keys, (action, btn) => this.startBinding(action, btn));
        return;
      }
      if (e.code === 'Escape' && this.engine.state.paused) return this.engine.toggleSettings();
      const action = Object.keys(this.keys).find(k => this.keys[k] === e.code);
      if (action) {
        e.preventDefault();
        if (!this.state.active[action]) {
          this.state.active[action] = true;
          if (action === 'left' || action === 'right') {
            this.state.lastDir = action;
            this.state.dasTimer = 0;
            this.state.arrTimer = 0;
          }
          if (!this.engine.state.gameOver && !this.engine.state.isCascading && !this.engine.state.isFlashing && !this.engine.state.paused) {
            this.engine.action(action);
          }
        }
      }
    });

    window.addEventListener('keyup', e => {
      if (this.state.bindingAction) return;
      const action = Object.keys(this.keys).find(k => this.keys[k] === e.code);
      if (action) {
        e.preventDefault();
        this.state.active[action] = false;
        if (action === 'left' && this.state.active.right) this.state.lastDir = 'right';
        if (action === 'right' && this.state.active.left) this.state.lastDir = 'left';
      }
    });
  }

  getCurrentPieceXRange(piece = this.engine.state.current) {
    if (!piece) return null;

    const matrix = PRECALC_ROTATIONS[piece.type][piece.rot];
    let minC = matrix[0].length;
    let maxC = 0;

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }

    const allowedMin = -minC;
    const allowedMax = CONFIG.COLS - 1 - maxC;
    return {
      allowedMin,
      allowedMax,
      range: Math.max(0, allowedMax - allowedMin)
    };
  }

  setSliderVisual(columnIndex, metrics = this.getCurrentPieceXRange()) {
    if (!this.sliderTrack || !this.sliderThumb) return;

    const naturalTrackWidth = this.sliderTrack.offsetWidth || this.sliderTrack.getBoundingClientRect().width || 1;
    const thumbNaturalWidth = this.sliderThumb.offsetWidth || 55;
    const thumbRadius = thumbNaturalWidth / 2;

    let progress = 0.5;
    let naturalVisualX = naturalTrackWidth / 2;

    if (metrics) {
      const clampedColumn = Math.max(metrics.allowedMin, Math.min(columnIndex, metrics.allowedMax));
      if (metrics.range > 0) {
        progress = (clampedColumn - metrics.allowedMin) / metrics.range;
      }
      naturalVisualX = thumbRadius + progress * Math.max(0, naturalTrackWidth - 2 * thumbRadius);
    }

    this.sliderThumb.style.left = `${naturalVisualX}px`;
    this.sliderThumb.style.transform = 'translateX(-50%)';
    this.sliderTrack.style.setProperty('--slider-progress', `${Math.round(progress * 100)}%`);
  }

  syncSliderThumb() {
    if (!this.sliderTrack || !this.sliderThumb) return;
    if (!this.engine.state || !this.engine.state.current) {
      this.setSliderVisual(0, null);
      return;
    }

    const metrics = this.getCurrentPieceXRange();
    this.setSliderVisual(this.engine.state.current.x, metrics);
  }

  bindTouchEvents() {
    const btnMap = {
      'btn-rot-ccw': 'rotateCCW',
      'btn-rot-180': 'rotate180',
      'btn-rot-cw': 'rotateCW'
    };

    // One-shot rotation buttons
    for (let id in btnMap) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.engine.action(btnMap[id]);
        }, { passive: false });
      }
    }

    // Soft-drop button (continuous while held)
    const softBtn = document.getElementById('btn-soft-drop');
    if (softBtn) {
      let softDropTouchId = null;
      const isTrackedSoftDropTouch = (touchList) => Array.from(touchList).some(touch => touch.identifier === softDropTouchId);

      softBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (softDropTouchId !== null) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        softDropTouchId = touch.identifier;
        this.state.active.softDrop = true;
      }, { passive: false });

      const stopSoftDrop = (e) => {
        if (softDropTouchId === null || !isTrackedSoftDropTouch(e.changedTouches)) return;
        e.preventDefault();
        softDropTouchId = null;
        this.state.active.softDrop = false;
      };

      softBtn.addEventListener('touchend', stopSoftDrop, { passive: false });
      softBtn.addEventListener('touchcancel', stopSoftDrop, { passive: false });
    }

    this.sliderTrack = document.getElementById('slider-track');
    this.sliderThumb = document.getElementById('slider-thumb');
    let activeSliderTouchId = null;
    let activeSliderPieceId = -1;

    if (this.sliderTrack && this.sliderThumb) {
      const getTouchById = (touchList, id) => Array.from(touchList).find(touch => touch.identifier === id) || null;

      const updateAbsolutePosition = (clientX) => {
        if (!this.engine.state.current || this.engine.state.paused) return;

        const rect = this.sliderTrack.getBoundingClientRect();
        let touchX = clientX - rect.left;
        touchX = Math.max(0, Math.min(touchX, rect.width));

        const naturalTrackWidth = this.sliderTrack.offsetWidth || rect.width;
        const thumbNaturalWidth = this.sliderThumb.offsetWidth || 55;
        const thumbRadius = thumbNaturalWidth / 2;
        const scale = rect.width / naturalTrackWidth || 1;
        const thumbRadiusScaled = thumbRadius * scale;
        const constrainedX = Math.max(thumbRadiusScaled, Math.min(touchX, rect.width - thumbRadiusScaled));
        const usableScaledWidth = Math.max(1, rect.width - 2 * thumbRadiusScaled);
        const percentNormalized = (constrainedX - thumbRadiusScaled) / usableScaledWidth;
        const cur = this.engine.state.current;
        const metrics = this.getCurrentPieceXRange(cur);
        if (!metrics) return;

        const columnIndex = metrics.range <= 0
          ? metrics.allowedMin
          : Math.round(metrics.allowedMin + percentNormalized * metrics.range);

        const targetX = columnIndex;
        let safety = 0;
        while (cur.x < targetX && safety < 10) {
          const prevX = cur.x;
          this.engine.action('right');
          if (cur.x === prevX) break;
          safety++;
        }

        safety = 0;
        while (cur.x > targetX && safety < 10) {
          const prevX = cur.x;
          this.engine.action('left');
          if (cur.x === prevX) break;
          safety++;
        }

        this.syncSliderThumb();
      };

      this.sliderTrack.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (activeSliderTouchId !== null) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        activeSliderTouchId = touch.identifier;
        activeSliderPieceId = this.engine.state.pieceIdCtr;
        updateAbsolutePosition(touch.clientX);
      }, { passive: false });

      this.sliderTrack.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (this.engine.state.paused || activeSliderTouchId === null) return;
        const touch = getTouchById(e.touches, activeSliderTouchId);
        if (!touch) return;
        updateAbsolutePosition(touch.clientX);
      }, { passive: false });

      const endHandler = (e) => {
        if (activeSliderTouchId === null) return;
        const endedTouch = getTouchById(e.changedTouches, activeSliderTouchId);
        if (!endedTouch) return;
        e.preventDefault();
        const shouldHardDrop = !this.engine.state.paused && this.engine.state.pieceIdCtr === activeSliderPieceId;
        activeSliderTouchId = null;
        activeSliderPieceId = -1;

        if (shouldHardDrop) {
          this.engine.action('hardDrop');
        }
        this.syncSliderThumb();
      };

      this.sliderTrack.addEventListener('touchend', endHandler, { passive: false });
      this.sliderTrack.addEventListener('touchcancel', endHandler, { passive: false });
    }
  }

  startBinding(action, btn) {
    this.state.bindingAction = action;
    document.querySelectorAll('.control-row button').forEach(b => b.classList.remove('binding'));
    btn.classList.add('binding');
    btn.innerText = "Press key...";
  }
}
