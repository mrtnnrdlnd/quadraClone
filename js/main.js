window.game = new QuadraEngine();

function resizeGame() {
  const wrapper = document.querySelector('.game-wrapper');

  if (window.innerWidth <= 768) {
    // Mobilläge: Spelets element är totalt ca 250px breda och 700px höga.
    // Vi skalar ned (men aldrig upp över 1) utifrån den axel som är mest begränsad.
    const scale = Math.min(1, window.innerWidth / 250, window.innerHeight / 700);
    wrapper.style.transform = `scale(${scale})`;
  } else {
    // Desktop: Skala enbart om fönstret är ovanligt lågt (t.ex. laptop-skärm)
    const scale = Math.min(1, window.innerHeight / 800);
    wrapper.style.transform = `scale(${scale})`;
  }
}

// Kör vid start och varje gång fönstret/skärmen ändrar storlek
window.addEventListener('resize', resizeGame);
window.addEventListener('orientationchange', resizeGame);
resizeGame();
