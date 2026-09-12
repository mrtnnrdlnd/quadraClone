window.game = new QuadraEngine();
const MOBILE_BREAKPOINT = 768;
const MOBILE_MAX_SCALE = 2;

function updateVh() {
  // Use the visual viewport height on mobile when available (avoids address-bar issues)
  const viewportHeight = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
  const vh = viewportHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

function resizeGame() {
  const wrapper = document.querySelector('.game-wrapper');
  if (!wrapper) return;

  const vw = (window.visualViewport && window.visualViewport.width) ? window.visualViewport.width : window.innerWidth;
  const vh = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;

  // Temporarily clear any transform so we can adjust sizes and measure the wrapper's
  // natural (unscaled) size. We set the slider width (if present) to match the board's
  // natural width before measuring so it is considered in the layout.
  const prevTransform = wrapper.style.transform || '';
  wrapper.style.transform = 'none';

  const board = document.getElementById('board');
  const sliderTrack = document.getElementById('slider-track');
  const mobileSlider = document.querySelector('.mobile-slider');

  if (sliderTrack && board && vw <= MOBILE_BREAKPOINT) {
    // Use board's bounding rect (natural coords while transform is removed) so width/left
    // are consistent when aligning the slider and stats
    const wrapperRect = wrapper.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const boardNaturalWidth = Math.round(boardRect.width) || board.offsetWidth || 240;
    const leftRelativeToWrapper = Math.max(0, Math.round(boardRect.left - wrapperRect.left));

    if (mobileSlider) {
      // Keep the slider in normal flow (so it's included in wrapper.offsetHeight) but
      // align it precisely under the board by using align-self + margin-left
      mobileSlider.style.alignSelf = 'flex-start';
      mobileSlider.style.marginLeft = `${leftRelativeToWrapper}px`;
      mobileSlider.style.width = `${boardNaturalWidth}px`;
      mobileSlider.style.maxWidth = 'none';
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
    // Restore to stylesheet defaults on larger screens
    if (sliderTrack) {
      sliderTrack.style.width = '';
      sliderTrack.style.maxWidth = '';
    }
    if (mobileSlider) {
      mobileSlider.style.alignSelf = '';
      mobileSlider.style.marginLeft = '';
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
    }
  }

  // offsetWidth/offsetHeight measure layout size (not affected by transform)
  const naturalWidth = wrapper.offsetWidth || 250; // fall back to prior assumed sizes
  const naturalHeight = wrapper.offsetHeight || 700;

  // Compute a scale that fits the visual viewport while keeping aspect ratio.
  // On mobile we also allow upscaling so the game can fill more of the screen.
  const fitScale = Math.min(vw / naturalWidth, vh / naturalHeight);
  const maxScale = vw <= MOBILE_BREAKPOINT ? MOBILE_MAX_SCALE : 1;
  const scale = Math.max(0.1, Math.min(maxScale, fitScale));

  // Apply the new scale
  wrapper.style.transform = `scale(${scale})`;
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
