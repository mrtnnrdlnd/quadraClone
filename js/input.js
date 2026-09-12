class InputManager {
  constructor(engine) {
    this.engine = engine;
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
      softBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!this.state.active.softDrop) {
          this.state.active.softDrop = true;
        }
      }, { passive: false });
      softBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.state.active.softDrop = false;
      }, { passive: false });
      softBtn.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        this.state.active.softDrop = false;
      }, { passive: false });
    }

    const sliderTrack = document.getElementById('slider-track');
    const sliderThumb = document.getElementById('slider-thumb');
    let activeTouchPieceId = -1;

    if (sliderTrack && sliderThumb) {
      const updateAbsolutePosition = (clientX) => {
        if (!this.engine.state.current || this.engine.state.paused) return;

        const rect = sliderTrack.getBoundingClientRect();
        let touchX = clientX - rect.left;
        touchX = Math.max(0, Math.min(touchX, rect.width));

        // Natural (unscaled) track width
        const naturalTrackWidth = sliderTrack.offsetWidth || rect.width;
        const thumbNaturalWidth = sliderThumb.offsetWidth || 55;
        const thumbRadius = thumbNaturalWidth / 2;

        // Scale factor between visual (client) rect and natural sizes
        const scale = rect.width / naturalTrackWidth || 1;
        const thumbRadiusScaled = thumbRadius * scale;

        // Constrain touchX so the thumb center can't go beyond the visual track edges
        const constrainedX = Math.max(thumbRadiusScaled, Math.min(touchX, rect.width - thumbRadiusScaled));

        // Normalized percent across usable area (excluding thumb radius on both ends)
        const usableScaledWidth = Math.max(1, rect.width - 2 * thumbRadiusScaled);
        const percentNormalized = (constrainedX - thumbRadiusScaled) / usableScaledWidth;

        // Spelmekanik: map normalized percent to allowed piece x-range
        let cur = this.engine.state.current;
        let matrix = PRECALC_ROTATIONS[cur.type][cur.rot];

        let minC = 4, maxC = 0;
        for(let r=0; r<matrix.length; r++) {
          for(let c=0; c<matrix[r].length; c++) {
            if(matrix[r][c] !== 0) {
              if(c < minC) minC = c;
              if(c > maxC) maxC = c;
            }
          }
        }

        const allowedMin = -minC;
        const allowedMax = (CONFIG.COLS - 1 - maxC);
        const range = Math.max(0, allowedMax - allowedMin);

        // Snap to nearest column index for stable behavior
        let columnIndex;
        if (range <= 0) {
          columnIndex = allowedMin;
        } else {
          columnIndex = Math.round(allowedMin + percentNormalized * range);
        }

        // Position thumb at the center of the snapped column (natural pixels)
        let naturalVisualX;
        if (range <= 0) {
          naturalVisualX = naturalTrackWidth / 2;
        } else {
          const t = (columnIndex - allowedMin) / range; // 0..1
          naturalVisualX = thumbRadius + t * Math.max(0, (naturalTrackWidth - 2 * thumbRadius));
        }

        sliderThumb.style.left = `${naturalVisualX}px`;
        sliderThumb.style.transform = `translateX(-50%)`;

        // Move piece toward the snapped column
        const targetX = columnIndex;
        let safety = 0;
        while (cur.x < targetX && safety < 10) {
          let prevX = cur.x;
          this.engine.action('right');
          if (cur.x === prevX) break;
          safety++;
        }

        safety = 0;
        while (cur.x > targetX && safety < 10) {
          let prevX = cur.x;
          this.engine.action('left');
          if (cur.x === prevX) break;
          safety++;
        }
      };

      sliderTrack.addEventListener('touchstart', (e) => {
        e.preventDefault();
        activeTouchPieceId = this.engine.state.pieceIdCtr;
        updateAbsolutePosition(e.touches[0].clientX);
      }, { passive: false });

      sliderTrack.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (this.engine.state.paused) return;
        updateAbsolutePosition(e.touches[0].clientX);
      }, { passive: false });

      const endHandler = (e) => {
        e.preventDefault();
        if (this.engine.state.paused) return;

        if (this.engine.state.pieceIdCtr === activeTouchPieceId) {
          this.engine.action('hardDrop');
        }

        // Keep the thumb at the snapped position after release
      };

      sliderTrack.addEventListener('touchend', endHandler, { passive: false });
      sliderTrack.addEventListener('touchcancel', endHandler, { passive: false });
    }
  }

  startBinding(action, btn) {
    this.state.bindingAction = action;
    document.querySelectorAll('.control-row button').forEach(b => b.classList.remove('binding'));
    btn.classList.add('binding');
    btn.innerText = "Press key...";
  }
}
