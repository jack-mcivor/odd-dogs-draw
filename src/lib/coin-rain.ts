// Tiny shiny coin rain — appends a fixed overlay for ~2s and cleans itself up.
let styleInjected = false;

function injectStyle() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-coin-rain", "");
  style.textContent = `
@keyframes coin-rain-fall {
  0%   { transform: translate3d(0, -10vh, 0) rotateY(0deg); opacity: 0; }
  10%  { opacity: 1; }
  100% { transform: translate3d(var(--cr-x, 0px), 110vh, 0) rotateY(1440deg); opacity: 1; }
}
.coin-rain-overlay {
  position: fixed; inset: 0; pointer-events: none; z-index: 9999;
  overflow: hidden;
}
.coin-rain-coin {
  position: absolute; top: 0;
  width: 14px; height: 14px; border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff6b8 0%, #ffd84d 35%, #c9931f 75%, #7a560f 100%);
  box-shadow:
    0 0 6px rgba(255, 215, 90, 0.85),
    0 0 14px rgba(255, 180, 40, 0.55),
    inset 0 0 3px rgba(255, 255, 255, 0.7);
  animation: coin-rain-fall linear forwards;
}
.coin-rain-coin::after {
  content: "$";
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font: 700 9px/1 system-ui, sans-serif;
  color: rgba(120, 80, 10, 0.85);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
}
`;
  document.head.appendChild(style);
}

export function rainCoins(count = 40, durationMs = 2000) {
  if (typeof document === "undefined") return;
  injectStyle();
  const overlay = document.createElement("div");
  overlay.className = "coin-rain-overlay";
  const vw = window.innerWidth;
  for (let i = 0; i < count; i++) {
    const c = document.createElement("div");
    c.className = "coin-rain-coin";
    const size = 8 + Math.random() * 12;
    const startX = Math.random() * vw;
    const driftX = (Math.random() - 0.5) * 120;
    const dur = 1200 + Math.random() * 900;
    const delay = Math.random() * 400;
    c.style.left = `${startX}px`;
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    c.style.setProperty("--cr-x", `${driftX}px`);
    c.style.animationDuration = `${dur}ms`;
    c.style.animationDelay = `${delay}ms`;
    overlay.appendChild(c);
  }
  document.body.appendChild(overlay);
  window.setTimeout(() => overlay.remove(), durationMs + 500);
}
