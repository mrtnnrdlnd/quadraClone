window.game = new QuadraEngine();

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

  // Temporarily clear any transform so we measure the wrapper's natural (unscaled) size,
  // which includes the mobile touch controls when they're visible
  const prevTransform = wrapper.style.transform || '';
  wrapper.style.transform = 'none';

  // offsetWidth/offsetHeight measure layout size (not affected by transform)
  const naturalWidth = wrapper.offsetWidth || 250; // fall back to prior assumed sizes
  const naturalHeight = wrapper.offsetHeight || 700;

  // Compute a scale that fits the visual viewport while keeping aspect ratio
  const scale = Math.min(1, vw / naturalWidth, vh / naturalHeight);

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
