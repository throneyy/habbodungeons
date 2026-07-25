// The clothing-change poof: the classic client hides an outfit swap behind a
// burst of little white clouds (the same gag the Container Hand's expire uses
// via its Cloud Animation Effect). A handful of pixelated puffs pop around
// the avatar, billow outward, and fade — the outfit changes mid-cloud so the
// swap itself is never seen.
const PUFFS = 8;
const DUR_MS = 950; // whole effect
const SWAP_AT = 0.45; // fire the outfit swap while cover is at its thickest

// screenAt: () => ({x, y}) CSS-pixel centre of the avatar (feet).
// onSwap: called once, mid-poof, to actually change the clothes.
export function clothingPoof(screenAt, onSwap) {
  const host = document.createElement('div');
  host.className = 'poof';
  document.body.appendChild(host);
  const puffs = [];
  for (let i = 0; i < PUFFS; i++) {
    const p = document.createElement('div');
    p.className = 'poof-cloud';
    // ring of launch angles with a little jitter, biased upward over the body
    const a = (i / PUFFS) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    puffs.push({
      el: p,
      dx: Math.cos(a) * (14 + Math.random() * 10),
      dy: Math.sin(a) * (9 + Math.random() * 6) - 26,
      size: 12 + Math.floor(Math.random() * 10),
      spin: (Math.random() - 0.5) * 40,
    });
    host.appendChild(p);
  }
  const start = performance.now();
  let swapped = false;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / DUR_MS);
    const c = screenAt(); // re-read every frame: the avatar may be mid-step
    if (!swapped && t >= SWAP_AT) {
      swapped = true;
      onSwap();
    }
    // ease-out drift, quick pop-in then a long fade
    const drift = 1 - (1 - t) * (1 - t);
    const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    for (const p of puffs) {
      const s = p.size * (0.6 + 0.7 * drift);
      p.el.style.width = `${Math.round(s)}px`;
      p.el.style.height = `${Math.round(s * 0.75)}px`;
      p.el.style.left = `${Math.round(c.x + p.dx * drift - s / 2)}px`;
      p.el.style.top = `${Math.round(c.y - 24 + p.dy * drift - s / 2)}px`;
      p.el.style.opacity = Math.max(0, alpha).toFixed(2);
      p.el.style.transform = `rotate(${p.spin * drift}deg)`;
    }
    if (t < 1) requestAnimationFrame(tick);
    else host.remove();
  };
  requestAnimationFrame(tick);
}
