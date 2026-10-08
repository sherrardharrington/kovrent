// BlobReveal — gooey cursor-trail that reveals a hidden statement inside the blob.
// Trail canvas accumulates soft strokes at the smoothed pointer; a goo threshold
// (SVG filter) hardens the edges into an organic pool in the brand parchment-gold;
// the hidden text is composited source-atop so it only exists inside the pool.
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;
let gooReady = false;
function ensureGoo() {
  if (gooReady || document.getElementById('kv-goo')) { gooReady = true; return; }
  const d = document.createElement('div');
  d.setAttribute('aria-hidden', 'true');
  d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  d.innerHTML = '<svg><defs><filter id="kv-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b"/><feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"/></filter></defs></svg>';
  document.body.appendChild(d);
  gooReady = true;
}

export class BlobReveal {
  constructor(el, opts = {}) {
    this.el = el;
    this.lines = opts.lines || ['We buy. We hold.', 'Permanently.'];
    this.blob = opts.blob || '#E9DCBD';
    this.ink = opts.ink || '#1F1A12';
    if (reduced()) return;
    this.io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) this.build(); else this.teardown(); });
    }, { rootMargin: '120px' });
    this.io.observe(el);
  }
  build() {
    if (this.cv || !this.el.isConnected) return;
    ensureGoo();
    const el = this.el;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    this.cv = document.createElement('canvas');
    // Decorative: sits behind the hero copy at reduced opacity so it never obscures a letterform.
    this.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.5';
    el.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.trail = document.createElement('canvas'); this.tctx = this.trail.getContext('2d');
    this.txt = document.createElement('canvas'); this.xctx = this.txt.getContext('2d');
    // filter url() support probe (Safari lacks it — fall back to soft-edged trail)
    this.ctx.filter = 'url(#kv-goo)';
    this.goo = this.ctx.filter !== 'none';
    this.ctx.filter = 'none';
    this.measure();
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (this.cv) this.measure(); });
    this.ro = new ResizeObserver(() => { if (this.cv) this.measure(); });
    this.ro.observe(el);
    this.has = false; // anything on the trail?
    if (coarse()) {
      this.autoIo = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting && !this.autoDone) { this.autoDone = true; this.auto = { t0: performance.now(), dur: 3600 }; this.start(); } });
      }, { threshold: 0.5 });
      this.autoIo.observe(el);
    } else {
      this.onMove = (ev) => {
        const r = el.getBoundingClientRect();
        const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        if (inside) {
          this.tx = ev.clientX - r.left; this.ty = ev.clientY - r.top;
          if (!this.on) { this.on = true; this.sx = this.tx; this.sy = this.ty; this.lx = this.tx; this.ly = this.ty; this.start(); }
        } else this.on = false;
      };
      window.addEventListener('pointermove', this.onMove, { passive: true });
    }
  }
  measure() {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height; this.dpr = dpr; this.ts = 0.5;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.trail.width = Math.max(1, Math.round(this.cv.width * this.ts));
    this.trail.height = Math.max(1, Math.round(this.cv.height * this.ts));
    this.txt.width = this.cv.width; this.txt.height = this.cv.height;
    const x = this.xctx;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, this.w, this.h);
    const fs = Math.min(this.w * 0.05, 44);
    if ('letterSpacing' in x) x.letterSpacing = (fs * 0.42).toFixed(2) + 'px';
    x.font = '800 ' + fs + 'px Orbitron, "Orbitron Fallback", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = this.ink;
    x.fillText('KOVRENT', this.w / 2 + fs * 0.21, this.h * 0.44);
    if ('letterSpacing' in x) x.letterSpacing = '0px';
  }
  start() {
    if (this.raf) return;
    this.last = performance.now();
    const step = (t) => {
      this.raf = 0;
      if (!this.cv || !this.el.isConnected) return;
      const dt = Math.min(50, t - this.last); this.last = t;
      this.frame(t, dt);
      if (this.on || this.auto || this.has) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  frame(t, dt) {
    const m = this.tctx, k = this.dpr * this.ts;
    m.setTransform(k, 0, 0, k, 0, 0);
    // slow erosion — the tail thins and dissolves like the reference
    m.globalCompositeOperation = 'destination-out';
    m.fillStyle = 'rgba(0,0,0,' + Math.min(1, dt / 2400) + ')';
    m.fillRect(0, 0, this.w, this.h);
    let px, py, painting = false;
    if (this.auto) {
      const p = Math.min(1, (t - this.auto.t0) / this.auto.dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      px = (0.08 + 0.84 * e) * this.w;
      py = this.h * (0.42 + 0.14 * Math.sin(p * Math.PI * 2.2));
      painting = p < 1;
      if (p >= 1) this.auto = null;
      if (painting && this.lx == null) { this.lx = px; this.ly = py; }
    } else if (this.on) {
      this.sx += (this.tx - this.sx) * 0.16;
      this.sy += (this.ty - this.sy) * 0.16;
      px = this.sx; py = this.sy; painting = true;
    }
    if (painting) {
      m.globalCompositeOperation = 'source-over';
      const R = Math.min(this.w, this.h) * 0.16;
      const dx = px - this.lx, dy = py - this.ly;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (R * 0.35)));
      for (let i = 1; i <= steps; i++) {
        const cx = this.lx + dx * i / steps, cy = this.ly + dy * i / steps;
        const rr = R * (0.85 + 0.3 * Math.sin(t * 0.0013 + i));
        const g = m.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, 'rgba(255,255,255,0.5)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        m.fillStyle = g;
        m.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      }
      this.lx = px; this.ly = py;
    }
    // composite
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    if (this.goo) c.filter = 'url(#kv-goo)';
    c.drawImage(this.trail, 0, 0, this.cv.width, this.cv.height);
    c.filter = 'none';
    // tint the pool to the brand parchment gold
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = this.blob;
    c.fillRect(0, 0, this.cv.width, this.cv.height);
    // hidden statement, only inside the pool
    c.globalCompositeOperation = 'source-atop';
    c.drawImage(this.txt, 0, 0);
    c.globalCompositeOperation = 'source-over';
    // is anything left?
    this.has = false;
    const s = m.getImageData(0, 0, this.trail.width, this.trail.height).data;
    for (let i = 3; i < s.length; i += 64) { if (s[i] > 6) { this.has = true; break; } }
    if (!this.has) c.clearRect(0, 0, this.cv.width, this.cv.height);
  }
  teardown() {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    if (this.ro) { this.ro.disconnect(); this.ro = null; }
    if (this.autoIo) { this.autoIo.disconnect(); this.autoIo = null; }
    if (this.onMove) { window.removeEventListener('pointermove', this.onMove); this.onMove = null; }
    if (this.cv) this.cv.remove();
    this.cv = this.ctx = this.trail = this.tctx = this.txt = this.xctx = null;
    this.on = false; this.auto = null; this.has = false; this.autoDone = false;
  }
  destroy() { this.teardown(); if (this.io) { this.io.disconnect(); this.io = null; } }
}
export function attachBlobReveal(el, opts) { return new BlobReveal(el, opts); }
