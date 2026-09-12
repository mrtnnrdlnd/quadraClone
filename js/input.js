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

    for (let id in btnMap) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.engine.action(btnMap[id]);
        });
      }
    }

    const sliderTrack = document.getElementById('slider-track');
    const sliderThumb = document.getElementById('slider-thumb');
    let startY = 0;
    let isSoftDropping = false;
    let activeTouchPieceId = -1;

    if (sliderTrack) {
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

        // Position thumb in natural pixels (center coordinate), inside [thumbRadius .. naturalTrackWidth - thumbRadius]
        const naturalVisualX = thumbRadius + percentNormalized * Math.max(0, (naturalTrackWidth - 2 * thumbRadius));
        sliderThumb.style.left = `${naturalVisualX}px`;
        sliderThumb.style.transform = `translateX(-50%)`;

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
        const targetX = Math.round(allowedMin + percentNormalized * range);

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
        startY = e.touches[0].clientY;
        isSoftDropping = false;

        activeTouchPieceId = this.engine.state.pieceIdCtr;
        updateAbsolutePosition(e.touches[0].clientX);
      }, { passive: false });

      sliderTrack.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (this.engine.state.paused) return;

        const currentY = e.touches[0].clientY;
        const dy = currentY - startY;

        if (dy > 30) {
          if (!isSoftDropping) {
            this.state.active.softDrop = true;
            isSoftDropping = true;
          }
        } else {
          if (isSoftDropping) {
            this.state.active.softDrop = false;
            isSoftDropping = false;
          }
        }

        updateAbsolutePosition(e.touches[0].clientX);
      }, { passive: false });

      sliderTrack.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (this.engine.state.paused) return;

        if (this.engine.state.pieceIdCtr === activeTouchPieceId) {
          this.engine.action('hardDrop');
        }

        sliderThumb.style.left = `50%`;
        sliderThumb.style.transform = `translateX(-50%)`;
        this.state.active.softDrop = false;
        isSoftDropping = false;
      });
    }
  }

  startBinding(action, btn) {
    this.state.bindingAction = action;
    document.querySelectorAll('.control-row button').forEach(b => b.classList.remove('binding'));
    btn.classList.add('binding');
    btn.innerText = "Press key...";
  }
}
