window.game = new QuadraEngine();
const MOBILE_MAX_SCALE = 2;

// The layout is split purely by orientation now: landscape (phone or desktop) always
// shows the side panels plus the rotate/slider touch controls, portrait shows a
// compact touch-only layout. Together these two cover every possible viewport, so
// there's no longer a third "no touch controls" in-between state.
function isLandscapeTouch() {
  return window.matchMedia('(orientation: landscape)').matches;
}

function isPortraitTouch() {
  return window.matchMedia('(orientation: portrait)').matches;
}

function getViewportSize() {
  const vv = window.visualViewport;
  return {
    width: vv ? vv.width : window.innerWidth,
    height: vv ? vv.height : window.innerHeight
  };
}

function updateVh() {
  // Use the visual viewport height on mobile when available (avoids address-bar issues)
  const vh = getViewportSize().height * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

function resizeGame() {
  const wrapper = document.querySelector('.game-wrapper');
  if (!wrapper) return;

  const { width: vw, height: vh } = getViewportSize();

  // Temporarily clear any transform so we can adjust sizes and measure the wrapper's
  // natural (unscaled) size. We set the slider width (if present) to match the board's
  // natural width before measuring so it is considered in the layout.
  const prevTransform = wrapper.style.transform || '';
  wrapper.style.transform = 'none';

  const board = document.getElementById('board');
  const sliderTrack = document.getElementById('slider-track');
  const mobileSlider = document.querySelector('.mobile-slider');
  const isPortrait = isPortraitTouch();

  if (sliderTrack && board && isPortrait) {
    // Use board's bounding rect (natural coords while transform is removed) so width/left
    // are consistent when aligning the slider and stats
    const wrapperRect = wrapper.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const boardNaturalWidth = Math.round(boardRect.width) || board.offsetWidth || 240;
    const leftRelativeToWrapper = Math.max(0, Math.round(boardRect.left - wrapperRect.left));

    if (mobileSlider) {
      // The slider now lives inside .quadra-layout (next to the board) so it can also sit
      // beside the board in landscape mode. In portrait we pull it out of that row with
      // absolute positioning and place it precisely below the board instead.
      mobileSlider.style.position = 'absolute';
      mobileSlider.style.left = `${leftRelativeToWrapper}px`;
      mobileSlider.style.top = `${Math.round(boardRect.bottom - wrapperRect.top)}px`;
      mobileSlider.style.width = `${boardNaturalWidth}px`;
      mobileSlider.style.maxWidth = 'none';
      mobileSlider.style.margin = '0';
      mobileSlider.style.display = '';

      // Make the inner track span the full width of the container
      sliderTrack.style.width = '100%';
      sliderTrack.style.maxWidth = 'none';
    } else {
      // fallback: set the track width directly
      sliderTrack.style.width = `${boardNaturalWidth}px`;
      sliderTrack.style.maxWidth = 'none';
    }

    // Position bottom-stats to the left of the board, aligned to board top
    const bottomStats = document.querySelector('.bottom-stats');
    if (bottomStats) {
      const bottomWidth = bottomStats.offsetWidth || bottomStats.clientWidth || 248;
      const gap = 4;
      let leftForBottom = Math.round(leftRelativeToWrapper - bottomWidth - gap);
      if (leftForBottom < 0) leftForBottom = 0;
      const topForBottom = Math.max(0, Math.round(boardRect.top - wrapperRect.top));

      bottomStats.style.position = 'absolute';
      bottomStats.style.left = `${leftForBottom}px`;
      bottomStats.style.top = `${topForBottom}px`;
      bottomStats.style.margin = '0';
      bottomStats.style.display = '';

      // Ensure stats are stacked vertically and visible above the board
      bottomStats.style.flexDirection = 'column';
      bottomStats.style.alignItems = 'flex-start';
      bottomStats.style.zIndex = '30';
      bottomStats.style.width = '';
    }
  } else {
    // Restore to stylesheet defaults (desktop, or landscape touch layout via CSS media query)
    if (sliderTrack) {
      sliderTrack.style.width = '';
      sliderTrack.style.maxWidth = '';
    }
    if (mobileSlider) {
      mobileSlider.style.position = '';
      mobileSlider.style.top = '';
      mobileSlider.style.left = '';
      mobileSlider.style.alignSelf = '';
      mobileSlider.style.marginLeft = '';
      mobileSlider.style.margin = '';
      mobileSlider.style.width = '';
      mobileSlider.style.maxWidth = '';
      mobileSlider.style.display = '';
    }

    const bottomStats = document.querySelector('.bottom-stats');
    if (bottomStats) {
      bottomStats.style.position = '';
      bottomStats.style.left = '';
      bottomStats.style.top = '';
      bottomStats.style.margin = '';
      bottomStats.style.display = '';
      bottomStats.style.flexDirection = '';
      bottomStats.style.alignItems = '';
      bottomStats.style.zIndex = '';
      bottomStats.style.width = '';
    }
  }

  // offsetWidth/offsetHeight measure layout size (not affected by transform). In portrait
  // mode the slider is absolutely positioned below the board (out of normal flow), so we
  // extend the measured natural height to make sure it's still accounted for when scaling.
  const naturalWidth = wrapper.offsetWidth || 250; // fall back to prior assumed sizes
  let naturalHeight = wrapper.offsetHeight || 700;
  if (isPortrait && mobileSlider) {
    const wrapperRect = wrapper.getBoundingClientRect();
    const sliderRect = mobileSlider.getBoundingClientRect();
    naturalHeight = Math.max(naturalHeight, Math.round(sliderRect.bottom - wrapperRect.top));
  }

  // Compute a scale that fits the visual viewport while keeping aspect ratio.
  // On mobile we also allow upscaling so the game can fill more of the screen.
  const fitScale = Math.min(vw / naturalWidth, vh / naturalHeight);
  const maxScale = (isPortrait || isLandscapeTouch()) ? MOBILE_MAX_SCALE : 1;
  const scale = Math.max(0.1, Math.min(maxScale, fitScale));

  // Apply the new scale
  wrapper.style.transform = `scale(${scale})`;

  if (window.game && window.game.input && window.game.input.syncSliderThumb) {
    window.game.input.syncSliderThumb();
  }
}

// Initialize and hook into relevant events. We keep resize/orientation handlers but also
// listen to visualViewport events on modern mobile browsers so the UI stays matched to
// the visible screen when the address bar shows/hides.
updateVh();
resizeGame();

window.addEventListener('resize', () => { updateVh(); resizeGame(); });
window.addEventListener('orientationchange', () => { updateVh(); resizeGame(); });

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => { updateVh(); resizeGame(); });
  window.visualViewport.addEventListener('scroll', () => { updateVh(); resizeGame(); });
}

// Ensure settings button is reliably tappable and avoid double-toggle issues by
// attaching direct handlers to the button and throttling repeated events.
(function ensureSettingsTouch() {
  const btn = document.getElementById('settings-btn');
  if (!btn) return;
  let lastToggleAt = 0;
  const THROTTLE_MS = 400;

  const doToggle = (e) => {
    const now = Date.now();
    if (now - lastToggleAt < THROTTLE_MS) {
      try { if (e && e.preventDefault) e.preventDefault(); } catch (err) {}
      try { if (e && e.stopPropagation) e.stopPropagation(); } catch (err) {}
      return;
    }
    lastToggleAt = now;
    try { if (e && e.preventDefault) e.preventDefault(); } catch (err) {}
    if (window.game && typeof window.game.toggleSettings === 'function') window.game.toggleSettings();
    try { if (e && e.stopPropagation) e.stopPropagation(); } catch (err) {}
  };

  // pointerdown covers mouse/touch/pen on modern browsers
  btn.addEventListener('pointerdown', doToggle, { passive: false });
  // Provide a click fallback for environments where pointer events aren't available
  btn.addEventListener('click', doToggle);
})();
