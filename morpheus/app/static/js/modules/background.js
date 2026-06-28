/**
 * Animated canvas backgrounds for Morpheus.
 * All rendering code is original.
 */

let _canvas, _ctx, _raf, _mode = "dots", _w, _h;

const MODES = ["dots", "constellation", "rain", "flow", "none"];

// ── Dots (floating particles that pulse) ─────────────────────────────────────
const dots = (() => {
  let pts = [];
  const N = 80, SPEED = 0.3, RADIUS = 1.8, CONNECT_DIST = 140;

  function init(w, h) {
    pts = Array.from({ length: N }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * SPEED,
      vy: (Math.random() - 0.5) * SPEED,
      r: RADIUS + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function draw(ctx, w, h, t) {
    const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#58a6ff";
    ctx.clearRect(0, 0, w, h);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
    });

    // Lines between close points
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < CONNECT_DIST) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = hexToRgba(color, (1 - d / CONNECT_DIST) * 0.35);
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    // Points
    pts.forEach(p => {
      const pulse = 0.6 + 0.4 * Math.sin(t * 0.001 + p.phase);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, 0.7 * pulse);
      ctx.fill();
    });
  }

  return { init, draw };
})();

// ── Constellation (star field with slow drift) ───────────────────────────────
const constellation = (() => {
  let stars = [];
  const N = 120, CONNECT = 110;

  function init(w, h) {
    stars = Array.from({ length: N }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: 0.8 + Math.random() * 1.2,
      bright: 0.4 + Math.random() * 0.6,
    }));
  }

  function draw(ctx, w, h, t) {
    const color = getComputedStyle(document.documentElement).getPropertyValue("--purple").trim() || "#bc8cff";
    ctx.clearRect(0, 0, w, h);
    stars.forEach(s => {
      s.x += s.vx; s.y += s.vy;
      if (s.x < -10) s.x = w + 10; if (s.x > w + 10) s.x = -10;
      if (s.y < -10) s.y = h + 10; if (s.y > h + 10) s.y = -10;
    });

    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < CONNECT) {
          ctx.beginPath();
          ctx.moveTo(stars[i].x, stars[i].y);
          ctx.lineTo(stars[j].x, stars[j].y);
          ctx.strokeStyle = hexToRgba(color, (1 - d / CONNECT) * 0.25);
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    stars.forEach(s => {
      const twinkle = s.bright * (0.7 + 0.3 * Math.sin(t * 0.0015 + s.x));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, twinkle);
      ctx.fill();
    });
  }

  return { init, draw };
})();

// ── Digital rain (Matrix-style columns) ──────────────────────────────────────
const rain = (() => {
  let cols = [], lastDrop = 0;
  const CHAR_SIZE = 14, DROP_INTERVAL = 45;
  const CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";

  function init(w, h) {
    const numCols = Math.floor(w / CHAR_SIZE);
    cols = Array.from({ length: numCols }, () => ({
      y: Math.random() * -h,
      speed: 1.5 + Math.random() * 3,
      chars: Array.from({ length: 20 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
    }));
  }

  function draw(ctx, w, h, t) {
    const color = getComputedStyle(document.documentElement).getPropertyValue("--green").trim() || "#98c379";
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${CHAR_SIZE}px 'Fira Code', monospace`;

    cols.forEach((col, i) => {
      col.y += col.speed;
      if (col.y > h + CHAR_SIZE * col.chars.length) {
        col.y = -CHAR_SIZE * col.chars.length * Math.random();
        col.speed = 1.5 + Math.random() * 3;
      }

      col.chars.forEach((ch, ci) => {
        const cy = col.y - ci * CHAR_SIZE;
        if (cy < 0 || cy > h) return;
        const alpha = ci === 0 ? 1 : Math.max(0, 1 - ci / col.chars.length);
        const isHead = ci === 0;
        ctx.fillStyle = isHead ? `rgba(255,255,255,${alpha * 0.9})` : hexToRgba(color, alpha * 0.7);
        ctx.fillText(ch, i * CHAR_SIZE, cy);
      });

      // Occasionally mutate a character
      if (Math.random() < 0.02) {
        const ri = Math.floor(Math.random() * col.chars.length);
        col.chars[ri] = CHARS[Math.floor(Math.random() * CHARS.length)];
      }
    });
  }

  return { init, draw };
})();

// ── Perlin-ish flow field ─────────────────────────────────────────────────────
const flow = (() => {
  let particles = [];
  const N = 200, SPEED = 1.2;

  function noise(x, y, t) {
    return Math.sin(x * 0.5 + t) * Math.cos(y * 0.4 + t * 0.7) +
           Math.sin(x * 0.3 - y * 0.2 + t * 1.3) * 0.5;
  }

  function init(w, h) {
    particles = Array.from({ length: N }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      age: Math.random() * 100,
      maxAge: 80 + Math.random() * 120,
      trail: [],
    }));
  }

  function draw(ctx, w, h, t) {
    const color = getComputedStyle(document.documentElement).getPropertyValue("--blue").trim() || "#61afef";
    const ts = t * 0.0003;
    ctx.clearRect(0, 0, w, h);

    particles.forEach(p => {
      const angle = noise(p.x / 120, p.y / 120, ts) * Math.PI * 2;
      p.x += Math.cos(angle) * SPEED;
      p.y += Math.sin(angle) * SPEED;
      p.age++;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 20) p.trail.shift();

      if (p.age > p.maxAge || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
        p.x = Math.random() * w; p.y = Math.random() * h;
        p.age = 0; p.trail = [];
      }

      if (p.trail.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(p.trail[0].x, p.trail[0].y);
      p.trail.forEach(pt => ctx.lineTo(pt.x, pt.y));
      const alpha = (1 - p.age / p.maxAge) * 0.4;
      ctx.strokeStyle = hexToRgba(color, alpha);
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  return { init, draw };
})();

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getRenderer() {
  return { dots, constellation, rain, flow }[_mode];
}

function resize() {
  if (!_canvas) return;
  _w = _canvas.width  = window.innerWidth;
  _h = _canvas.height = window.innerHeight;
  const r = getRenderer();
  if (r) r.init(_w, _h);
}

function tick(t) {
  const r = getRenderer();
  if (r) r.draw(_ctx, _w, _h, t);
  _raf = requestAnimationFrame(tick);
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function initBackground(mode) {
  _canvas = document.getElementById("bg-canvas");
  if (!_canvas) return;
  _ctx = _canvas.getContext("2d");
  setMode(mode || localStorage.getItem("morpheus_bg") || "dots");
  window.addEventListener("resize", resize);
}

export function setMode(mode) {
  _mode = MODES.includes(mode) ? mode : "dots";
  localStorage.setItem("morpheus_bg", _mode);
  if (_raf) cancelAnimationFrame(_raf);

  if (_mode === "none") {
    if (_ctx) _ctx.clearRect(0, 0, _w, _h);
    _canvas.style.display = "none";
    return;
  }

  _canvas.style.display = "block";
  resize();
  _raf = requestAnimationFrame(tick);
}

export function getModes() { return MODES; }
export function getCurrentMode() { return _mode; }
