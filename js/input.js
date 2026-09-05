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
    let startY = 0;
    let isSoftDropping = false;

    if (sliderTrack) {
      const updateAbsolutePosition = (clientX) => {
        if (!this.engine.state.current || this.engine.state.paused) return;

        const rect = sliderTrack.getBoundingClientRect();
        let touchX = clientX - rect.left;
        touchX = Math.max(0, Math.min(touchX, rect.width));

        // Visuell uppdatering (0% till 100% bredd)
        const percent = (touchX / rect.width) * 100;
        sliderThumb.style.left = `${percent}%`;
        sliderThumb.style.transform = `translateX(-50%)`;

        // Mappa sliderns bredd till de 10 kolumnerna på spelplanen (0-9)
        let targetX = Math.floor((touchX / rect.width) * 10);
        targetX = Math.max(0, Math.min(targetX, 9));

        let cur = this.engine.state.current;

        // Flytta pjäsen stegvis via motorns kollisionslogik tills den når targetX eller slår i något
        let safety = 0;
        while (cur.x < targetX && safety < 10) {
          let prevX = cur.x;
          this.engine.action('right');
          if (cur.x === prevX) break; // Stoppad av kollision
          safety++;
        }

        safety = 0;
        while (cur.x > targetX && safety < 10) {
          let prevX = cur.x;
          this.engine.action('left');
          if (cur.x === prevX) break; // Stoppad av kollision
          safety++;
        }
      };

      sliderTrack.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startY = e.touches[0].clientY;
        isSoftDropping = false;
        updateAbsolutePosition(e.touches[0].clientX);
      }, { passive: false });

      sliderTrack.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (this.engine.state.paused) return;

        const currentY = e.touches[0].clientY;
        const dy = currentY - startY;

        // --- Vertikal logik (Soft Drop) ---
        if (dy > 30 && !isSoftDropping) {
          this.state.active.softDrop = true;
          isSoftDropping = true;
        }

        // --- Horisontell logik (Absolut position) ---
        updateAbsolutePosition(e.touches[0].clientX);
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

        // Återställ knappen till mitten för nästa pjäs
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
