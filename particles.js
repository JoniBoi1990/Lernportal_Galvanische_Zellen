/* Galvanische Zellen – Teilchenebene (Canvas-Animationen)
 * CellView:        beide Elektrodenoberflächen, Kabel, Messgerät, Salzbrücke
 * DoubleLayerView: Bildung der elektrochemischen Doppelschicht an einer Halbzelle
 */
(function () {
  'use strict';
  const C = window.GZChem;
  const P = C.PAIRS;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SP = 24;      // Gitterabstand
  const R_ATOM = 10.5;
  const R_CAT = 10.5;

  const STYLE = {
    SO4: { color: '#e9c13f', stroke: '#9c7a12', label: 'SO₄', charge: '2−', r: 12 },
    NO3: { color: '#a07ad6', stroke: '#6a479c', label: 'NO₃', charge: '−', r: 10.5 },
    K: { color: '#f08c3e', stroke: '#ad5816', label: 'K', charge: '+', r: 9.5 },
    electron: '#1756c9',
  };

  function setupCanvas(canvas, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- Zeichenfunktionen für Teilchen ---------- */
  function drawAtom(ctx, x, y, el, labels) {
    const p = P[el];
    const g = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, R_ATOM);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, p.metalColor);
    g.addColorStop(1, p.metalDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R_ATOM, 0, Math.PI * 2);
    ctx.fill();
    if (labels) {
      ctx.fillStyle = el === 'Ag' || el === 'Zn' ? '#2b3138' : '#ffffff';
      ctx.font = '600 8.5px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el, x, y + 0.5);
    }
  }

  function drawCation(ctx, x, y, el, labels, highlight) {
    const p = P[el];
    // Hydrathülle (angedeutet)
    ctx.strokeStyle = highlight ? 'rgba(200, 30, 30, 0.75)' : 'rgba(40, 110, 170, 0.35)';
    ctx.setLineDash([2, 2.5]);
    ctx.lineWidth = highlight ? 1.6 : 1;
    ctx.beginPath();
    ctx.arc(x, y, R_CAT + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.ionColor;
    ctx.beginPath();
    ctx.arc(x, y, R_CAT, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    if (labels) {
      ctx.fillStyle = '#fff';
      ctx.font = '700 8.5px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el, x, y + 0.5);
      ctx.fillStyle = '#b3261e';
      ctx.font = '700 8px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText(p.z === 1 ? '+' : p.z + '+', x + R_CAT + 2, y - R_CAT + 1);
    }
  }

  function drawSimpleIon(ctx, x, y, style, labels) {
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(x, y, style.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (labels) {
      ctx.fillStyle = '#1d2733';
      ctx.font = '700 8px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(style.label, x, y + 0.5);
      ctx.fillStyle = style.charge.includes('−') ? '#1756c9' : '#b3261e';
      ctx.fillText(style.charge, x + style.r + 3, y - style.r + 1);
    }
  }

  function drawElectron(ctx, x, y, labels) {
    ctx.fillStyle = STYLE.electron;
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (labels) {
      ctx.fillStyle = '#fff';
      ctx.font = '700 7px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('−', x, y + 0.3);
    }
  }

  /* ---------- Metallgitter ---------- */
  class Lattice {
    constructor(dir, element, x0, y0, rows, maxCols, filled) {
      this.dir = dir; // +1: Oberfläche zeigt nach rechts, −1: nach links
      this.x0 = x0;
      this.y0 = y0;
      this.rows = rows;
      this.maxCols = maxCols;
      this.cells = [];
      for (let c = 0; c < maxCols; c++) {
        this.cells.push(new Array(rows).fill(c < filled ? element : null));
      }
    }
    pos(col, row) {
      return { x: this.x0 + this.dir * (col * SP + (row % 2) * 6), y: this.y0 + row * SP };
    }
    surfaceCol() {
      for (let c = this.maxCols - 1; c >= 0; c--) {
        if (this.cells[c].some((v) => v && v !== 'R')) return c;
      }
      return -1;
    }
    surfaceX() {
      const c = Math.max(0, this.surfaceCol());
      return this.x0 + this.dir * (c * SP + 3);
    }
    exposed(col, row) {
      // Ein Atom liegt frei, wenn rechts (bzw. links) daneben kein Atom sitzt
      return col === this.maxCols - 1 || !this.cells[col + 1][row];
    }
    removeSurfaceAtom(filter, nearY) {
      const sc = this.surfaceCol();
      if (sc < 0) return null;
      const cand = [];
      for (let c = sc; c >= Math.max(0, sc - 1); c--) {
        for (let r = 0; r < this.rows; r++) {
          const v = this.cells[c][r];
          if (v && v !== 'R' && this.exposed(c, r) && (!filter || filter(v))) cand.push({ c, r, v });
        }
        if (cand.length) break;
      }
      if (!cand.length) return null;
      let pick;
      if (nearY !== undefined) {
        cand.sort((a, b) => Math.abs(this.pos(a.c, a.r).y - nearY) - Math.abs(this.pos(b.c, b.r).y - nearY));
        pick = cand[Math.floor(Math.random() * Math.min(3, cand.length))];
      } else {
        pick = cand[Math.floor(Math.random() * cand.length)];
      }
      this.cells[pick.c][pick.r] = null;
      const p = this.pos(pick.c, pick.r);
      return { x: p.x, y: p.y, element: pick.v };
    }
    reserveVacancy(nearY) {
      const sc = Math.max(0, this.surfaceCol());
      for (const c of [sc, sc + 1]) {
        if (c >= this.maxCols) continue;
        const rows = [];
        for (let r = 0; r < this.rows; r++) {
          const supported = c === 0 || this.cells[c - 1][r];
          if (!this.cells[c][r] && supported) rows.push(r);
        }
        if (rows.length) {
          rows.sort((a, b) => Math.abs(this.pos(c, a).y - nearY) - Math.abs(this.pos(c, b).y - nearY));
          const r = rows[0];
          this.cells[c][r] = 'R';
          return { col: c, row: r };
        }
      }
      return null;
    }
    fill(cell, el) {
      this.cells[cell.col][cell.row] = el;
    }
    countCol(c) {
      return this.cells[c].filter((v) => v && v !== 'R').length;
    }
    draw(ctx, labels) {
      for (let c = 0; c < this.maxCols; c++) {
        for (let r = 0; r < this.rows; r++) {
          const v = this.cells[c][r];
          if (v && v !== 'R') {
            const p = this.pos(c, r);
            drawAtom(ctx, p.x, p.y, v, labels);
          }
        }
      }
    }
  }

  /* ---------- Bewegungshilfen ---------- */
  function moveToward(p, tx, ty, speed, dt) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    const s = speed * dt;
    if (d <= s || d < 0.5) {
      p.x = tx;
      p.y = ty;
      return true;
    }
    p.x += (dx / d) * s;
    p.y += (dy / d) * s;
    return false;
  }

  function brownian(p, dt, box, strength) {
    const k = strength || 55;
    p.vx = (p.vx || 0) * 0.94 + rnd(-1, 1) * k * dt;
    p.vy = (p.vy || 0) * 0.94 + rnd(-1, 1) * k * dt;
    const vmax = 26;
    const v = Math.hypot(p.vx, p.vy);
    if (v > vmax) { p.vx *= vmax / v; p.vy *= vmax / v; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < box.x0) { p.x = box.x0; p.vx = Math.abs(p.vx); }
    if (p.x > box.x1) { p.x = box.x1; p.vx = -Math.abs(p.vx); }
    if (p.y < box.y0) { p.y = box.y0; p.vy = Math.abs(p.vy); }
    if (p.y > box.y1) { p.y = box.y1; p.vy = -Math.abs(p.vy); }
  }

  /* =====================================================================
     CellView – Teilchenebene der galvanischen Zelle
     ===================================================================== */
  const W = 960;
  const H = 540;
  const WIN = {
    left: { x: 16, y: 136, w: 420, h: 388 },
    right: { x: 524, y: 136, w: 420, h: 388 },
  };
  const BRIDGE = { x0: 372, x1: 588, y0: 300, y1: 334 };
  const DEVICE = { x: 400, y: 14, w: 160, h: 78 };
  const WIRE_Y = 52;
  const ROWS = 16;
  const MAX_COLS = 8;
  const START_COLS = 4;

  class CellView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = setupCanvas(canvas, W, H);
      this.speed = 1;
      this.showDL = true;
      this.labels = true;
      this.running = !reduceMotion;
      this.visible = true;
      this.cfg = null;
      this.sig = '';
      this.fade = 1;
      this.fadeDir = 0;
      this.rotor = 0;
      this.notice = '';
      this.noticeT = 0;
      this.last = performance.now();
      this.particles = [];
      this.lattices = {};
      this.queue = [];
      this.timers = { flow: 0, local: { left: 0, right: 0 }, exchange: { left: 0, right: 0 } };
      this.events = 0;
      this.onFrame = this.onFrame.bind(this);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
          this.visible = entries.some((e) => e.isIntersecting);
        }, { rootMargin: '200px' }).observe(canvas);
      }
      requestAnimationFrame(this.onFrame);
    }

    setRunning(on) { this.running = on; this.last = performance.now(); if (!on) this.draw(); }

    configure(cfg) {
      this.cfg = cfg;
      const s = JSON.stringify([cfg.left, cfg.right, cfg.bridge, cfg.device, cfg.cables, cfg.analysis.valid]);
      if (s !== this.sig) {
        this.sig = s;
        this.rebuild();
      }
      if (!this.running) this.draw();
    }

    /* ----- Szenenaufbau ----- */
    rebuild() {
      const cfg = this.cfg;
      this.particles = [];
      this.queue = [];
      this.events = 0;
      this.lattices = {};
      this.timers.flow = 0;
      for (const side of ['left', 'right']) {
        const hc = cfg[side];
        const win = WIN[side];
        if (hc.metal) {
          const dir = side === 'left' ? 1 : -1;
          const x0 = side === 'left' ? win.x + 16 : win.x + win.w - 16;
          this.lattices[side] = new Lattice(dir, hc.metal, x0, win.y + 16, ROWS, MAX_COLS, START_COLS);
        }
        if (hc.electrolyte) {
          const pair = P[hc.electrolyte];
          for (let i = 0; i < 12; i++) {
            const pt = this.randomSolutionPoint(side);
            this.particles.push({ kind: 'cation', el: pair.id, side, x: pt.x, y: pt.y, state: 'free' });
            const pa = this.randomSolutionPoint(side);
            this.particles.push({ kind: 'anion', el: pair.anionId, side, x: pa.x, y: pa.y, state: 'free' });
          }
        }
        // Doppelschicht (nur bei konjugiertem Redoxpaar)
        if (C.isConjugate(hc)) {
          const qEq = C.doubleLayerCharge(hc.metal, hc.c);
          const z = P[hc.metal].z;
          const nIons = Math.max(1, Math.round(qEq / z));
          for (let i = 0; i < nIons; i++) {
            const slot = this.dlSlot(side, i, nIons);
            this.particles.push({ kind: 'cation', el: hc.metal, side, x: slot.x, y: slot.y, state: 'dl', slot: i, nSlots: nIons, dl: true });
          }
          for (let i = 0; i < qEq; i++) {
            this.particles.push({ kind: 'electron', side, state: 'dlE', slot: i, nSlots: qEq, x: 0, y: 0, dl: true });
          }
        }
      }
      if (cfg.bridge === 'kno3') {
        for (let i = 0; i < 9; i++) {
          this.particles.push(this.bridgeIon('K', rnd(BRIDGE.x0 + 10, BRIDGE.x1 - 10)));
          this.particles.push(this.bridgeIon('NO3', rnd(BRIDGE.x0 + 10, BRIDGE.x1 - 10)));
        }
      }
      this.placeDlElectrons();
    }

    bridgeIon(type, x) {
      return { kind: type === 'K' ? 'K' : 'NO3b', el: type, side: 'bridge', x, y: rnd(BRIDGE.y0 + 8, BRIDGE.y1 - 8), state: 'free', alpha: 1 };
    }

    solutionBox(side) {
      const win = WIN[side];
      const lat = this.lattices[side];
      if (side === 'left') {
        const xs = lat ? lat.surfaceX() + 46 : win.x + 20;
        return { x0: Math.min(xs, win.x + win.w - 60), x1: win.x + win.w - 16, y0: win.y + 14, y1: win.y + win.h - 14 };
      }
      const xs = lat ? lat.surfaceX() - 46 : win.x + win.w - 20;
      return { x0: win.x + 16, x1: Math.max(xs, win.x + 60), y0: win.y + 14, y1: win.y + win.h - 14 };
    }

    randomSolutionPoint(side, nearY) {
      const b = this.solutionBox(side);
      const y = nearY === undefined ? rnd(b.y0, b.y1) : clamp(nearY + rnd(-40, 40), b.y0, b.y1);
      return { x: rnd(b.x0, b.x1), y };
    }

    dlSlot(side, i, n) {
      const win = WIN[side];
      const lat = this.lattices[side];
      const sx = lat ? lat.surfaceX() : (side === 'left' ? win.x + 100 : win.x + win.w - 100);
      const dir = side === 'left' ? 1 : -1;
      const y = win.y + 26 + ((i + 0.5) * (win.h - 52)) / n;
      return { x: sx + dir * 34, y };
    }

    placeDlElectrons() {
      for (const p of this.particles) {
        if (p.state === 'dlE') {
          const win = WIN[p.side];
          const lat = this.lattices[p.side];
          if (!lat) continue;
          const dir = p.side === 'left' ? 1 : -1;
          p.x = lat.surfaceX() + dir * 6;
          p.y = win.y + 20 + ((p.slot + 0.5) * (win.h - 40)) / p.nSlots;
        }
      }
    }

    /* ----- Wege der Elektronen ----- */
    electrodeTop(side) {
      const lat = this.lattices[side];
      const x = side === 'left' ? WIN.left.x + 16 + 1.5 * SP : WIN.right.x + WIN.right.w - 16 - 1.5 * SP;
      return { x: lat ? x : x, y: WIN[side].y - 18 };
    }
    wirePath(from, to) {
      const a = this.electrodeTop(from);
      const b = this.electrodeTop(to);
      const ja = from === 'left' ? DEVICE.x : DEVICE.x + DEVICE.w;
      const jb = to === 'left' ? DEVICE.x : DEVICE.x + DEVICE.w;
      return [
        { x: a.x, y: WIN[from].y + 8 },
        { x: a.x, y: WIRE_Y },
        { x: ja, y: WIRE_Y },
        { x: jb, y: WIRE_Y },
        { x: b.x, y: WIRE_Y },
        { x: b.x, y: WIN[to].y + 8 },
      ];
    }

    flash(msg) { this.notice = msg; this.noticeT = 3.2; }

    /* ----- Prozesse ----- */
    anodeEvent() {
      const an = this.cfg.analysis;
      const aSide = an.anodeSide;
      const kSide = an.cathodeSide;
      const aMetal = this.cfg[aSide].metal;
      const aLat = this.lattices[aSide];
      const z = P[aMetal].z;
      const atom = aLat.removeSurfaceAtom((v) => v === aMetal);
      if (!atom || aLat.surfaceCol() < 1) { this.restartCycle(); return; }
      const target = this.randomSolutionPoint(aSide, atom.y);
      this.particles.push({ kind: 'cation', el: aMetal, side: aSide, x: atom.x, y: atom.y, state: 'move', tx: target.x, ty: target.y, spd: 34, then: 'free', fresh: 2.5 });
      const path = this.wirePath(aSide, kSide);
      for (let i = 0; i < z; i++) {
        const start = { x: atom.x + rnd(-4, 4), y: atom.y + rnd(-4, 4) };
        const top = this.electrodeTop(aSide);
        const kLat = this.lattices[kSide];
        const end = { x: kLat.surfaceX() + (kSide === 'left' ? 8 : -8), y: rnd(WIN[kSide].y + 30, WIN[kSide].y + WIN[kSide].h - 30) };
        const pts = [start, { x: top.x, y: WIN[aSide].y + 8 }, ...path.slice(1, 5), { x: this.electrodeTop(kSide).x, y: WIN[kSide].y + 8 }, end];
        this.particles.push({ kind: 'electron', side: 'wire', x: start.x, y: start.y, state: 'path', pts, idx: 1, delay: i * 0.25 });
      }
      for (let i = 0; i < z; i++) {
        this.emitBridge('NO3', aSide);
        this.emitBridge('K', kSide);
      }
      this.events++;
    }

    emitBridge(type, side) {
      const kind = type === 'K' ? 'K' : 'NO3b';
      const endX = side === 'left' ? BRIDGE.x0 + 6 : BRIDGE.x1 - 6;
      const cands = this.particles.filter((p) => p.kind === kind && p.side === 'bridge' && p.state === 'free');
      if (!cands.length) return;
      cands.sort((a, b) => Math.abs(a.x - endX) - Math.abs(b.x - endX));
      const ion = cands[0];
      const tgt = this.randomSolutionPoint(side, (BRIDGE.y0 + BRIDGE.y1) / 2);
      ion.state = 'move';
      ion.waypoint = { x: endX, y: (BRIDGE.y0 + BRIDGE.y1) / 2 };
      ion.tx = tgt.x;
      ion.ty = tgt.y;
      ion.spd = 40;
      ion.then = 'free';
      ion.newSide = side;
      ion.fresh = 2.5;
      // Nachschub aus dem Vorrat der Salzbrücke
      const fromX = side === 'left' ? BRIDGE.x1 - 8 : BRIDGE.x0 + 8;
      const repl = this.bridgeIon(type, fromX);
      repl.alpha = 0;
      this.particles.push(repl);
    }

    tryDeposit() {
      const an = this.cfg.analysis;
      const kSide = an.cathodeSide;
      if (!kSide) return;
      const kMetal = this.cfg[kSide].metal;
      const z = P[kMetal].z;
      const waiting = this.particles.filter((p) => p.kind === 'electron' && p.state === 'wait');
      if (waiting.length < z) return;
      const lat = this.lattices[kSide];
      const cands = this.particles.filter((p) => p.kind === 'cation' && p.side === kSide && p.state === 'free' && p.el === kMetal);
      if (!cands.length) { this.restartCycle(); return; }
      const sx = lat.surfaceX();
      cands.sort((a, b) => Math.abs(a.x - sx) - Math.abs(b.x - sx));
      const ion = cands[0];
      const cell = lat.reserveVacancy(ion.y);
      if (!cell) { this.restartCycle(); return; }
      const pos = lat.pos(cell.col, cell.row);
      ion.state = 'move';
      ion.tx = pos.x;
      ion.ty = pos.y;
      ion.spd = 45;
      ion.then = 'deposit';
      ion.cell = cell;
      ion.lat = lat;
      ion.highlight = true;
      const used = waiting.slice(0, z);
      for (const e of used) {
        e.state = 'move';
        e.tx = pos.x;
        e.ty = pos.y;
        e.spd = 60;
        e.then = 'remove';
      }
    }

    localEvent(side) {
      // direkte Redoxreaktion bei Fehlkombination (z. B. Zn-Blech in CuSO₄)
      const hc = this.cfg[side];
      const lat = this.lattices[side];
      if (!lat) return;
      const m = P[hc.metal];
      const e = P[hc.electrolyte];
      const n = C.lcm(m.z, e.z);
      const fa = n / m.z;
      const fk = n / e.z;
      const ions = this.particles.filter((p) => p.kind === 'cation' && p.side === side && p.state === 'free' && p.el === e.id);
      if (ions.length < fk) return;
      const atoms = [];
      for (let i = 0; i < fa; i++) {
        const a = lat.removeSurfaceAtom((v) => v === m.id);
        if (a) atoms.push(a);
      }
      if (!atoms.length) return;
      for (const a of atoms) {
        const t = this.randomSolutionPoint(side, a.y);
        this.particles.push({ kind: 'cation', el: m.id, side, x: a.x, y: a.y, state: 'move', tx: t.x, ty: t.y, spd: 30, then: 'free', fresh: 2.5 });
      }
      const sx = lat.surfaceX();
      ions.sort((a, b) => Math.abs(a.x - sx) - Math.abs(b.x - sx));
      for (let i = 0; i < fk; i++) {
        const ion = ions[i];
        const cell = lat.reserveVacancy(atoms[0].y);
        if (!cell) break;
        const pos = lat.pos(cell.col, cell.row);
        Object.assign(ion, { state: 'move', tx: pos.x, ty: pos.y, spd: 40, then: 'deposit', cell, lat, highlight: true });
        for (let k = 0; k < e.z; k++) {
          this.particles.push({ kind: 'electron', side, x: atoms[0].x, y: atoms[0].y, state: 'move', tx: pos.x, ty: pos.y, spd: 25, then: 'remove' });
        }
      }
      this.events++;
      if (this.events > 14) this.restartCycle();
    }

    exchangeEvent(side) {
      // Dynamisches Gleichgewicht: ein Ion der Doppelschicht wird abgeschieden, ein Atom geht in Lösung
      const lat = this.lattices[side];
      const dls = this.particles.filter((p) => p.side === side && p.state === 'dl');
      if (!lat || !dls.length) return;
      const ion = dls[Math.floor(Math.random() * dls.length)];
      const atom = lat.removeSurfaceAtom((v) => v === ion.el, ion.y);
      if (!atom) return;
      const cell = lat.reserveVacancy(ion.y);
      if (!cell) { lat.fill(lat.reserveVacancy(atom.y) || { col: 0, row: 0 }, atom.element); return; }
      const pos = lat.pos(cell.col, cell.row);
      const slot = ion.slot;
      Object.assign(ion, { state: 'move', tx: pos.x, ty: pos.y, spd: 18, then: 'deposit', cell, lat, highlight: true, dl: false });
      this.particles.push({ kind: 'cation', el: atom.element, side, x: atom.x, y: atom.y, state: 'toSlot', slot, nSlots: ion.nSlots, dl: true, highlight: true, fresh: 2 });
    }

    restartCycle() {
      if (this.fadeDir !== 0) return;
      this.fadeDir = -1;
    }

    /* ----- Zeitschritt ----- */
    step(dt) {
      const cfg = this.cfg;
      if (!cfg) return;
      const an = cfg.analysis;
      const flowing = an.valid && cfg.device === 'motor' && an.deltaE > 0.001;
      this.flowing = flowing;

      if (this.fadeDir !== 0) {
        this.fade += this.fadeDir * dt * 2.2;
        if (this.fade <= 0) { this.fade = 0; this.fadeDir = 1; this.rebuild(); this.flash('Modellausschnitt wird erneuert – die Reaktion läuft weiter.'); }
        if (this.fade >= 1) { this.fade = 1; this.fadeDir = 0; }
      }

      if (flowing && this.fadeDir === 0) {
        const rate = (0.35 + (0.9 * an.deltaE) / 1.6);
        this.timers.flow += dt * rate;
        if (this.timers.flow >= 1) { this.timers.flow = 0; this.anodeEvent(); }
        this.tryDeposit();
        if (this.events >= 12) this.restartCycle();
        this.rotor += dt * an.current * 2500;
      }

      for (const side of ['left', 'right']) {
        const mm = an.mismatch[side];
        if (mm && mm.type === 'direct' && this.fadeDir === 0) {
          this.timers.local[side] += dt * 0.55;
          if (this.timers.local[side] >= 1) { this.timers.local[side] = 0; this.localEvent(side); }
        }
        if (C.isConjugate(cfg[side]) && this.showDL && !flowing) {
          this.timers.exchange[side] += dt * 0.28;
          if (this.timers.exchange[side] >= 1) { this.timers.exchange[side] = 0; this.exchangeEvent(side); }
        }
      }

      const bridgeBias = flowing ? 9 : 0;
      for (const p of this.particles) {
        if (p.fresh) p.fresh = Math.max(0, p.fresh - dt);
        if (p.alpha !== undefined && p.alpha < 1) p.alpha = Math.min(1, p.alpha + dt * 1.5);
        switch (p.state) {
          case 'free': {
            if (p.side === 'bridge') {
              brownian(p, dt, { x0: BRIDGE.x0 + 8, x1: BRIDGE.x1 - 8, y0: BRIDGE.y0 + 7, y1: BRIDGE.y1 - 7 }, 40);
              if (bridgeBias) {
                const toward = p.kind === 'K' ? an.cathodeSide : an.anodeSide;
                p.x += (toward === 'left' ? -1 : 1) * bridgeBias * dt * 0.5;
              }
            } else if (p.side === 'left' || p.side === 'right') {
              brownian(p, dt, this.solutionBox(p.side));
            }
            break;
          }
          case 'move': {
            if (p.delay > 0) { p.delay -= dt; break; }
            if (p.waypoint) {
              if (moveToward(p, p.waypoint.x, p.waypoint.y, p.spd, dt)) p.waypoint = null;
              break;
            }
            if (moveToward(p, p.tx, p.ty, p.spd, dt)) {
              if (p.then === 'deposit') { p.lat.fill(p.cell, p.el); p.dead = true; }
              else if (p.then === 'remove') { p.dead = true; }
              else { p.state = 'free'; if (p.newSide) { p.side = p.newSide; p.newSide = null; } p.highlight = false; }
            }
            break;
          }
          case 'path': {
            if (p.delay > 0) { p.delay -= dt; break; }
            const t = p.pts[p.idx];
            if (moveToward(p, t.x, t.y, 150, dt)) {
              p.idx++;
              if (p.idx >= p.pts.length) { p.state = 'wait'; p.side = an.cathodeSide; p.wy = p.y; }
            }
            break;
          }
          case 'wait': {
            const lat = this.lattices[p.side];
            if (lat) p.x = lat.surfaceX() + (p.side === 'left' ? 8 : -8);
            break;
          }
          case 'dl': {
            const s = this.dlSlot(p.side, p.slot, p.nSlots);
            p.x += (s.x + Math.sin(performance.now() / 700 + p.slot) * 2.5 - p.x) * Math.min(1, dt * 3);
            p.y += (s.y + Math.cos(performance.now() / 900 + p.slot) * 3 - p.y) * Math.min(1, dt * 3);
            break;
          }
          case 'toSlot': {
            const s = this.dlSlot(p.side, p.slot, p.nSlots);
            if (moveToward(p, s.x, s.y, 18, dt)) { p.state = 'dl'; p.highlight = false; }
            break;
          }
          default:
            break;
        }
      }
      this.particles = this.particles.filter((p) => !p.dead);
      this.placeDlElectrons();
      if (this.noticeT > 0) this.noticeT -= dt;
    }

    /* ----- Zeichnen ----- */
    draw() {
      const ctx = this.ctx;
      const cfg = this.cfg;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fbfcfd';
      ctx.fillRect(0, 0, W, H);
      if (!cfg) return;
      const an = cfg.analysis;
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.75 * this.fade;

      for (const side of ['left', 'right']) this.drawWindow(ctx, side);
      this.drawWires(ctx);
      this.drawDevice(ctx);
      this.drawBridge(ctx);

      // Teilchen
      const labels = this.labels;
      for (const p of this.particles) {
        if (p.dl && !this.showDL) continue;
        const a = p.alpha === undefined ? 1 : p.alpha;
        ctx.globalAlpha = (0.25 + 0.75 * this.fade) * a;
        if (p.kind === 'cation') drawCation(ctx, p.x, p.y, p.el, labels, p.highlight || p.fresh > 0);
        else if (p.kind === 'anion') drawSimpleIon(ctx, p.x, p.y, STYLE[p.el], labels);
        else if (p.kind === 'K') drawSimpleIon(ctx, p.x, p.y, STYLE.K, labels);
        else if (p.kind === 'NO3b') drawSimpleIon(ctx, p.x, p.y, STYLE.NO3, labels);
      }
      ctx.globalAlpha = 0.25 + 0.75 * this.fade;
      for (const p of this.particles) {
        if (p.kind !== 'electron') continue;
        if (p.dl && !this.showDL) continue;
        if (p.state === 'path' && p.delay > 0) continue;
        drawElectron(ctx, p.x, p.y, labels);
      }
      ctx.restore();

      // Rollen-Beschriftung
      if (an.conjugate && an.anodeSide) {
        const flowing = this.flowing;
        for (const side of ['left', 'right']) {
          const isAnode = side === an.anodeSide;
          const win = WIN[side];
          const txt = isAnode ? (flowing ? 'Anode (−): Oxidation' : 'Minuspol (−)') : (flowing ? 'Kathode (+): Reduktion' : 'Pluspol (+)');
          ctx.font = '700 13px "Helvetica Neue", Arial, sans-serif';
          const tw = ctx.measureText(txt).width + 16;
          const x = win.x + win.w / 2 - tw / 2;
          const y = win.y + win.h - 30;
          ctx.fillStyle = isAnode ? 'rgba(23, 86, 201, 0.92)' : 'rgba(179, 38, 30, 0.92)';
          roundRect(ctx, x, y, tw, 22, 11);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(txt, win.x + win.w / 2, y + 11.5);
        }
      }

      if (this.noticeT > 0) {
        ctx.font = '600 12px "Helvetica Neue", Arial, sans-serif';
        const tw = ctx.measureText(this.notice).width + 20;
        ctx.fillStyle = 'rgba(29, 39, 51, 0.85)';
        roundRect(ctx, W / 2 - tw / 2, H - 30, tw, 22, 6);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.notice, W / 2, H - 19);
      }
      if (!this.running) {
        ctx.fillStyle = 'rgba(29, 39, 51, 0.7)';
        roundRect(ctx, W - 92, 8, 82, 22, 6);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 11px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⏸ pausiert', W - 51, 19.5);
      }
    }

    drawWindow(ctx, side) {
      const cfg = this.cfg;
      const hc = cfg[side];
      const win = WIN[side];
      ctx.save();
      roundRect(ctx, win.x, win.y, win.w, win.h, 14);
      ctx.fillStyle = hc.electrolyte ? P[hc.electrolyte].solution : '#f3f5f7';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#9fb3c5';
      ctx.stroke();
      ctx.clip();

      const lat = this.lattices[side];
      const an = cfg.analysis;
      // Doppelschicht-Band
      if (lat && this.showDL && C.isConjugate(hc)) {
        const sx = lat.surfaceX();
        const dir = side === 'left' ? 1 : -1;
        const x0 = side === 'left' ? sx + 6 : sx - 52;
        const g = ctx.createLinearGradient(sx, 0, sx + dir * 52, 0);
        g.addColorStop(0, 'rgba(23, 86, 201, 0.16)');
        g.addColorStop(1, 'rgba(179, 38, 30, 0.10)');
        ctx.fillStyle = g;
        ctx.fillRect(x0, win.y, 46, win.h);
        ctx.save();
        ctx.translate(sx + dir * 58, win.y + 70);
        ctx.rotate(side === 'left' ? Math.PI / 2 : -Math.PI / 2);
        ctx.fillStyle = 'rgba(80, 40, 120, 0.75)';
        ctx.font = '700 11px "Helvetica Neue", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Doppelschicht', 0, 0);
        ctx.restore();
      }
      if (lat) lat.draw(ctx, this.labels);
      ctx.restore();

      // Elektrode ragt aus dem Ausschnitt heraus
      if (hc.metal) {
        const top = this.electrodeTop(side);
        const p = P[hc.metal];
        ctx.fillStyle = p.metalColor;
        ctx.strokeStyle = p.metalDark;
        ctx.lineWidth = 1.5;
        ctx.fillRect(top.x - 30, win.y - 20, 60, 22);
        ctx.strokeRect(top.x - 30, win.y - 20, 60, 22);
        ctx.fillStyle = '#1d2733';
        ctx.font = '700 11px "Helvetica Neue", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.name, top.x, win.y - 9);
      }

      // Titel
      ctx.fillStyle = '#004d73';
      ctx.font = '700 13px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = side === 'left' ? 'right' : 'left';
      ctx.textBaseline = 'alphabetic';
      const tx = side === 'left' ? win.x + win.w - 6 : win.x + 6;
      let title = 'Halbzelle noch nicht vorbereitet';
      if (hc.metal && hc.electrolyte) title = P[hc.metal].id + ' | ' + P[hc.electrolyte].salt + ' (' + C.fmtC(hc.c) + ' mol/L)';
      else if (hc.metal) title = P[hc.metal].name + 'blech – Elektrolyt fehlt';
      else if (hc.electrolyte) title = P[hc.electrolyte].salt + '-Lösung – Metallblech fehlt';
      ctx.fillText(title, tx, win.y - 26 + (hc.metal ? 0 : 0));

      if (!hc.metal && !hc.electrolyte) {
        ctx.fillStyle = '#7a8896';
        ctx.font = '600 14px "Helvetica Neue", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Wähle Metallblech und Elektrolyt', win.x + win.w / 2, win.y + win.h / 2);
      }
      const mm = an.mismatch[side];
      if (mm) {
        ctx.font = '700 12px "Helvetica Neue", Arial, sans-serif';
        const txt = mm.type === 'direct' ? '⚠ Kein konjugiertes Redoxpaar – direkte Redoxreaktion!' : '⚠ Kein konjugiertes Redoxpaar';
        const tw = ctx.measureText(txt).width + 16;
        ctx.fillStyle = 'rgba(217, 107, 67, 0.95)';
        roundRect(ctx, win.x + win.w / 2 - tw / 2, win.y + 8, tw, 22, 6);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, win.x + win.w / 2, win.y + 19.5);
      }
    }

    drawWires(ctx) {
      const cfg = this.cfg;
      if (!cfg.cables || !this.lattices.left || !this.lattices.right) {
        if (!cfg.cables) {
          ctx.fillStyle = '#7a8896';
          ctx.font = '600 12px "Helvetica Neue", Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Kabel nicht angeschlossen', W / 2, DEVICE.y + DEVICE.h + 16);
        }
        return;
      }
      for (const side of ['left', 'right']) {
        const top = this.electrodeTop(side);
        const red = cfg.device === 'voltmeter' ? cfg.redSide === side : (cfg.analysis.cathodeSide ? cfg.analysis.cathodeSide === side : cfg.redSide === side);
        const jx = side === 'left' ? DEVICE.x : DEVICE.x + DEVICE.w;
        ctx.strokeStyle = red ? '#c62828' : '#222';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(top.x, WIN[side].y - 20);
        ctx.lineTo(top.x, WIRE_Y);
        ctx.lineTo(jx, WIRE_Y);
        ctx.stroke();
      }
    }

    drawDevice(ctx) {
      const cfg = this.cfg;
      const an = cfg.analysis;
      const d = DEVICE;
      ctx.fillStyle = '#f2c230';
      ctx.strokeStyle = '#8a6d0b';
      ctx.lineWidth = 2;
      roundRect(ctx, d.x, d.y, d.w, d.h, 10);
      ctx.fill();
      ctx.stroke();
      // Display
      ctx.fillStyle = '#c9d8b6';
      roundRect(ctx, d.x + 12, d.y + 10, d.w - 24, 34, 5);
      ctx.fill();
      ctx.fillStyle = '#1f2a1a';
      ctx.font = '700 20px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let txt = '- - -';
      if (cfg.cables) {
        if (cfg.device === 'motor') {
          txt = an.valid ? C.fmtNum(an.current * 1000, 2) + ' mA' : '0,00 mA';
        } else {
          txt = cfg.displayText || '0,000 V';
        }
      }
      ctx.fillText(txt, d.x + d.w / 2, d.y + 28);
      ctx.font = '700 10px Arial, sans-serif';
      ctx.fillStyle = '#3d3305';
      if (cfg.device === 'motor') {
        ctx.fillText('Amperemeter + Motor', d.x + d.w / 2, d.y + 56);
        // Rotor
        const cx = d.x + d.w / 2;
        const cy = d.y + d.h + 22;
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#e6e9ec';
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#333';
        ctx.font = '700 11px Arial';
        ctx.fillText('M', cx, cy);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.rotor);
        ctx.strokeStyle = '#d96b43';
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.moveTo(17, 0);
          ctx.lineTo(27, 0);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.fillText('Voltmeter', d.x + d.w / 2, d.y + 56);
      }
      // Buchsen
      for (const side of ['left', 'right']) {
        const isRed = cfg.device === 'voltmeter' ? cfg.redSide === side : (an.cathodeSide ? an.cathodeSide === side : cfg.redSide === side);
        const x = side === 'left' ? d.x + 22 : d.x + d.w - 22;
        ctx.fillStyle = isRed ? '#c62828' : '#222';
        ctx.beginPath();
        ctx.arc(x, d.y + d.h - 12, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3d3305';
        ctx.font = '700 9px Arial';
        ctx.fillText(isRed ? (cfg.device === 'voltmeter' ? 'V' : 'mA') : 'COM', x + (side === 'left' ? 24 : -24), d.y + d.h - 11);
      }
      if (cfg.device === 'voltmeter' && an.valid) {
        ctx.fillStyle = '#516170';
        ctx.font = 'italic 11px "Helvetica Neue", Arial, sans-serif';
        ctx.fillText('hochohmig: I ≈ 0 – gemessen wird der Potenzialunterschied', W / 2, d.y + d.h + 16);
      }
    }

    drawBridge(ctx) {
      const cfg = this.cfg;
      if (cfg.bridge === 'none') return;
      const b = BRIDGE;
      ctx.fillStyle = cfg.bridge === 'kno3' ? 'rgba(236, 228, 205, 0.95)' : 'rgba(250, 248, 240, 0.98)';
      ctx.strokeStyle = cfg.bridge === 'kno3' ? '#a89462' : '#c9c1a8';
      ctx.lineWidth = 1.5;
      roundRect(ctx, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#6c5b2e';
      ctx.font = '700 11px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(cfg.bridge === 'kno3' ? 'Salzbrücke (KNO₃-getränkt)' : 'trockenes Filterpapier – keine Ionen!', (b.x0 + b.x1) / 2, b.y0 - 6);
    }

    onFrame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.running && this.visible && !document.hidden) {
        this.step(dt * this.speed);
        this.draw();
      }
      requestAnimationFrame(this.onFrame);
    }
  }

  /* =====================================================================
     DoubleLayerView – Bildung der Doppelschicht an einer Halbzelle
     ===================================================================== */
  const DW = 560;
  const DH = 380;
  const CW = 560;
  const CH = 170;
  const T_MAX = 30;

  class DoubleLayerView {
    constructor(canvas, chart, hooks) {
      this.canvas = canvas;
      this.chart = chart;
      this.ctx = setupCanvas(canvas, DW, DH);
      this.cctx = setupCanvas(chart, CW, CH);
      this.hooks = hooks || {};
      this.metal = 'Zn';
      this.runs = {};
      this.running = false;
      this.started = false;
      this.last = performance.now();
      this.onFrame = this.onFrame.bind(this);
      this.reset('Zn');
      requestAnimationFrame(this.onFrame);
    }

    reset(metal) {
      this.metal = metal;
      this.started = false;
      this.running = false;
      this.t = 0;
      this.q = 0;
      this.hist = [];
      this.eqTime = 0;
      this.eqReached = false;
      this.particles = [];
      this.lat = new Lattice(1, metal, 26, 30, 14, 9, 5);
      this.lat.cells.forEach((col) => col.fill(null));
      const pair = P[metal];
      for (let i = 0; i < 9; i++) {
        this.particles.push({ kind: 'cation', el: metal, x: rnd(250, DW - 20), y: rnd(20, DH - 20), state: 'free' });
        this.particles.push({ kind: 'anion', el: pair.anionId, x: rnd(250, DW - 20), y: rnd(20, DH - 20), state: 'free' });
      }
      this.immersed = false;
      this.draw();
      this.drawChart();
    }

    start() {
      if (!this.started) {
        this.started = true;
        this.immersed = true;
        for (let c = 0; c < 5; c++) this.lat.cells[c].fill(this.metal);
      }
      this.running = true;
      this.last = performance.now();
    }
    pause() { this.running = false; }

    rates() { return C.doubleLayerRates(this.metal, this.q); }

    dlIons() { return this.particles.filter((p) => p.state === 'dl' || p.state === 'toDl'); }

    slotFor(y) {
      return { x: this.lat.surfaceX() + 34 + rnd(-4, 6), y: clamp(y + rnd(-14, 14), 24, DH - 24) };
    }

    dissolve() {
      const z = P[this.metal].z;
      const atom = this.lat.removeSurfaceAtom(null);
      if (!atom) return;
      const s = this.slotFor(atom.y);
      this.particles.push({ kind: 'cation', el: this.metal, x: atom.x, y: atom.y, state: 'toDl', sx: s.x, sy: s.y, highlight: 2 });
      for (let i = 0; i < z; i++) {
        this.particles.push({ kind: 'electron', x: atom.x, y: atom.y + rnd(-6, 6), state: 'surfE', oy: atom.y + rnd(-10, 10) });
      }
      this.q += z;
    }

    deposit() {
      const z = P[this.metal].z;
      const ions = this.particles.filter((p) => p.state === 'dl');
      if (!ions.length) return;
      const ion = ions[Math.floor(Math.random() * ions.length)];
      const cell = this.lat.reserveVacancy(ion.y);
      if (!cell) return;
      const pos = this.lat.pos(cell.col, cell.row);
      Object.assign(ion, { state: 'deposit', tx: pos.x, ty: pos.y, cell, highlight: 2 });
      const es = this.particles.filter((p) => p.state === 'surfE');
      es.sort((a, b) => Math.abs(a.y - pos.y) - Math.abs(b.y - pos.y));
      for (const e of es.slice(0, z)) Object.assign(e, { state: 'toAtom', tx: pos.x, ty: pos.y });
      this.q -= z;
    }

    step(dt) {
      this.t += dt;
      const r = this.rates();
      if (Math.random() < r.rDissolve * dt) this.dissolve();
      if (Math.random() < r.rDeposit * dt) this.deposit();
      if (this.t <= T_MAX) {
        if (!this.hist.length || this.t - this.hist[this.hist.length - 1].t > 0.1) {
          this.hist.push({ t: this.t, q: this.q });
        }
      }
      // Gleichgewicht erkannt?
      if (!this.eqReached) {
        const near = Math.abs(this.q - r.qEq) <= P[this.metal].z;
        this.eqTime = near ? this.eqTime + dt : 0;
        if (this.eqTime > 2.5) {
          this.eqReached = true;
          this.runs[this.metal] = { hist: this.hist.slice(), qEq: r.qEq };
          if (this.hooks.onEquilibrium) this.hooks.onEquilibrium(this.metal, r.qEq);
        }
      } else if (this.runs[this.metal] && this.t <= T_MAX) {
        this.runs[this.metal].hist = this.hist.slice();
      }
      const sx = this.lat.surfaceX();
      for (const p of this.particles) {
        if (p.highlight) p.highlight = Math.max(0, p.highlight - dt);
        switch (p.state) {
          case 'free':
            brownian(p, dt, { x0: sx + 80, x1: DW - 16, y0: 16, y1: DH - 16 });
            break;
          case 'toDl':
            if (moveToward(p, p.sx, p.sy, 34, dt)) p.state = 'dl';
            break;
          case 'dl':
            p.x += (sx + 34 + Math.sin(this.t * 1.3 + p.sy) * 3 - p.x) * Math.min(1, dt * 2);
            p.y += Math.sin(this.t * 0.9 + p.sx) * 0.15;
            break;
          case 'deposit':
            if (moveToward(p, p.tx, p.ty, 30, dt)) { this.lat.fill(p.cell, p.el); p.dead = true; }
            break;
          case 'surfE':
            p.x += (sx + 6 - p.x) * Math.min(1, dt * 4);
            p.y += (p.oy - p.y) * Math.min(1, dt * 4);
            break;
          case 'toAtom':
            if (moveToward(p, p.tx, p.ty, 40, dt)) p.dead = true;
            break;
          default:
            break;
        }
      }
      this.particles = this.particles.filter((p) => !p.dead);
      if (this.hooks.onUpdate) this.hooks.onUpdate(this.status());
    }

    status() {
      const r = this.rates();
      return {
        q: this.q,
        ions: this.particles.filter((p) => p.state === 'dl' || p.state === 'toDl').length,
        rDissolve: this.started ? r.rDissolve : 0,
        rDeposit: this.started ? r.rDeposit : 0,
        eq: this.eqReached,
        started: this.started,
        t: this.t,
      };
    }

    draw() {
      const ctx = this.ctx;
      const pair = P[this.metal];
      ctx.clearRect(0, 0, DW, DH);
      roundRect(ctx, 2, 2, DW - 4, DH - 4, 12);
      ctx.fillStyle = pair.solution;
      ctx.fill();
      ctx.strokeStyle = '#9fb3c5';
      ctx.lineWidth = 2;
      ctx.stroke();
      const sx = this.lat.surfaceX();
      if (this.immersed) {
        const ions = this.dlIons().length;
        if (ions > 0) {
          const g = ctx.createLinearGradient(sx, 0, sx + 56, 0);
          g.addColorStop(0, 'rgba(23, 86, 201, 0.16)');
          g.addColorStop(1, 'rgba(179, 38, 30, 0.10)');
          ctx.fillStyle = g;
          ctx.fillRect(sx + 6, 4, 50, DH - 8);
          ctx.fillStyle = 'rgba(80, 40, 120, 0.8)';
          ctx.font = '700 11px "Helvetica Neue", Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('elektrochemische Doppelschicht', sx + 31 + 90, 18);
        }
      }
      this.lat.draw(ctx, true);
      if (!this.immersed) {
        ctx.fillStyle = '#516170';
        ctx.font = '600 14px "Helvetica Neue", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pair.name + 'blech noch nicht eingetaucht', DW / 2 - 60, DH / 2);
      }
      for (const p of this.particles) {
        if (p.kind === 'cation') drawCation(ctx, p.x, p.y, p.el, true, p.highlight > 0 || p.state === 'dl');
        else if (p.kind === 'anion') drawSimpleIon(ctx, p.x, p.y, STYLE[p.el], true);
      }
      for (const p of this.particles) if (p.kind === 'electron') drawElectron(ctx, p.x, p.y, true);

      // Ladungsanzeige
      ctx.font = '700 12px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#1756c9';
      ctx.fillText('Metall: ' + (this.q > 0 ? this.q + ' e⁻ Überschuss (−)' : 'neutral'), 12, DH - 12);
    }

    drawChart() {
      const ctx = this.cctx;
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, CW, CH);
      const x0 = 46;
      const y0 = CH - 28;
      const x1 = CW - 90;
      const y1 = 14;
      const qMax = 14;
      ctx.strokeStyle = '#9aa8b5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y1);
      ctx.lineTo(x0, y0);
      ctx.lineTo(x1, y0);
      ctx.stroke();
      ctx.fillStyle = '#516170';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let q = 0; q <= qMax; q += 2) {
        const y = y0 - (q / qMax) * (y0 - y1);
        ctx.fillText(String(q), x0 - 5, y);
        ctx.strokeStyle = '#eef2f5';
        ctx.beginPath();
        ctx.moveTo(x0 + 1, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let t = 0; t <= T_MAX; t += 5) {
        ctx.fillText(t + ' s', x0 + (t / T_MAX) * (x1 - x0), y0 + 4);
      }
      ctx.save();
      ctx.translate(12, (y0 + y1) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle';
      ctx.fillText('Überschuss-e⁻', 0, 0);
      ctx.restore();
      const plot = (hist, color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        hist.forEach((h, i) => {
          const x = x0 + (Math.min(h.t, T_MAX) / T_MAX) * (x1 - x0);
          const y = y0 - (h.q / qMax) * (y0 - y1);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      };
      let ly = y1 + 4;
      for (const id of C.ORDER) {
        const run = this.runs[id];
        const isCur = id === this.metal;
        if (run && !isCur) {
          ctx.globalAlpha = 0.55;
          plot(run.hist, P[id].metalDark, 1.5);
          ctx.globalAlpha = 1;
        }
        if (run || isCur) {
          ctx.fillStyle = isCur ? P[id].metalDark : P[id].metalDark;
          ctx.fillRect(x1 + 12, ly, 12, 4);
          ctx.fillStyle = '#1d2733';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.font = (isCur ? '700 ' : '') + '11px Arial';
          ctx.fillText(P[id].name, x1 + 28, ly + 2);
          ly += 16;
        }
      }
      if (this.hist.length) plot(this.hist, P[this.metal].metalDark, 2.6);
    }

    onFrame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.running && !document.hidden) {
        this.step(dt);
        this.draw();
        this.drawChart();
      }
      requestAnimationFrame(this.onFrame);
    }
  }

  window.GZParticles = { CellView, DoubleLayerView, reduceMotion };
})();
