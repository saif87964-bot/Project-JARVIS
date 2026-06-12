// ── JARVIS — src/modules/boot.js ──────────────────────────────
// Boot-up animation. Plays once per browser session (cold start),
// tap to skip, skipped entirely under prefers-reduced-motion.
// Sits above the lock screen so the sequence is: boot → lock → app.
// Exports: initBoot() — call FIRST at startup.

const BOOTED_KEY = 'jv_booted'; // sessionStorage — clears on app close

export function initBoot() {
  const ov = document.getElementById('boot-overlay');
  if (!ov) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (sessionStorage.getItem(BOOTED_KEY) || reduced) {
    ov.remove();
    return;
  }
  sessionStorage.setItem(BOOTED_KEY, '1');

  ov.classList.add('active');

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    ov.classList.add('done');               // CSS fade/scale out
    setTimeout(() => ov.remove(), 600);
  };

  ov.addEventListener('click', finish);     // tap to skip
  setTimeout(finish, 2600);                  // full sequence length
}
