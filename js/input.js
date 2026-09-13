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

    // For managing dynamically created mobile control listeners so we can refresh them
    this._mobileDocHandlers = [];
    this._mobileBtnEls = [];

    this.bindEvents();
    this.bindTouchEvents();
  }

  // Wrapper around navigator.vibrate that scales durations according to engine.cfg.hapticStrength
  triggerHaptic(baseDuration) {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
      const cfg = (this.engine && this.engine.cfg) ? this.engine.cfg : null;
      const strength = (cfg && typeof cfg.hapticStrength === 'number') ? cfg.hapticStrength : 100;
      if (!strength || strength <= 0) return;
      const mult = Math.max(0, strength) / 100;
      const dur = Math.round(baseDuration * mult);
      if (dur > 0) navigator.vibrate(dur);
    } catch (e) {
      // ignore non-fatal vibrate errors
    }
  }

  bindEvents() {
    window.addEventListener('keydown', e => {
      if (this.state.bindingAction) {
        e.preventDefault();
        this.keys[this.state.bindingAction] = e.code;
        this.state.bindingAction = null;
        this.engine.saveSettings();
        this.engine.renderer.renderSettings(this.keys, (action, btn) => this.startBinding(action, btn), this.engine.cfg, (k, v) => { this.engine.cfg[k] = v; this.engine.saveSettings(); if (k === 'controlMode' && typeof this.setupMobileControls === 'function') this.setupMobileControls(); });
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
    const { minC, maxC } = this.engine.renderer.getMatrixBounds(matrix);

    const allowedMin = -minC;
    const allowedMax = CONFIG.COLS - 1 - maxC;
    return {
      minC,
      maxC,
      allowedMin,
      allowedMax,
      range: Math.max(0, allowedMax - allowedMin)
    };
  }

  // Move the current piece horizontally, one column at a time, until it reaches targetX
  // (or gets blocked). Used by both the slider and touch-drag column snapping.
  moveCurrentToColumn(targetX) {
    const cur = this.engine.state.current;
    if (!cur) return;
    let safety = 0;
    while (cur.x < targetX && safety < 12) {
      const prevX = cur.x;
      this.engine.action('right');
      if (cur.x === prevX) break;
      safety++;
    }
    safety = 0;
    while (cur.x > targetX && safety < 12) {
      const prevX = cur.x;
      this.engine.action('left');
      if (cur.x === prevX) break;
      safety++;
    }
    if (this.syncSliderThumb) this.syncSliderThumb();
  }

  setSliderVisual(columnIndex, metrics = this.getCurrentPieceXRange()) {
    if (!this.sliderTrack || !this.sliderThumb) return;

    const trackRect = this.sliderTrack.getBoundingClientRect();
    const stepsRect = this.sliderSteps ? this.sliderSteps.getBoundingClientRect() : null;

    let clampedColumn = null;
    let percentNormalized = 0.5;

    if (metrics && typeof columnIndex === 'number') {
      clampedColumn = Math.max(metrics.allowedMin, Math.min(columnIndex, metrics.allowedMax));
      if (metrics.range > 0) percentNormalized = (clampedColumn - metrics.allowedMin) / metrics.range;
    } else if (metrics && this.engine && this.engine.state && this.engine.state.current) {
      // fallback to current piece x
      clampedColumn = this.engine.state.current.x;
      if (metrics.range > 0) percentNormalized = (clampedColumn - metrics.allowedMin) / metrics.range;
    }

    // Compute center X inside the inner steps area (so markers and thumb align)
    let naturalVisualX;
    if (stepsRect) {
      const innerLeft = stepsRect.left - trackRect.left;
      const innerWidth = stepsRect.width || Math.max(1, trackRect.width - 0);

      // If we have a current piece, align thumb to the piece center across board columns
      if (this.engine && this.engine.state && this.engine.state.current && metrics) {
        // Matrix column bounds for the current rotation (already computed in metrics)
        const minMc = metrics.minC, maxMc = metrics.maxC;
        // board column indices for left and right edges
        let boardLeft = clampedColumn + minMc;
        let boardRight = clampedColumn + maxMc;
        boardLeft = Math.max(0, Math.min(CONFIG.COLS - 1, boardLeft));
        boardRight = Math.max(0, Math.min(CONFIG.COLS - 1, boardRight));

        const cols = CONFIG.COLS || 10;
        // center in boundary coordinates (ticks are boundaries 0..cols)
        const centerBoundary = (boardLeft + boardRight + 1) / 2; // e.g. a single cell at L..L -> (L + L +1)/2 = L+0.5
        naturalVisualX = innerLeft + (centerBoundary / Math.max(1, cols)) * innerWidth;

        // Create/update range overlay (light shadow)
        if (!this.sliderRange) {
          const fillEl = this.sliderTrack.querySelector('.slider-fill');
          if (fillEl) {
            const rangeEl = document.createElement('div');
            rangeEl.className = 'slider-range';
            fillEl.appendChild(rangeEl);
            this.sliderRange = rangeEl;
          }
        }

        // Highlight all intervals covered by the piece and update overlay
        const from = Math.min(boardLeft, boardRight);
        const to = Math.max(boardLeft, boardRight);
        const leftPercent = (from / cols) * 100;
        const widthPercent = ((to - from + 1) / cols) * 100;
        if (this.sliderRange) {
          this.sliderRange.style.left = `${leftPercent}%`;
          this.sliderRange.style.width = `${widthPercent}%`;
          this.sliderRange.style.display = 'block';
        }

        // Update interval markers heights based on proximity to pointer x
        const intervals = Array.from(this.sliderSteps.querySelectorAll('.interval'));
        const colWidth = innerWidth / cols;
        const pointer = (typeof this.lastPointerX === 'number') ? this.lastPointerX : null;
        intervals.forEach((el, i) => {
          el.classList.remove('active');
          // compute center relative to track left
          const centerRel = (i + 0.5) * (trackRect.width / cols);

          const baseH = 18;
          const maxH = 40;
          let h = baseH;
          if (pointer !== null) {
            const d = Math.abs(centerRel - pointer);
            const t = Math.max(0, 1 - d / (colWidth * 2.5));
            h = Math.round(baseH + t * (maxH - baseH));
            el.style.borderLeftColor = t > 0.05 ? `rgba(0,195,195,${0.2 + 0.8 * t})` : '#2f2f2f';
          } else {
            el.style.borderLeftColor = '#2f2f2f';
          }
          el.style.height = `${h}px`;

          if (i >= from && i <= to) el.classList.add('active');
        });

      } else {
        // fallback: use normalized percent
        naturalVisualX = innerLeft + percentNormalized * innerWidth;
        if (this.sliderRange) this.sliderRange.style.display = 'none';
        this.sliderSteps.querySelectorAll('.interval').forEach(s => {
          s.classList.remove('active');
          s.style.height = '';
          s.style.borderLeftColor = '';
        });
      }

    } else {
      const naturalTrackWidth = this.sliderTrack.offsetWidth || trackRect.width || 1;
      const thumbNaturalWidth = this.sliderThumb.offsetWidth || 44;
      const thumbRadius = thumbNaturalWidth / 2;
      naturalVisualX = thumbRadius + percentNormalized * Math.max(0, naturalTrackWidth - 2 * thumbRadius);

      // fallback: clear highlights
      if (this.sliderSteps) this.sliderSteps.querySelectorAll('.interval').forEach(s => {
        s.classList.remove('active');
        s.style.height = '';
        s.style.borderLeftColor = '';
      });
      if (this.sliderRange) this.sliderRange.style.display = 'none';
    }

    // Position the thumb (centered)
    this.sliderThumb.style.left = `${naturalVisualX}px`;
    this.sliderThumb.style.transform = 'translateX(-50%) translateY(-50%)';
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

  // Build or refresh the mobile rotation/orientation buttons based on engine.cfg.controlMode
  setupMobileControls() {
    // remove any previously attached document-level mouseup handlers
    if (this._mobileDocHandlers && this._mobileDocHandlers.length) {
      this._mobileDocHandlers.forEach(h => document.removeEventListener('mouseup', h));
      this._mobileDocHandlers = [];
    }
    // clear stored button refs
    this._mobileBtnEls = [];

    const rotContainer = document.querySelector('.rot-buttons');
    if (!rotContainer) return;
    rotContainer.innerHTML = '';

    const controlMode = (this.engine && this.engine.cfg && this.engine.cfg.controlMode) ? this.engine.cfg.controlMode : 'rotation';

    // Rotation repeat settings (for the rotate buttons)
    const ROT_REPEAT_INITIAL = 250;
    const ROT_REPEAT_INTERVAL = 120;
    const HAPTIC_TAP = 6;
    const HAPTIC_ROTATE_REPEAT = 4;

    if (controlMode === 'orientation') {
      // Create 4 orientation buttons (absolute orientations) with preview canvases
      const orientations = [
        { id: 'btn-orient-0', label: '↑', action: 'orient0', aria: 'Orientation Up' },
        { id: 'btn-orient-1', label: '→', action: 'orient1', aria: 'Orientation Right' },
        { id: 'btn-orient-2', label: '↓', action: 'orient2', aria: 'Orientation Down' },
        { id: 'btn-orient-3', label: '←', action: 'orient3', aria: 'Orientation Left' }
      ];

      orientations.forEach(o => {
        const b = document.createElement('button'); b.id = o.id; b.setAttribute('aria-label', o.aria); b.dataset.action = o.action;
        // preview canvas
        const cvs = document.createElement('canvas'); cvs.className = 'preview-canvas'; cvs.width = 64; cvs.height = 64; cvs.style.width = '36px'; cvs.style.height = '36px';
        b.appendChild(cvs);

        const onPress = (e) => { if (e && e.preventDefault) e.preventDefault(); if (this.engine.state.paused) return; this.engine.action(o.action); this.triggerHaptic(HAPTIC_TAP); };
        b.addEventListener('touchstart', onPress, { passive: false });
        b.addEventListener('mousedown', onPress);
        rotContainer.appendChild(b);
        this._mobileBtnEls.push({ el: b, action: o.action, canvas: cvs });
      });

    } else {
      // Default: rotation buttons with hold-to-repeat and preview canvases
      const btnDefs = [
        { id: 'btn-rot-ccw', label: '↺', action: 'rotateCCW', aria: 'Rotate counter-clockwise' },
        { id: 'btn-rot-180', label: '↕', action: 'rotate180', aria: 'Rotate 180' },
        { id: 'btn-rot-cw', label: '↻', action: 'rotateCW', aria: 'Rotate clockwise' }
      ];

      btnDefs.forEach(def => {
        const el = document.createElement('button'); el.id = def.id; el.setAttribute('aria-label', def.aria); el.dataset.action = def.action;
        // preview canvas
        const cvs = document.createElement('canvas'); cvs.className = 'preview-canvas'; cvs.width = 64; cvs.height = 64; cvs.style.width = '36px'; cvs.style.height = '36px';
        el.appendChild(cvs);

        let repeatTimeout = null; let repeatInterval = null;
        const start = (e) => {
          if (e && e.preventDefault) e.preventDefault();
          if (this.engine.state.paused) return;
          this.engine.action(def.action);
          this.triggerHaptic(HAPTIC_TAP);
          repeatTimeout = setTimeout(() => {
            repeatInterval = setInterval(() => {
              this.engine.action(def.action);
              this.triggerHaptic(HAPTIC_ROTATE_REPEAT);
            }, ROT_REPEAT_INTERVAL);
          }, ROT_REPEAT_INITIAL);
        };
        const stop = (e) => {
          if (e && e.preventDefault) e.preventDefault();
          if (repeatTimeout) { clearTimeout(repeatTimeout); repeatTimeout = null; }
          if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null; }
        };
        el.addEventListener('touchstart', start, { passive: false });
        el.addEventListener('touchend', stop, { passive: false });
        el.addEventListener('touchcancel', stop, { passive: false });
        el.addEventListener('mousedown', start);
        const docStop = (e) => stop(e);
        document.addEventListener('mouseup', docStop);
        this._mobileDocHandlers.push(docStop);
        rotContainer.appendChild(el);
        this._mobileBtnEls.push({ el: el, action: def.action, canvas: cvs });
      });
    }

    // update previews initially
    if (typeof this.updateMobilePreviews === 'function') this.updateMobilePreviews();
  }

  bindTouchEvents() {
    // Create mobile rotation/orientation UI based on current settings
    this.setupMobileControls();

    // Previews are updated on control setup and on engine events (spawn/action). No continuous RAF loop to avoid layout thrash.

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
      // mouse support
      softBtn.addEventListener('mousedown', (e) => { e.preventDefault(); this.state.active.softDrop = true; });
      document.addEventListener('mouseup', () => { this.state.active.softDrop = false; });
    }

    // Slider track & thumb (reuse helper to snap)
    this.sliderTrack = document.getElementById('slider-track');
    this.sliderThumb = document.getElementById('slider-thumb');
    let activeSliderTouchId = null;
    let activeSliderPieceId = -1;

    if (this.sliderTrack && this.sliderThumb) {
      const getTouchById = (touchList, id) => Array.from(touchList).find(touch => touch.identifier === id) || null;

      // Create a simple flat progress fill and discrete step markers (one per column)
      if (!this.sliderTrack.querySelector('.slider-fill')) {
        const sf = document.createElement('div'); sf.className = 'slider-fill';
        const prog = document.createElement('div'); prog.className = 'slider-progress';
        sf.appendChild(prog);
        this.sliderTrack.appendChild(sf);
        this.sliderProgress = prog;
      } else {
        this.sliderProgress = this.sliderTrack.querySelector('.slider-progress');
      }

      // Steps container
      let stepsContainer = this.sliderTrack.querySelector('.slider-steps');
      if (!stepsContainer) {
        stepsContainer = document.createElement('div'); stepsContainer.className = 'slider-steps';
        this.sliderTrack.appendChild(stepsContainer);
      }
      stepsContainer.innerHTML = '';
      // Create intervals: one interval per column so there are CONFIG.COLS intervals
      const cols = CONFIG.COLS || 10;
      if (cols > 0) {
        for (let i = 0; i < cols; i++) {
          const iv = document.createElement('div'); iv.className = 'interval'; iv.setAttribute('data-index', i);
          // left at i/cols, width 1/cols
          iv.style.left = `${(i / cols) * 100}%`;
          iv.style.width = `${(1 / cols) * 100}%`;
          stepsContainer.appendChild(iv);
        }
      } else {
        const iv = document.createElement('div'); iv.className = 'interval'; iv.setAttribute('data-index', 0); iv.style.left = '50%'; iv.style.width = '0%';
        stepsContainer.appendChild(iv);
      }
      this.sliderSteps = stepsContainer;
      this.sliderIntervals = stepsContainer;

      // Ensure thumb is empty (no preview / no handle)
      this.sliderThumb.innerHTML = '';

      const updateFromClientX = (clientX) => {
        if (!this.engine.state.current || this.engine.state.paused) return;
        const rect = this.sliderTrack.getBoundingClientRect();
        const relX = clientX - rect.left;
        // store last pointer position relative to track (px) for proximity calculations
        this.lastPointerX = relX;
        const pct = Math.max(0, Math.min(1, rect.width <= 0 ? 0 : relX / rect.width));

        // Map to board column (0..COLS-1) so each interval is one block
        const boardCols = Math.max(1, CONFIG.COLS);
        // Map pointer to the nearest block center (centers at (i+0.5)/cols).
        // Compute nearest center by subtracting 0.5 before flooring, then clamp to valid range.
        let boardCol = Math.floor(pct * boardCols - 0.5);
        if (boardCol < 0) boardCol = 0;
        if (boardCol >= boardCols) boardCol = boardCols - 1;

        const cur = this.engine.state.current;
        const metrics = this.getCurrentPieceXRange();
        if (!metrics || !cur) return;

        // Piece matrix horizontal bounds for current rotation (already computed in metrics)
        const minMc = metrics.minC, maxMc = metrics.maxC;

        // Now interpret the slider input as the desired board column for the piece's center
        // Compute center offset of the piece's occupied cells (may be fractional)
        const centerOffset = (minMc + maxMc) / 2; // e.g. for a 2-wide piece -> 0.5
        let targetPieceX = Math.round(boardCol - centerOffset);
        // Clamp to allowed piece x range
        const clampedPieceX = Math.max(metrics.allowedMin, Math.min(metrics.allowedMax, targetPieceX));

        this.moveCurrentToColumn(clampedPieceX);
        // update visual based on piece x
        this.setSliderVisual(clampedPieceX, metrics);
      };

      // Shared end-of-interaction logic for both touch and mouse dragging.
      // A release counts as a hard-drop request unless the interaction was
      // cancelled (touchcancel) or the piece already changed mid-drag.
      let sliderMouseActive = false;
      const endSliderInteraction = (countsAsRelease) => {
        const shouldHardDrop = countsAsRelease && !this.engine.state.paused && this.engine.state.pieceIdCtr === activeSliderPieceId;
        activeSliderTouchId = null;
        sliderMouseActive = false;
        activeSliderPieceId = -1;

        if (shouldHardDrop) {
          this.engine.action('hardDrop');
          this.triggerHaptic(18);
        }
        // clear pointer state when the interaction ends so markers return to default
        this.lastPointerX = null;
        this.syncSliderThumb();
      };

      this.sliderTrack.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (activeSliderTouchId !== null || sliderMouseActive) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        activeSliderTouchId = touch.identifier;
        activeSliderPieceId = this.engine.state.pieceIdCtr;
        updateFromClientX(touch.clientX);
      }, { passive: false });

      this.sliderTrack.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (this.engine.state.paused || activeSliderTouchId === null) return;
        const touch = getTouchById(e.touches, activeSliderTouchId);
        if (!touch) return;
        updateFromClientX(touch.clientX);
      }, { passive: false });

      const endHandler = (e) => {
        if (activeSliderTouchId === null) return;
        const endedTouch = getTouchById(e.changedTouches, activeSliderTouchId);
        if (!endedTouch) return;
        e.preventDefault();
        endSliderInteraction(e.type === 'touchend');
      };

      this.sliderTrack.addEventListener('touchend', endHandler, { passive: false });
      this.sliderTrack.addEventListener('touchcancel', endHandler, { passive: false });

      // Mouse support: the slider is now also visible in landscape/desktop
      // mode, so mouse users need to be able to drag it just like touch users.
      this.sliderTrack.addEventListener('mousedown', (e) => {
        if (activeSliderTouchId !== null) return; // a touch drag already owns the slider
        e.preventDefault();
        sliderMouseActive = true;
        activeSliderPieceId = this.engine.state.pieceIdCtr;
        updateFromClientX(e.clientX);
      });

      document.addEventListener('mousemove', (e) => {
        if (!sliderMouseActive || this.engine.state.paused) return;
        updateFromClientX(e.clientX);
      });

      document.addEventListener('mouseup', () => {
        if (!sliderMouseActive) return;
        endSliderInteraction(true);
      });
    }
  }

  // Update the small previews on the mobile rotation/orientation buttons
  updateMobilePreviews() {
    if (!this._mobileBtnEls || !this._mobileBtnEls.length) return;
    // If engine/state isn't ready yet, clear previews and return
    if (!this.engine || !this.engine.state) {
      this._mobileBtnEls.forEach(item => {
        const canvas = item.canvas || (item.el ? item.el.querySelector('canvas') : null);
        if (canvas) {
          const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
      return;
    }

    const cur = this.engine.state.current;
    const next = (this.engine.state.nextQueue && this.engine.state.nextQueue[0]) ? this.engine.state.nextQueue[0] : null;
    const pieceType = cur ? cur.type : (next ? next.type : null);
    const curRot = cur ? cur.rot : 0;

    this._mobileBtnEls.forEach(item => {
      const btn = item.el || item;
      let action = item.action || (btn && btn.dataset ? btn.dataset.action : null);
      const canvas = item.canvas || (btn ? btn.querySelector('canvas') : null);
      if (!canvas) return;
      if (!pieceType) {
        const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width, canvas.height); return;
      }
      let targetRot = curRot;
      if (!action) action = btn && btn.dataset ? btn.dataset.action : null;
      if (action && action.startsWith('orient')) {
        targetRot = parseInt(action.charAt(action.length - 1), 10);
      } else if (action === 'rotateCW') targetRot = (curRot + 1) % 4;
      else if (action === 'rotateCCW') targetRot = (curRot + 3) % 4;
      else if (action === 'rotate180') targetRot = (curRot + 2) % 4;

      if (this.engine && this.engine.renderer && typeof this.engine.renderer.renderButtonPreview === 'function') {
        try {
          this.engine.renderer.renderButtonPreview(canvas, pieceType, targetRot);
        } catch (ex) {
          // If preview rendering fails (e.g. canvas too large), clear the canvas and continue
          try { const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width, canvas.height); } catch(e) {}
        }
      }
    });
  }

  startBinding(action, btn) {
    this.state.bindingAction = action;
    document.querySelectorAll('.control-row button').forEach(b => b.classList.remove('binding'));
    btn.classList.add('binding');
    btn.innerText = "Press key...";
  }
}
