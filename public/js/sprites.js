/* ------------------------------------------------------------------
   sprites.js — tiny procedural pixel-art engine + every sprite on the site.
   Everything is drawn into low-res canvases (1 canvas px = 1 art pixel)
   and scaled up with CSS `image-rendering: pixelated`.
------------------------------------------------------------------- */
(function () {
  'use strict';

  const PAL = {
    K: '#16183b', H: '#2b2f6a',                 // ink / hair sheen
    O: '#ee5f2b', o: '#c4451c',                 // orange / orange shade
    B: '#1a52a8', b: '#123f86', L: '#3f7fe0',   // blue / dark blue / light blue
    S: '#e8a869', s: '#cf8752',                 // skin / skin shade
    W: '#f3ecd8', w: '#d6cbaf',                 // cream / cream shade
    G: '#1f9d6b', g: '#34c98b',                 // green (eyes) / light green
    R: '#b8321f', Y: '#f5c431', y: '#d99a1c',   // red / yellow / dark yellow
    P: '#ef8a7a'                                // blush
  };
  const rgbCache = {};
  function rgb(c) {
    const hex = PAL[c] || c;
    if (!rgbCache[hex]) rgbCache[hex] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return rgbCache[hex];
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (a, b, c) => ((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) >>> 0;

  class Buf {
    constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
    set(x, y, c) {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      this.d[y * this.w + x] = c;
    }
    get(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
      return this.d[y * this.w + x];
    }
    rect(x, y, w, h, c) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    }
    // scanline polygon fill, pixel-centre sampling
    poly(pts, c) {
      const ys = pts.map(p => p[1]);
      const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
      for (let y = y0; y <= y1; y++) {
        const cy = y + 0.5, xs = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
            xs.push(a[0] + (cy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
          }
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          for (let x = Math.ceil(xs[i] - 0.5); x < Math.ceil(xs[i + 1] - 0.5); x++) this.set(x, y, c);
        }
      }
    }
    ell(cx, cy, rx, ry, c) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) this.set(x, y, c);
        }
    }
    ring(cx, cy, r, t, c, yMax = 1e9) {
      for (let y = Math.floor(cy - r); y <= Math.min(Math.ceil(cy + r), yMax); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d <= r && d > r - t) this.set(x, y, c);
        }
    }
    // elliptical ring (headphone bands), top part only when yMax given
    ering(cx, cy, rx, ry, t, c, yMax = 1e9) {
      for (let y = Math.floor(cy - ry); y <= Math.min(Math.ceil(cy + ry), yMax); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
          if (d <= 1 && d > 1 - t / Math.min(rx, ry)) this.set(x, y, c);
        }
    }
    line(x0, y0, x1, y1, c, th = 1) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.rect(x0, y0, th, th, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    outline(c) {
      const src = this.d.slice();
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        if ((x > 0 && src[y * this.w + x - 1]) || (x < this.w - 1 && src[y * this.w + x + 1]) ||
            (y > 0 && src[(y - 1) * this.w + x]) || (y < this.h - 1 && src[(y + 1) * this.w + x])) {
          this.d[y * this.w + x] = c;
        }
      }
    }
    blit(o) { for (let i = 0; i < o.d.length; i++) if (o.d[i]) this.d[i] = o.d[i]; }
    render(canvas) {
      canvas.width = this.w; canvas.height = this.h;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(this.w, this.h);
      for (let i = 0; i < this.d.length; i++) {
        const c = this.d[i]; if (!c) continue;
        const v = rgb(c);
        img.data[i * 4] = v[0]; img.data[i * 4 + 1] = v[1]; img.data[i * 4 + 2] = v[2]; img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
  }

  // draw a shape on its own layer, outline it, stamp it on the sprite
  function part(main, fn, o) {
    o = o || {};
    const t = new Buf(main.w, main.h);
    fn(t);
    if (o.outline !== false) t.outline('K');
    main.blit(t);
  }

  /* =================================================================
     THE CHARACTER — headphones, bob hair, colour-block jacket, selfie
     ================================================================= */
  function buildHero(t) {
    const blink = (t % 27) >= 25;
    const m = new Buf(40, 104);
    const P = (fn, o) => part(m, fn, o);

    // legs
    P(b => {
      b.poly([[11, 58], [19, 58], [18.5, 88], [12.5, 88]], 'S');
      b.poly([[17, 58], [19, 58], [18.5, 88], [17, 88]], 's');
      b.poly([[21, 58], [28, 58], [26.5, 88], [21.5, 88]], 'S');
      b.poly([[26, 58], [28, 58], [26.5, 88], [25, 88]], 's');
      b.rect(12, 70, 1, 1, 'R'); b.rect(13, 71, 2, 1, 'R'); b.rect(15, 70, 1, 1, 'R');
      b.rect(22, 70, 1, 1, 'R'); b.rect(23, 71, 2, 1, 'R'); b.rect(25, 70, 1, 1, 'R');
    });
    // socks + sneakers
    [[10.5, 'a'], [20.5, 'b']].forEach(([x]) => {
      P(b => {
        b.rect(x + 2, 87, 5, 5, 'W');
        b.rect(x + 2, 89, 1, 3, 'w');
        b.poly([[x + 1, 91], [x + 8, 91], [x + 9.5, 96], [x + 8.5, 99], [x - 0.5, 99], [x - 0.5, 94]], 'W');
        b.poly([[x + 1, 92], [x + 5, 92], [x + 5, 96], [x, 96], [x, 94]], 'O');
        b.rect(x - 1, 97, 11, 2, 'w');
        for (let i = 0; i < 5; i++) b.set(x - 1 + i * 2 + 1, 98, 'K');
        b.rect(x + 6, 93, 2, 1, 'O');
      });
    });
    // shorts
    P(b => {
      b.poly([[10, 53], [30, 53], [29.5, 61], [21.5, 61], [20.5, 58], [19, 58], [18.5, 61], [10.5, 61]], 'K');
      b.rect(11, 59, 7, 1, 'H'); b.rect(22, 59, 7, 1, 'H');
    });
    // jacket (orange lower half)
    P(b => {
      b.poly([[9, 34], [31, 34], [32, 42], [30.5, 56], [9.5, 56], [8, 42]], 'O');
      b.poly([[27, 38], [31.5, 38], [30.5, 56], [27, 56]], 'o');
      b.rect(9, 54, 22, 2, 'o');
      b.rect(19, 34, 2, 10, 'W');
      b.rect(19, 44, 3, 11, 'K');
    });
    // blue top (upper half)
    P(b => {
      b.poly([[7, 28], [10, 23], [14, 21], [28, 21], [31, 24], [32, 30], [31, 36], [9, 36], [7.5, 34]], 'B');
      b.poly([[9, 33], [31, 33], [31, 36], [9, 36]], 'b');
      b.rect(8, 27, 1, 7, 'O');
    });
    // left arm (hanging): blue sleeve + big white sleeve + fist
    P(b => {
      b.poly([[4, 27], [9, 24], [11, 30], [10, 36], [4, 35]], 'B');
      b.poly([[3, 35], [10, 36], [10, 46], [8.5, 55], [2.5, 54], [1.5, 46]], 'W');
      b.poly([[1.5, 46], [3, 35], [5, 35.5], [4.5, 54], [2.5, 54]], 'w');
      b.rect(3, 53, 6, 1, 'w');
      b.poly([[3, 54], [8.5, 54], [9, 59], [5, 60.5], [2.5, 58]], 'S');
      b.rect(4, 57, 4, 1, 's'); b.rect(7, 55, 1, 3, 's');
    });
    // crossbody strap + bag
    P(b => {
      b.line(14, 22, 23, 31, 'K', 1);
      b.poly([[23, 31], [29, 30], [30, 38], [24, 40], [22, 36]], 'K');
      b.rect(24, 32, 4, 1, 'H'); b.rect(29, 33, 1, 3, 'H');
    }, { outline: false });
    // raised arm (orange sleeve, selfie pose)
    P(b => {
      b.poly([[27, 22], [31, 21], [35, 25], [38, 32], [37, 40], [31, 41], [31, 33], [29, 28]], 'O');
      b.poly([[34, 31], [38, 32], [37, 40], [33, 40.5]], 'o');
      b.rect(27, 21, 4, 2, 'K');
    });
    // hood collar + neck
    P(b => {
      b.poly([[13, 23], [17, 19], [26, 19], [29, 23], [28, 27], [24, 28], [17, 28], [14, 27]], 'W');
      b.poly([[14, 26], [28, 26], [24, 28], [17, 28]], 'w');
      b.poly([[18, 19.5], [25, 19.5], [21.5, 25]], 'S');
    });
    P(b => { b.rect(19, 16, 5, 4, 's'); b.rect(19, 18, 5, 1, 'K'); }, { outline: false });
    // hair (back bob)
    P(b => {
      b.poly([[14, 6], [16, 3], [20, 1.5], [25, 2], [28, 5], [28.5, 10], [28, 17], [26.5, 19.5], [15, 19.5], [13.5, 17], [13.5, 10]], 'K');
      b.rect(17, 4, 3, 1, 'H'); b.rect(15, 8, 1, 6, 'H'); b.rect(27, 7, 1, 5, 'H');
    });
    // face
    P(b => {
      b.poly([[15.5, 8], [26.5, 8], [27.5, 12], [26, 17], [22, 18.5], [18, 18], [15.5, 15]], 'S');
      b.poly([[24, 12], [27.5, 12], [26, 17], [22, 18.5]], 's');
      b.set(17, 15, 'P'); b.set(18, 15, 'P');
    }, { outline: false });
    // fringe
    P(b => {
      b.poly([[14, 10], [14, 6], [17, 3], [24, 2.5], [28, 5], [28, 10], [26, 8], [22, 6.5], [19, 7.5], [17, 10], [16, 12]], 'K');
      b.rect(18, 4, 2, 1, 'H'); b.rect(22, 4, 3, 1, 'H');
    }, { outline: false });
    // headphones
    P(b => {
      b.ering(21, 10, 8.5, 8.5, 1.6, 'O', 9);
      b.rect(12, 9, 3, 8, 'O');
      b.rect(11, 10, 1, 6, 'W');
      b.rect(12, 10, 2, 6, 'W');
      b.rect(14, 10, 1, 6, 'o');
    });
    // eye (the right one is hidden behind the phone)
    if (!blink) {
      m.rect(17, 9, 5, 1, 'K'); m.set(22, 10, 'K');
      m.rect(18, 11, 3, 3, 'G'); m.set(19, 12, 'K'); m.set(18, 11, 'W'); m.set(20, 13, 'g');
    } else {
      m.rect(17, 12, 5, 1, 'K');
    }
    m.rect(17, 8, 4, 1, 'K'); // brow
    m.rect(20, 16, 2, 1, 'R');
    // phone + fingers
    P(b => {
      b.rect(23, 11, 7, 12, 'O');
      b.rect(29, 11, 1, 12, 'o');
      b.rect(23, 11, 7, 1, 'W');
      b.rect(24, 13, 3, 3, 'W');
      b.set(24, 13, 'K'); b.set(26, 13, 'K'); b.set(24, 15, 'K'); b.set(26, 15, 'K');
    });
    P(b => {
      b.poly([[27, 16], [32.5, 17], [33, 24], [28, 24.5]], 'S');
      b.rect(29, 19, 4, 1, 's'); b.rect(29, 21, 4, 1, 's');
      b.rect(26, 15, 2, 3, 'S');
    });
    return m;
  }

  /* ---------------- bust portrait (About section) ---------------- */
  function buildBust(t) {
    const blink = (t % 33) >= 31;
    const m = new Buf(64, 64);
    const P = (fn, o) => part(m, fn, o);
    // hoodie
    P(b => {
      b.poly([[1, 64], [5, 53], [16, 46], [48, 46], [59, 53], [63, 64]], 'O');
      b.poly([[50, 50], [59, 53], [63, 64], [52, 64]], 'o');
      b.poly([[22, 64], [24, 52], [41, 52], [44, 64]], 'B');
      b.poly([[22, 60], [43, 60], [44, 64], [22, 64]], 'b');
    });
    // hood collar
    P(b => { b.poly([[17, 47], [22, 41], [43, 41], [48, 47], [43, 53], [22, 53]], 'O'); b.poly([[22, 51], [43, 51], [43, 53], [22, 53]], 'o'); });
    // neck
    P(b => { b.rect(28, 36, 10, 11, 'S'); b.rect(28, 36, 10, 5, 's'); }, { outline: false });
    // drawstrings
    P(b => {
      b.line(33, 52, 33, 61, 'W'); b.line(38, 52, 39, 58, 'W');
      b.ell(33.5, 62, 1.6, 1.8, 'W');
    });
    // hair back (short)
    P(b => {
      b.ell(35, 20, 19.5, 17, 'K');
      b.rect(26, 7, 4, 1, 'H'); b.rect(41, 9, 3, 1, 'H');
    });
    // face
    P(b => {
      b.poly([[21, 22], [24, 14], [35, 11], [46, 14], [49, 22], [48, 32], [43, 40], [35, 43], [27, 40], [22, 32]], 'S');
      b.poly([[44, 20], [49, 22], [48, 32], [43, 40], [38, 42]], 's');
      b.set(25, 34, 'P'); b.set(26, 34, 'P'); b.set(27, 34, 'P'); b.set(44, 34, 'P'); b.set(43, 34, 'P'); b.set(42, 34, 'P');
    }, { outline: false });
    // baseball cap
    P(b => {
      b.poly([[17, 15], [18, 8], [23, 3], [30, 1], [40, 1], [47, 3], [52, 8], [53, 15]], 'B');
      b.poly([[45, 3], [52, 8], [53, 15], [44, 15]], 'b');
      b.rect(26, 5, 3, 1, 'L');
    });
    // bill: curved visor hanging over the forehead
    P(b => { b.poly([[19, 15], [51, 15], [53, 16], [47, 18], [35, 19], [23, 18], [17, 16]], 'b'); });
    // eyes
    [[29, 28], [42, 28]].forEach(([cx, cy]) => {
      if (!blink) {
        m.rect(cx - 3, cy - 2, 6, 5, 'W');
        m.rect(cx - 2, cy - 2, 4, 5, 'G'); m.rect(cx - 1, cy - 1, 2, 3, 'K');
        m.set(cx - 2, cy - 2, 'W'); m.set(cx + 1, cy + 1, 'g');
        m.rect(cx - 4, cy - 3, 8, 1, 'K'); m.set(cx + 4, cy - 2, 'K'); m.set(cx - 4, cy - 2, 'K');
      } else {
        m.rect(cx - 4, cy, 8, 1, 'K'); m.set(cx - 4, cy - 1, 'K'); m.set(cx + 3, cy - 1, 'K');
      }
    });
    // glasses
    const frame = (x0, y0, x1, y1) => {
      m.rect(x0, y0, x1 - x0 + 1, 1, 'K'); m.rect(x0, y1, x1 - x0 + 1, 1, 'K');
      m.rect(x0, y0, 1, y1 - y0 + 1, 'K'); m.rect(x1, y0, 1, y1 - y0 + 1, 'K');
    };
    frame(23, 23, 34, 32); frame(36, 23, 47, 32);
    m.set(35, 27, 'K');                                      // bridge
    m.set(24, 24, 'W'); m.set(25, 24, 'W'); m.set(37, 24, 'W'); m.set(38, 24, 'W'); // glints
    m.rect(25, 21, 6, 1, 'K'); m.rect(39, 21, 6, 1, 'K');   // brows
    m.set(35, 33, 's'); m.set(36, 33, 's');                 // nose
    m.rect(33, 37, 5, 1, 'R'); m.set(32, 36, 'R'); m.set(38, 36, 'R'); // smile
    return m;
  }

  /* ---------------- eyes close-up (player widget) ---------------- */
  function buildEyes(t) {
    const blink = (t % 22) >= 20;
    const m = new Buf(64, 30);
    m.rect(0, 0, 64, 30, 'S');
    // hair + headphones at the edges
    m.poly([[0, 0], [64, 0], [64, 9], [52, 6], [38, 9], [26, 6], [12, 9], [0, 7]], 'K');
    m.rect(0, 6, 8, 24, 'O'); m.rect(1, 8, 4, 18, 'W'); m.rect(5, 8, 2, 18, 'w');
    m.rect(56, 6, 8, 24, 'O'); m.rect(59, 8, 4, 18, 'W'); m.rect(57, 8, 2, 18, 'w');
    m.rect(8, 6, 2, 24, 'K'); m.rect(54, 6, 2, 24, 'K');
    [[22, 18], [42, 18]].forEach(([cx, cy], i) => {
      if (!blink) {
        m.ell(cx, cy, 7, 5, 'W');
        m.ell(cx, cy + 0.5, 4, 4.6, 'G'); m.rect(cx - 1, cy - 1, 3, 4, 'K');
        m.rect(cx - 3, cy - 3, 2, 2, 'W'); m.set(cx + 1, cy + 2, 'g');
        m.rect(cx - 8, cy - 6, 16, 2, 'K');
        m.set(cx - 9, cy - 5, 'K'); m.set(cx + 8, cy - 5, 'K'); m.set(cx + 9, cy - 4, 'K');
      } else {
        m.rect(cx - 8, cy - 1, 16, 2, 'K');
      }
      const dir = i ? 1 : -1;
      m.line(cx - 7, cy - 10 + (dir > 0 ? 0 : 1), cx + 7, cy - 10 + (dir > 0 ? 1 : 0), 'K');
    });
    m.rect(31, 24, 2, 1, 's');
    m.rect(0, 0, 64, 2, 'K'); m.rect(0, 28, 64, 2, 'K');
    return m;
  }

  /* ---------------- scenes ---------------- */
  /* ---------------- project scenes (all 64x40) ---------------- */
  function stamp(m, rows, x, y, c, s) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') m.rect(x + i * s, y + j * s, s, s, c); });
  }

  // Mental Health Analyser — pulsing heart + scrolling ECG
  function buildMind(t) {
    const m = new Buf(64, 40);
    m.rect(0, 0, 64, 40, 'b');
    for (let y = 3; y < 40; y += 6) for (let x = 3; x < 64; x += 6) m.set(x, y, 'B');
    const beat = (Math.floor(t / 2) % 9) < 2;
    stamp(m, ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'], 18, beat ? 2 : 4, beat ? '#ff8a4a' : 'O', 3);
    const d = [0, 0, 0, 0, 0, 0, 0, 0, -2, -10, 8, -3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const sh = Math.floor(t / 2) * 2;
    let py = 31;
    for (let x = 0; x < 64; x++) {
      const y = 31 + d[(x + sh) % 24];
      m.line(x - 1, py, x, y, 'g'); py = y;
    }
    m.rect(3, 3, 8, 2, 'W'); m.rect(3, 6, 5, 1, 'L');
    return m;
  }

  // Dolge — video player with captions, progress and waveform
  function buildVideo(t) {
    const m = new Buf(64, 40);
    m.rect(0, 0, 64, 40, 'K');
    m.rect(2, 2, 60, 10, 'B'); m.rect(2, 12, 60, 6, '#f2782f'); m.rect(2, 18, 60, 10, 'O');
    m.ell(46, 18, 5, 5, 'W'); m.rect(2, 15, 60, 1, 'Y');
    m.poly([[2, 28], [2, 22], [12, 19], [22, 23], [32, 20], [44, 24], [54, 21], [62, 24], [62, 28]], 'K');
    m.poly([[27, 8], [27, 22], [40, 15]], 'K'); m.poly([[29, 11], [29, 19], [36, 15]], 'W');
    m.rect(10, 24, 44, 2, 'W'); m.rect(10 + (Math.floor(t / 3) * 7) % 38, 24, 6, 2, 'Y');
    m.rect(16, 26, 32, 1, 'W');
    m.rect(2, 30, 60, 2, 'H'); m.rect(2, 30, 1 + Math.floor(t / 2) % 60, 2, 'O');
    const k = Math.floor(t / 2);
    for (let x = 2; x < 62; x += 3) { const h = 1 + hash(x, 3, k) % 6; m.rect(x, 39 - h, 2, h, 'L'); }
    return m;
  }

  // Smart Mirror — oval mirror, smiling face, speech bubble
  function buildMirror(t) {
    const m = new Buf(64, 40);
    m.rect(0, 0, 64, 40, '#1d2159');
    const s = rng(9);
    for (let i = 0; i < 8; i++) { const x = Math.floor(s() * 64), y = Math.floor(s() * 40); if (hash(x, y, Math.floor(t / 4)) % 5) m.set(x, y, 'W'); }
    m.ell(22, 21, 13, 18, 'Y'); m.ell(22, 21, 11, 16, 'L');
    m.rect(14, 10, 2, 9, '#9cc4f5'); m.rect(17, 8, 1, 3, '#9cc4f5');
    m.ell(22, 24, 6, 7, 'S'); m.poly([[15, 22], [16, 16], [22, 14], [28, 16], [29, 22], [26, 19], [22, 17], [18, 19]], 'K');
    const blink = (t % 22) >= 20;
    if (blink) { m.rect(19, 23, 2, 1, 'K'); m.rect(24, 23, 2, 1, 'K'); } else { m.rect(19, 22, 1, 2, 'K'); m.rect(25, 22, 1, 2, 'K'); }
    m.rect(20, 28, 5, 1, 'R'); m.set(19, 27, 'R'); m.set(25, 27, 'R');
    m.rect(21, 0, 2, 2, (Math.floor(t / 3) % 2) ? 'R' : '#5a1a14');
    m.rect(38, 6, 22, 14, 'W'); m.poly([[38, 15], [33, 21], [41, 18]], 'W');
    const a = Math.floor(t / 3) % 3;
    for (let i = 0; i < 3; i++) m.rect(43 + i * 6, 11 + (i === a ? -1 : 0), 3, 3, 'K');
    if (Math.floor(t / 4) % 2) { m.rect(58, 28, 1, 5, 'W'); m.rect(56, 30, 5, 1, 'W'); }
    return m;
  }

  // Auto Shelf Restocker — shelves with a YOLO box on the missing slot
  function buildShelf(t) {
    const m = new Buf(64, 40);
    m.rect(0, 0, 64, 40, 'b');
    const r = rng(21), cols = ['O', 'W', 'Y', 'L', 'g'];
    [12, 25, 38].forEach((py, si) => {
      let x = 3;
      while (x < 61) {
        const w = 6 + Math.floor(r() * 4), h = 6 + Math.floor(r() * 5), c = cols[Math.floor(r() * cols.length)];
        if (!(si === 1 && x >= 22 && x < 40)) { m.rect(x, py - h, w, h, c); m.rect(x, py - h, w, 1, 'K'); m.rect(x + w - 1, py - h, 1, h, 'K'); }
        x += w + 2;
      }
      m.rect(0, py, 64, 2, 'y');
    });
    const on = Math.floor(t / 3) % 4 !== 3;
    const bc = on ? 'g' : 'G';
    m.rect(22, 14, 18, 1, bc); m.rect(22, 24, 18, 1, bc); m.rect(22, 14, 1, 11, bc); m.rect(39, 14, 1, 11, bc);
    m.rect(22, 11, 14, 3, bc); m.rect(24, 12, 3, 1, 'K'); m.rect(29, 12, 5, 1, 'K');
    return m;
  }

  // Food Waste Management — plate with a leaf + falling waste chart
  function buildLeaf(t) {
    const m = new Buf(64, 40);
    m.rect(0, 0, 64, 40, '#14724d'); m.rect(0, 32, 64, 8, '#0e5a3c');
    m.ell(18, 27, 14, 5, 'W'); m.ell(18, 26, 11, 3.5, 'w');
    m.poly([[10, 25], [13, 15], [21, 10], [26, 11], [25, 19], [18, 26]], 'g');
    m.poly([[10, 25], [13, 15], [17, 13], [14, 21]], 'G');
    m.line(11, 24, 23, 12, 'W');
    [22, 18, 13, 9, 5].forEach((h, i) => {
      m.rect(36 + i * 5, 36 - h, 4, h, i < 2 ? 'Y' : i < 3 ? 'y' : 'g');
    });
    m.line(36, 9, 56, 21, 'W'); m.poly([[56, 23], [58, 17], [52, 20]], 'W');
    if (Math.floor(t / 3) % 2) m.rect(56, 31, 4, 4, 'W');
    return m;
  }

  /* ---------------- 9x9-ish icons (rendered as inline SVG, themeable) ---------------- */
  const ICONS = {
    mail: ['#########', '##.....##', '#.#...#.#', '#..#.#..#', '#...#...#', '#.......#', '#########'],
    heart: ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
    star: ['....#....', '...###...', '#########', '.#######.', '..#####..', '.###.###.', '.#.....#.'],
    note: ['...#####', '...#...#', '...#...#', '...#...#', '.###.###', '.###.###'],
    download: ['...###...', '...###...', '...###...', '#########', '.#######.', '..#####..', '...###...', '.........', '#########'],
    sun: ['....#....', '.#..#..#.', '..#####..', '#.#####.#', '..#####..', '.#..#..#.', '....#....'],
    moon: ['..####..', '.###....', '###.....', '###.....', '###.....', '.###...#', '..#####.', '...###..'],
    arrow: ['...#....', '....#...', '#######.', '....#...', '...#....'],
    menu: ['#######', '.......', '#######', '.......', '#######'],
    close: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
    play: ['##.....', '####...', '######.', '#######', '######.', '####...', '##.....'],
    pause: ['###.###', '###.###', '###.###', '###.###', '###.###', '###.###'],
    prev: ['#...#', '#..##', '#.###', '#####', '#.###', '#..##', '#...#'],
    next: ['#...#', '##..#', '###.#', '#####', '###.#', '##..#', '#...#'],
    up: ['...#...', '..###..', '.#####.', '#######', '...#...', '...#...'],
    dot: ['.##.', '####', '####', '.##.'],
    bike: ['..........##.', '....###..#...', '.....#...#...', '.....#####...', '.###.#.#.###.', '#...##...#..#', '#..#.#..#...#', '#...#.#.#...#', '.###.....###.'],
    swim: ['.........##....', '.........##.###', '...########....', '...............', '#..##..##..##..', '.##..##..##..##', '...............', '#..##..##..##..'],
    book: ['..####..####..', '.#....##....#.', '#..##.##.##..#', '#.....##.....#', '#..##.##.##..#', '#.....##.....#', '#..##.##.##..#', '.#....##....#.', '..####..####..'],
    travel: ['....####....', '....#..#....', '############', '#..#....#..#', '#..#....#..#', '#..#....#..#', '#..#....#..#', '############', '.##......##.'],
    music: ['...#######.', '...#.....#.', '...#.....#.', '...#.....#.', '...#.....#.', '.###...###.', '####..####.', '.##....##..']
  };
  function iconSvg(name) {
    const rows = ICONS[name]; if (!rows) return '';
    const w = rows[0].length, h = rows.length; let r = '';
    rows.forEach((row, y) => { for (let x = 0; x < w; x++) if (row[x] === '#') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; });
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  }

  function buildChart(t) {
    const m = new Buf(64, 40);
    m.rect(0, 0, 64, 40, 'b'); m.rect(0, 34, 64, 6, 'H');
    [8, 13, 11, 20, 26].forEach((h, i) => m.rect(8 + i * 10, 34 - h, 7, h, i === 4 ? 'O' : i % 2 ? 'Y' : 'W'));
    m.line(11, 24, 52, 6, 'g');
    if (Math.floor(t / 3) % 2) m.rect(50, 3, 4, 4, 'W');
    return m;
  }

  function buildHouse(t) {
    const m = new Buf(64, 40);
    m.rect(0, 0, 64, 40, 'L'); m.rect(0, 31, 64, 9, 'G'); m.rect(0, 31, 64, 2, 'g');
    m.ell(55, 8, 4, 4, 'Y');
    m.rect(18, 17, 28, 15, 'W'); m.rect(18, 30, 28, 2, 'w');
    m.poly([[14, 18], [32, 6], [50, 18]], 'R');
    m.rect(29, 23, 7, 9, 'O'); m.rect(34, 27, 1, 1, 'Y');
    const lit = Math.floor(t / 4) % 3 !== 2;
    m.rect(21, 21, 6, 6, lit ? 'Y' : 'y'); m.rect(38, 21, 6, 6, lit ? 'Y' : 'y');
    return m;
  }

  function buildPhone(t) {
    const m = new Buf(64, 40);
    m.rect(0, 0, 64, 40, 'b');
    m.ell(10, 20, 5, 5, 'R'); m.ell(54, 20, 5, 5, 'L');
    m.rect(22, 2, 20, 37, 'K'); m.rect(23, 4, 18, 33, 'W');
    m.rect(23, 4, 18, 5, 'O'); m.rect(25, 11, 14, 6, 'w');
    const up = Math.floor(t / 3) % 2;
    [5, 9, 7, 12, 8].forEach((h, i) => {
      const hh = h + (up && i === 3 ? 1 : 0);
      m.rect(25 + i * 3, 33 - hh, 2, hh, i === 3 ? 'O' : 'Y');
    });
    return m;
  }

  window.PIXEL = {
    PAL, Buf, iconSvg,
    sprites: {
      hero:     { build: buildHero,     key: t => (t % 27) >= 25 ? 1 : 0 },
      bust:     { build: buildBust,     key: t => (t % 33) >= 31 ? 1 : 0 },
      eyes:     { build: buildEyes,     key: t => (t % 22) >= 20 ? 1 : 0 },
      mind:     { build: buildMind,     key: t => Math.floor(t / 2) },
      video:    { build: buildVideo,    key: t => Math.floor(t / 2) + '|' + Math.floor(t / 3) },
      mirror:   { build: buildMirror,   key: t => Math.floor(t / 4) + '|' + Math.floor(t / 3) + '|' + ((t % 22) >= 20 ? 1 : 0) },
      shelf:    { build: buildShelf,    key: t => Math.floor(t / 3) % 4 === 3 ? 1 : 0 },
      leaf:     { build: buildLeaf,     key: t => Math.floor(t / 3) % 2 },
      chart:    { build: buildChart,    key: t => Math.floor(t / 3) % 2 },
      phone:    { build: buildPhone,    key: t => Math.floor(t / 3) % 2 },
      house:    { build: buildHouse,    key: t => Math.floor(t / 4) % 3 === 2 ? 1 : 0 },
    }
  };
})();

