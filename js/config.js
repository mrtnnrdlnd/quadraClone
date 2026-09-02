const CONFIG = {
  COLS: 10, ROWS: 20, BLOCK_SIZE: 24, FLASH_DURATION: 100,
  COLORS: {
    O: '#ff6600', S: '#00c3c3', Z: '#cc0000', J: '#c3c300', L: '#b300b3', I: '#00b300', T: '#0000cc', GHOST: 'rgba(255, 255, 255, 0.18)'
  },
  BASE_SHAPES: {
    O: [[1,1], [1,1]],
    I: [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
    Z: [[0,0,0], [1,1,0], [0,1,1]],
    J: [[0,0,0], [1,1,1], [0,0,1]],
    L: [[0,0,0], [1,1,1], [1,0,0]],
    S: [[0,0,0], [0,1,1], [1,1,0]],
    T: [[0,0,0], [1,1,1], [0,1,0]]
  },
  KICKS: [{x:0,y:0}, {x:-1,y:0}, {x:1,y:0}, {x:-2,y:0}, {x:2,y:0}, {x:0,y:-1}, {x:0,y:-2}],
  TRANSLATIONS: {
    left: 'Left', right: 'Right', softDrop: 'Soft Drop',
    hardDrop: 'Hard Drop', rotateCW: 'Rotate CW', rotateCCW: 'Rotate CCW', rotate180: 'Rotate 180'
  }
};

const PRECALC_ROTATIONS = {};
for (const key in CONFIG.BASE_SHAPES) {
  PRECALC_ROTATIONS[key] = [CONFIG.BASE_SHAPES[key]];
  for (let i = 1; i < 4; i++) {
    const prev = PRECALC_ROTATIONS[key][i - 1];
    PRECALC_ROTATIONS[key].push(prev[0].map((_, col) => prev.map(row => row[col]).reverse()));
  }
}
