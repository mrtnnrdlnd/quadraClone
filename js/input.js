class InputManager {
  constructor(engine) {
    this.engine = engine;
    this.keys = {
      left: 'ArrowLeft', right: 'ArrowRight', softDrop: 'ArrowDown',
      hardDrop: 'Space', rotateCW: 'ArrowUp', rotateCCW: 'KeyZ', rotate180: 'KeyA'
    };
    this.state = { active: {}, lastDir: null, dasTimer: 0, arrTimer: 0, bindingAction: null };
    this.bindEvents();
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
      if (this.engine.state.gameOver || this.engine.state.isCascading || this.engine.state.isFlashing || this.engine.state.paused) return;

      const action = Object.keys(this.keys).find(k => this.keys[k] === e.code);
      if (action === 'left' || action === 'right') this.state.lastDir = action;

      if (action && !this.state.active[action]) {
        e.preventDefault();
        this.state.active[action] = true;
        if(['left','right'].includes(action)) { this.state.dasTimer = 0; this.state.arrTimer = 0; }
        this.engine.action(action);
      } else if (action) e.preventDefault();
    });

    window.addEventListener('keyup', e => {
      if (this.state.bindingAction) return;
      const action = Object.keys(this.keys).find(k => this.keys[k] === e.code);
      if (action) { e.preventDefault(); this.state.active[action] = false; }
    });
  }

  startBinding(action, btn) {
    this.state.bindingAction = action;
    document.querySelectorAll('.control-row button').forEach(b => b.classList.remove('binding'));
    btn.classList.add('binding'); btn.innerText = "Press key...";
  }
}
