/**
 * audio.js
 * Looping background music. Starts on the first user interaction
 * to satisfy browser autoplay policies.
 */

const audio = new Audio('/background-music.mp3');
audio.loop   = true;
audio.volume = 0.4;

let started = false;

function start() {
  if (started) return;
  started = true;
  audio.play().catch(() => {
    // Autoplay still blocked — retry on next interaction
    started = false;
  });
}

['click', 'keydown', 'pointerdown'].forEach(evt =>
  window.addEventListener(evt, start, { once: false }),
);

export { audio };
