// LightReveal — cursor-light reveal scoped to a single display element.
// Layer A: the element's own text (untouched). Layer B: same glyphs filled with
// the brand film still + warm bloom, unmasked only inside an organic light pool
// that follows the pointer within the element's bounds (+40px grace).
// Lazy-inits on intersection, destroys on exit, canvas sized to the element.
// Global arbiter: at most one instance active at a time.
const EASE = 'cubic-bezier(.22,.61,.36,1)';
const GRACE = 40;
let engaged = null;
let img = null, imgP = null;
function loadImg(src) {
  if (imgP) return imgP;
  imgP = new Promise(res => { const i = new Image(); i.onload = () => { img = i; res(i); }; i.onerror = () => res(null); i.src = src; });
  return imgP;
}
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;

export class LightReveal {
  constructor(el, opts = {}) {
    this.el = el;
    this.src = opts.src || 'images/hero-frame.webp';
    this.R = 0;
    if (reduced()) return; // static: no effect at all
    this.io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) this.init(); else this.teardown(); });
    }, { rootMargin: '120px' });
    this.io.observe(el);
  }
  init() {
    if (this.ready || !this.el.isConnected) return;
    this.ready = true;
    loadImg(this.src).then(() => { if (this.ready && this.el.isConnected && !this.cv) this.build(); });
  }
  build() {
    const el = this.el;
    this.text = (el.textContent || '').trim();
    this.seed = Math.random() * 7;
    this.cv = document.createElement('canvas');
    this.cv.setAttribute('data-lr-canvas', '');
    Object.assign(this.cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.35s ' + EASE });
    el.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.mask = document.createElement('canvas'); this.mctx = this.mask.getContext('2d');
    this.fill = document.createElement('canvas'); this.fctx = this.fill.getContext('2d');
    this.measure();
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (this.cv) this.measure(); });
    this.ro = new ResizeObserver(() => { if (this.cv) this.measure(); });
    this.ro.observe(el);
    if (coarse()) {
      // Mobile: one slow autonomous pass per scroll-into-view, then still.
      this.autoIo = new IntersectionObserver(es => {
        es.forEach(e => {
          if (e.isIntersecting) { if (!this.autoDone) { this.autoDone = true; this.autoPass(); } }
          else this.autoDone = false;
        });
      }, { threshold: 0.55 });
      this.autoIo.observe(el);
    } else {
      this.onMove = (ev) => {
        const r = el.getBoundingClientRect();
        const inside = ev.clientX >= r.left - GRACE && ev.clientX <= r.right + GRACE && ev.clientY >= r.top - GRACE && ev.clientY <= r.bottom + GRACE;
        if (inside) {
          this.tx = ev.clientX - r.left; this.ty = ev.clientY - r.top;
          if (!this.on && !this.auto) { this.sx = this.tx; this.sy = this.ty; this.engage(); }
        } else if (this.on && !this.auto) this.disengage(false);
      };
      window.addEventListener('pointermove', this.onMove, { passive: true });
    }
  }
  measure() {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height; this.dpr = dpr; this.ms = 0.5;
    this.cv.width = Math.max(1, Math.round(r.width * dpr));
    this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.mask.width = Math.max(1, Math.round(this.cv.width * this.ms));
    this.mask.height = Math.max(1, Math.round(this.cv.height * this.ms));
    const cs = getComputedStyle(this.el);
    this.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    this.fctx.font = this.font;
    const m = this.fctx.measureText(this.text || '0');
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize);
    const fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
    this.baseY = (fa != null && fd != null) ? (lh - (fa + fd)) / 2 + fa : lh * 0.8;
    this.buildFill();
  }
  buildFill() {
    const W = this.cv.width, H = this.cv.height, f = this.fctx;
    this.fill.width = W; this.fill.height = H;
    f.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    f.clearRect(0, 0, this.w, this.h);
    f.font = this.font; f.textAlign = 'left'; f.textBaseline = 'alphabetic';
    f.fillStyle = '#000';
    f.fillText(this.text, 0, this.baseY);
    f.globalCompositeOperation = 'source-in';
    f.setTransform(1, 0, 0, 1, 0, 0);
    if (img) {
      const s = Math.max(W / img.width, H / img.height);
      const dw = img.width * s, dh = img.height * s;
      f.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      const g = f.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#E7BC63'); g.addColorStop(1, '#8F6A24');
      f.fillStyle = g; f.fillRect(0, 0, W, H);
    }
    // slight warm grade for legibility on the alabaster ground
    f.globalCompositeOperation = 'source-atop';
    f.fillStyle = 'rgba(36,29,16,0.18)';
    f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = 'source-over';
  }
  engage() {
    if (this.on || !this.cv) return;
    if (engaged && engaged !== this) engaged.disengage(true); // never two active at once
    engaged = this; this.on = true;
    clearTimeout(this.offT);
    this.running = true;
    this.cv.style.transition = 'opacity 0.35s ' + EASE;
    this.cv.style.opacity = '1';
    this.start();
  }
  disengage(fast) {
    if (!this.on) return;
    this.on = false; this.auto = null;
    if (engaged === this) engaged = null;
    if (!this.cv) return;
    const d = fast ? 0.3 : 2; // ~2s decay after the pointer leaves
    this.cv.style.transition = 'opacity ' + d + 's ' + EASE;
    this.cv.style.opacity = '0';
    clearTimeout(this.offT);
    this.offT = setTimeout(() => {
      this.running = false; this.R = 0;
      if (this.mctx) { this.mctx.setTransform(1, 0, 0, 1, 0, 0); this.mctx.clearRect(0, 0, this.mask.width, this.mask.height); }
    }, d * 1000 + 100);
  }
  autoPass() {
    if (engaged || this.on || !this.cv) return;
    this.engage();
    this.auto = { t0: performance.now(), dur: 2800 };
  }
  start() {
    if (this.raf) return;
    this.last = performance.now();
    const step = (t) => {
      this.raf = 0;
      if (!this.el.isConnected) { this.destroy(); return; }
      if (!this.cv) return;
      const dt = Math.min(50, t - this.last); this.last = t;
      this.frame(t, dt);
      if (this.running) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  frame(t, dt) {
    const m = this.mctx, k = this.dpr * this.ms;
    m.setTransform(k, 0, 0, k, 0, 0);
    m.globalCompositeOperation = 'destination-out';
    m.fillStyle = 'rgba(0,0,0,' + Math.min(1, dt / 900) + ')';
    m.fillRect(0, 0, this.w, this.h);
    let painting = false, px = this.lx || 0, py = this.ly || 0;
    if (this.auto) {
      const p = Math.min(1, (t - this.auto.t0) / this.auto.dur);
      const e = 1 - Math.pow(1 - p, 2);
      px = (-0.15 + 1.3 * e) * this.w;
      py = this.h * (0.5 + 0.16 * Math.sin(p * Math.PI * 2));
      painting = true;
      if (p >= 1) this.disengage(false);
    } else if (this.on) {
      this.sx += (this.tx - this.sx) * 0.18;
      this.sy += (this.ty - this.sy) * 0.18;
      px = this.sx; py = this.sy; painting = true;
    }
    if (painting) {
      this.lx = px; this.ly = py;
      const target = this.h * 0.85;
      this.R += (target - this.R) * (1 - Math.exp(-dt / 480)); // pool spreads while present
      m.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 3; i++) { // noise-feathered organic edge via drifting lobes
        const a = t * 0.0004 * (i + 1) + i * 2.094 + this.seed;
        const ox = Math.cos(a) * this.R * 0.22, oy = Math.sin(a * 1.31) * this.R * 0.18;
        const rr = Math.max(8, this.R * (0.72 + 0.2 * Math.sin(t * 0.0011 + i * 1.7 + this.seed)));
        const g = m.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, rr);
        g.addColorStop(0, 'rgba(255,255,255,0.34)');
        g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        m.fillStyle = g;
        m.fillRect(0, 0, this.w, this.h);
      }
    }
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.fill, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.imageSmoothingEnabled = true;
    c.drawImage(this.mask, 0, 0, this.cv.width, this.cv.height);
    if (this.R > 1) { // faint warm bloom, clipped inside the letterform
      c.globalCompositeOperation = 'source-atop';
      const gx = this.lx * this.dpr, gy = this.ly * this.dpr, gr = Math.max(10, this.R * 0.9 * this.dpr);
      const g = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, 'rgba(231,188,99,0.30)');
      g.addColorStop(1, 'rgba(231,188,99,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, this.cv.width, this.cv.height);
    }
    c.globalCompositeOperation = 'source-over';
  }
  teardown() {
    if (!this.ready) return;
    this.ready = false; this.running = false; this.auto = null;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    clearTimeout(this.offT);
    if (this.on && engaged === this) engaged = null;
    this.on = false;
    if (this.ro) { this.ro.disconnect(); this.ro = null; }
    if (this.autoIo) { this.autoIo.disconnect(); this.autoIo = null; }
    if (this.onMove) { window.removeEventListener('pointermove', this.onMove); this.onMove = null; }
    if (this.cv) this.cv.remove();
    this.cv = this.ctx = this.mask = this.mctx = this.fill = this.fctx = null;
    this.R = 0; this.autoDone = false;
  }
  destroy() {
    this.teardown();
    if (this.io) { this.io.disconnect(); this.io = null; }
  }
}
export function attachLightReveal(el, opts) { return new LightReveal(el, opts); }
