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
      'btn-rot-cw': 'rotateCW',
      'btn-rot-180': 'rotate180'
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
    let startX = 0;
    let startY = 0;
    let currentDragX = 0;
    let isSoftDropping = false;
    const sensitivity = 22; // Pixlar per block i sidled

    if (sliderTrack) {
      sliderTrack.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        currentDragX = 0;
        isSoftDropping = false;
        this.state.dasTimer = 0;
        this.state.arrTimer = 0;
      }, { passive: false });

      sliderTrack.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (this.engine.state.paused) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const dx = currentX - startX;
        const dy = currentY - startY;

        // --- Vertikal logik (Soft Drop) ---
        if (dy > 30 && !isSoftDropping) {
          this.state.active.softDrop = true;
          isSoftDropping = true;
        }

        // --- Horisontell logik (Sidledsflytt) ---
        const trackWidth = sliderTrack.clientWidth;
        const maxMove = trackWidth / 2 - 20; // 20 = halva tummens bredd
        let visualX = Math.max(-maxMove, Math.min(maxMove, dx));
        sliderThumb.style.transform = `translateX(calc(-50% + ${visualX}px))`;

        const blocksToMove = Math.trunc(dx / sensitivity);
        if (blocksToMove !== currentDragX) {
          const diff = blocksToMove - currentDragX;
          for(let i = 0; i < Math.abs(diff); i++) {
             if (diff > 0) this.engine.action('right');
             else this.engine.action('left');
          }
          currentDragX = blocksToMove;

          this.state.active.left = diff < 0;
          this.state.active.right = diff > 0;
          this.state.lastDir = diff < 0 ? 'left' : 'right';
        }
      }, { passive: false });

      sliderTrack.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (this.engine.state.paused) return;

        const changedTouch = e.changedTouches[0];
        const dy = changedTouch.clientY - startY;

        // --- Vertikal logik (Hard Drop) ---
        if (dy < -30) {
          this.engine.action('hardDrop');
        }

        // Återställ allt
        sliderThumb.style.transform = `translateX(-50%)`;
        this.state.active.left = false;
        this.state.active.right = false;
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
