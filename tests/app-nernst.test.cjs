// End-to-End Node-DOM-Integrationstests für das Nernst-Modul in app.js + index.html
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const HTML_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS_SRC = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const CHEM_SRC = fs.readFileSync(path.join(ROOT, 'chem.js'), 'utf8');
const PARTICLES_SRC = fs.readFileSync(path.join(ROOT, 'particles.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

const VOID_TAGS = new Set(['meta', 'link', 'img', 'input', 'br', 'hr', 'source', 'track']);

function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z0-9_:\-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function makeClassList(el) {
  const getSet = () => new Set((el.attributes.class || '').split(/\s+/).filter(Boolean));
  const sync = (set) => { el.attributes.class = Array.from(set).join(' '); };
  return {
    add(...cls) { const s = getSet(); cls.forEach((c) => s.add(c)); sync(s); },
    remove(...cls) { const s = getSet(); cls.forEach((c) => s.delete(c)); sync(s); },
    contains(c) { return getSet().has(c); },
    toggle(c, force) {
      const s = getSet();
      const on = force === undefined ? !s.has(c) : !!force;
      if (on) s.add(c);
      else s.delete(c);
      sync(s);
      return on;
    },
  };
}

function makeCanvasCtx() {
  const grad = { addColorStop() { } };
  const noop = () => { };
  return new Proxy({
    measureText: (t) => ({ width: String(t || '').length * 7 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    setTransform: noop,
    setLineDash: noop,
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return noop;
    },
    set(target, prop, val) { target[prop] = val; return true; },
  });
}

function createNode(tag, attrs, doc) {
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    attributes: Object.assign({}, attrs),
    children: [],
    _nodes: [],
    parentNode: null,
    _value: attrs.value !== undefined ? attrs.value : '',
    _checked: Object.prototype.hasOwnProperty.call(attrs, 'checked'),
    _open: Object.prototype.hasOwnProperty.call(attrs, 'open'),
    _listeners: {},
    style: { setProperty() { } },
    get id() { return this.attributes.id || ''; },
    set id(v) { this.attributes.id = String(v); },
    get className() { return this.attributes.class || ''; },
    set className(v) { this.attributes.class = String(v); },
    get name() { return this.attributes.name || ''; },
    get type() { return (this.attributes.type || '').toLowerCase(); },
    get disabled() { return Object.prototype.hasOwnProperty.call(this.attributes, 'disabled'); },
    set disabled(v) { if (v) this.attributes.disabled = ''; else delete this.attributes.disabled; },
    get hidden() { return Object.prototype.hasOwnProperty.call(this.attributes, 'hidden'); },
    set hidden(v) { if (v) this.attributes.hidden = ''; else delete this.attributes.hidden; },
    get open() { return this._open; },
    set open(v) {
      this._open = !!v;
      if (this._open) this.attributes.open = '';
      else delete this.attributes.open;
    },
    get checked() { return this._checked; },
    set checked(v) {
      const next = !!v;
      if (next && this.tagName === 'INPUT' && this.type === 'radio' && this.name) {
        for (const r of doc.querySelectorAll(`input[name="${this.name}"]`)) {
          if (r !== this) r._checked = false;
        }
      }
      this._checked = next;
    },
    get value() {
      if (this.tagName === 'SELECT') {
        const selOpt = this.children.find((c) => c.tagName === 'OPTION' && c._selected);
        if (selOpt) return selOpt.value;
        if (this._value) return this._value;
        return this.children[0] ? this.children[0].value : '';
      }
      return this._value;
    },
    set value(v) {
      const str = String(v);
      this._value = str;
      if (this.tagName === 'SELECT') {
        for (const c of this.children) {
          if (c.tagName === 'OPTION') c._selected = c.value === str;
        }
      }
    },
    get selected() { return !!this._selected; },
    set selected(v) { this._selected = !!v; },
    get textContent() {
      return this._nodes.map((n) => n.textContent).join('');
    },
    set textContent(v) {
      this.children = [];
      this._nodes = v === '' ? [] : [{ nodeType: 3, textContent: String(v) }];
    },
    get innerHTML() {
      return this._rawInnerHTML !== undefined ? this._rawInnerHTML : this.textContent;
    },
    set innerHTML(html) {
      const str = String(html);
      this._rawInnerHTML = str;
      this.children = [];
      this._nodes = [];
      parseInto(str, this, doc);
      if (this.tagName === 'SELECT') {
        const selOpt = this.children.find((c) => c.tagName === 'OPTION' && Object.prototype.hasOwnProperty.call(c.attributes, 'selected'));
        this._value = selOpt ? selOpt.value : '';
      }
    },
    getAttribute(k) {
      const key = String(k).toLowerCase();
      return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
    },
    setAttribute(k, v) {
      const key = String(k).toLowerCase();
      this.attributes[key] = String(v);
      if (key === 'open') this._open = true;
    },
    removeAttribute(k) {
      const key = String(k).toLowerCase();
      delete this.attributes[key];
      if (key === 'open') this._open = false;
    },
    hasAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attributes, String(k).toLowerCase());
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      this._nodes.push(child);
      return child;
    },
    addEventListener(type, fn) {
      this._listeners[type] = this._listeners[type] || [];
      this._listeners[type].push(fn);
    },
    dispatchEvent(evt) {
      const e = Object.assign({
        type: '',
        target: this,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
      }, evt || {});
      let cur = this;
      while (cur) {
        const list = (cur._listeners && cur._listeners[e.type]) || [];
        for (const fn of list) fn.call(cur, e);
        if (e.type === 'change' || e.type === 'input' || e.type === 'submit') break;
        cur = cur.parentNode;
      }
      return !e.defaultPrevented;
    },
    click() {
      if (this.tagName === 'INPUT' && this.type === 'checkbox') {
        this.checked = !this.checked;
        this.dispatchEvent({ type: 'change', target: this });
      } else if (this.tagName === 'INPUT' && this.type === 'radio') {
        this.checked = true;
        this.dispatchEvent({ type: 'change', target: this });
      } else {
        this.dispatchEvent({ type: 'click', target: this });
      }
    },
    closest(sel) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (matchesSimple(cur, sel)) return cur;
        cur = cur.parentNode;
      }
      return null;
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const out = [];
      const parts = sel.split(',').map((s) => s.trim()).filter(Boolean);
      const visit = (node) => {
        for (const c of node.children) {
          if (parts.some((p) => matchesSelector(c, p, node === el ? null : el))) out.push(c);
          visit(c);
        }
      };
      visit(this);
      return out;
    },
    scrollIntoView() { },
    getContext() { return makeCanvasCtx(); },
  };
  el.classList = makeClassList(el);
  el.dataset = new Proxy({}, {
    get(_, prop) {
      const attr = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
      return el.attributes[attr];
    },
    set(_, prop, val) {
      const attr = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
      el.attributes[attr] = String(val);
      return true;
    },
  });
  if (Object.prototype.hasOwnProperty.call(attrs, 'selected')) el._selected = true;
  return el;
}

function matchesSimple(el, sel) {
  let s = sel.trim();
  if (!s) return false;
  const tagM = s.match(/^[a-zA-Z0-9_-]+/);
  if (tagM) {
    if (el.tagName !== tagM[0].toUpperCase()) return false;
    s = s.slice(tagM[0].length);
  }
  while (s.length) {
    if (s[0] === '#') {
      const m = s.slice(1).match(/^[a-zA-Z0-9_-]+/);
      if (!m || el.id !== m[0]) return false;
      s = s.slice(1 + m[0].length);
    } else if (s[0] === '.') {
      const m = s.slice(1).match(/^[a-zA-Z0-9_-]+/);
      if (!m || !el.classList.contains(m[0])) return false;
      s = s.slice(1 + m[0].length);
    } else if (s[0] === '[') {
      const end = s.indexOf(']');
      if (end < 0) return false;
      const body = s.slice(1, end);
      const eq = body.indexOf('=');
      if (eq < 0) {
        if (!el.hasAttribute(body.trim())) return false;
      } else {
        const k = body.slice(0, eq).trim().toLowerCase();
        const v = body.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (el.getAttribute(k) !== v) return false;
      }
      s = s.slice(end + 1);
    } else {
      return false;
    }
  }
  return true;
}

function matchesSelector(el, sel) {
  const tokens = sel.trim().split(/\s+/);
  if (!matchesSimple(el, tokens[tokens.length - 1])) return false;
  if (tokens.length === 1) return true;
  let cur = el.parentNode;
  for (let i = tokens.length - 2; i >= 0; i--) {
    while (cur && !matchesSimple(cur, tokens[i])) cur = cur.parentNode;
    if (!cur) return false;
    cur = cur.parentNode;
  }
  return true;
}

function parseInto(html, root, doc) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const stack = [root];
  const tokenRe = /<\/?([a-zA-Z0-9_-]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = tokenRe.exec(clean))) {
    if (m[3] !== undefined) {
      const txt = m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, '\u00a0');
      const cur = stack[stack.length - 1];
      cur._nodes.push({ nodeType: 3, textContent: txt });
      continue;
    }
    const rawTag = m[0];
    const tag = m[1].toLowerCase();
    if (rawTag.startsWith('</')) {
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tagName === tag.toUpperCase()) {
          stack.length = i;
          break;
        }
      }
    } else {
      const attrs = parseAttrs(m[2] || '');
      const node = createNode(tag, attrs, doc);
      stack[stack.length - 1].appendChild(node);
      if (!VOID_TAGS.has(tag) && !rawTag.endsWith('/>')) {
        stack.push(node);
      }
    }
  }
}

function mountApp(initialStorage, confirmResult = true) {
  const store = Object.assign({}, initialStorage || {});
  const doc = {
    readyState: 'complete',
    hidden: false,
    _listeners: {},
    body: null,
    root: null,
    addEventListener(type, fn) {
      this._listeners[type] = this._listeners[type] || [];
      this._listeners[type].push(fn);
    },
    getElementById(id) { return this.querySelector('#' + id); },
    querySelector(sel) { return this.root.querySelector(sel); },
    querySelectorAll(sel) { return this.root.querySelectorAll(sel); },
  };
  doc.root = createNode('document', {}, doc);
  parseInto(HTML_SRC, doc.root, doc);
  doc.body = doc.querySelector('body');

  const win = {
    document: doc,
    location: { href: 'http://localhost/' },
    matchMedia: () => ({ matches: false }),
    confirm: () => confirmResult,
    print: () => { },
    requestAnimationFrame: () => 1,
    setInterval: () => 1,
    clearInterval: () => { },
    IntersectionObserver: function () { return { observe() { } }; },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    performance: { now: () => 0 },
    Math, Number, String, Array, Object, JSON, Error, RegExp, parseFloat,
  };
  win.window = win;
  win.self = win;

  const ctx = vm.createContext(win);
  vm.runInContext(CHEM_SRC, ctx);
  vm.runInContext(PARTICLES_SRC, ctx);
  vm.runInContext(APP_SRC, ctx);
  return { doc, win, store };
}

test('Typografie-Fix: .formula-title hat kein text-transform: uppercase', () => {
  assert.equal(/\.formula-title\s*\{[^}]*text-transform\s*:\s*uppercase/i.test(CSS_SRC), false);
});

test('Alte localStorage-Daten werden migriert und starten im 0,01 M | 0,1 M Unterrichtsgang', () => {
  const legacy = JSON.stringify({
    lab: { left: { metal: 'Zn', electrolyte: 'Zn', c: 0.1 }, right: { metal: 'Cu', electrolyte: 'Cu', c: 0.1 }, cables: true, redSide: 'right', bridge: 'kno3', device: 'voltmeter' },
    gallery: {},
  });
  const { doc } = mountApp({ 'gz-portal-v1': legacy });
  assert.equal(doc.querySelector('#nernst-badge').textContent, '0 / 7 gemessen');
  assert.equal(doc.querySelector('#progress-text').textContent, '0 / 16 erledigt');
  assert.equal(doc.querySelector('#nernst-u').textContent, '0,059 V');
  assert.equal(doc.querySelector('#nernst-ratio').textContent, '10 : 1 (lg = 1)');
  assert.equal(doc.querySelector('#nernst-role').textContent, 'Links Anode (−) · Rechts Kathode (+)');
  assert.equal(doc.querySelector('#nernst-formula-details').open, false);
});

test('Apparatur-SVG spiegelt Ionendichte sauber ohne Elektroden-Überlappung', () => {
  const { doc } = mountApp();
  const stage = doc.querySelector('#nernst-apparatus');
  const svg = stage.querySelector('svg');
  assert.equal(svg.getAttribute('role'), 'img');
  assert.ok(svg.querySelector('title').textContent.includes('Silber-Konzentrationszelle'));
  const circles = svg.querySelectorAll('circle').filter((c) => c.getAttribute('r') === '3.4');
  // 6 Ionen links (0,01 M) + 11 Ionen rechts (0,1 M) = 17
  assert.equal(circles.length, 17);
  const rightElectrodeOverlap = circles.filter((c) => {
    const cx = Number(c.getAttribute('cx'));
    return cx >= 394 && cx <= 416;
  });
  assert.equal(rightElectrodeOverlap.length, 0, 'keine Ionen auf rechter Elektrode');

  // Virtuelle 1 M rechts + 0,001 M links -> 2 + 16 = 18 Ionen, Verhältnis 1000 : 1
  doc.querySelector('input[name="nernst-c-left"][value="0.001"]').click();
  doc.querySelector('input[name="nernst-c-right"][value="1"]').click();
  const circles1M = doc.querySelector('#nernst-apparatus svg').querySelectorAll('circle').filter((c) => c.getAttribute('r') === '3.4');
  assert.equal(circles1M.length, 18);
  assert.equal(circles1M.filter((c) => Number(c.getAttribute('cx')) >= 394 && Number(c.getAttribute('cx')) <= 416).length, 0);
  assert.equal(doc.querySelector('#nernst-ratio').textContent, '1000 : 1 (lg = 3)');

  // Konzentration links > rechts dreht Polung dynamisch um
  doc.querySelector('input[name="nernst-c-left"][value="1"]').click();
  doc.querySelector('input[name="nernst-c-right"][value="0.001"]').click();
  assert.equal(doc.querySelector('#nernst-role').textContent, 'Rechts Anode (−) · Links Kathode (+)');
});

test('7er-Messreihe der Silber-Konzentrationszellen und Diagramme funktionieren end-to-end', () => {
  const { doc } = mountApp();
  doc.querySelector('#nernst-record-all').click();
  assert.equal(doc.querySelector('#nernst-badge').textContent, '7 / 7 gemessen');

  const rows = doc.querySelectorAll('#nernst-table-body tr');
  assert.equal(rows.length, 7);
  assert.equal(rows[0].querySelectorAll('td')[3].textContent, '— (lg = 0)');
  for (let i = 1; i < rows.length; i++) {
    const fx = rows[i].querySelectorAll('td')[3].textContent;
    assert.match(fx, /^0,0(58|59|60) V$/, `Faktor x Zeile ${i}: ${fx}`);
  }

  const svgA = doc.querySelector('#nernst-chart-linear svg');
  const svgB = doc.querySelector('#nernst-chart-log svg');
  assert.ok(svgA && svgB);
  const summary = doc.querySelector('#nernst-reg-summary').textContent;
  assert.match(summary, /Ausgleichsgerade \(n = 7\):/);
  assert.match(summary, /Faktor x = 0,0(58|59|60)/);
  assert.match(summary, /R² = (0,999\d|1,0000)/);

  // Kupfer-Vergleich einblenden überlagert direkt Diagramm B
  doc.querySelector('#nernst-show-cu').click();
  assert.ok(doc.querySelector('#nernst-chart-log').innerHTML.includes('Cu (z = 2): x ≈ 0,0295 V'));
});

test('Auswertung (3a, 3b), Ziel-Experiment Alte AgNO3-Lösung, Transferaufgabe, Hauptlabor und Reset', () => {
  const { doc, store } = mountApp();
  doc.querySelector('#nernst-record-all').click();

  // Fehleingabe in 3b (mV statt V) setzt aria-invalid="true" und gibt mV-Hinweis
  const slopeIn = doc.querySelector('#nernst-slope-in');
  slopeIn.value = '59';
  slopeIn.dispatchEvent({ type: 'input', target: slopeIn });
  doc.querySelector('form[data-check-form="nernst-derive"]').dispatchEvent({ type: 'submit' });
  assert.equal(slopeIn.getAttribute('aria-invalid'), 'true');
  assert.ok(doc.querySelector('#fb-nernst-derive').textContent.includes('statt Millivolt (mV)'));

  slopeIn.value = '0,059';
  slopeIn.dispatchEvent({ type: 'input', target: slopeIn });
  assert.equal(slopeIn.hasAttribute('aria-invalid'), false);

  // 3a komplett
  for (const [id, val] of [['#nernst-q1', 'prod'], ['#nernst-q2', 'mehr'], ['#nernst-q3', 'anode']]) {
    const el = doc.querySelector(id);
    el.value = val;
    el.dispatchEvent({ type: 'change', target: el });
  }
  doc.querySelector('form[data-check-form="nernst-qual"]').dispatchEvent({ type: 'submit' });
  assert.ok(doc.querySelector('#fb-nernst-qual').textContent.startsWith('✔'));

  // 3b komplett -> öffnet Formel-Details automatisch
  const rSel = doc.querySelector('#nernst-reason-ratio');
  rSel.value = 'ratio';
  rSel.dispatchEvent({ type: 'change', target: rSel });
  const lSel = doc.querySelector('#nernst-reason-log');
  lSel.value = 'double';
  lSel.dispatchEvent({ type: 'change', target: lSel });
  doc.querySelector('form[data-check-form="nernst-derive"]').dispatchEvent({ type: 'submit' });
  assert.ok(doc.querySelector('#fb-nernst-derive').textContent.startsWith('✔'));
  assert.equal(doc.querySelector('#nernst-formula-details').open, true);

  // Ziel-Experiment: Polwechsel zwischen 1 M / 0,1 M und 0,01 M beobachten & c_alt = 0,020 prüfen
  doc.querySelector('input[name="nernst-old-ref"][value="1"]').click();
  assert.ok(doc.querySelector('#nernst-old-poles').textContent.includes('Alte Lösung = Minuspol'));
  doc.querySelector('input[name="nernst-old-ref"][value="0.1"]').click();
  assert.ok(doc.querySelector('#nernst-old-poles').textContent.includes('Alte Lösung = Minuspol'));
  doc.querySelector('input[name="nernst-old-ref"][value="0.01"]').click();
  assert.ok(doc.querySelector('#nernst-old-poles').textContent.includes('Alte Lösung = Pluspol'));

  const oldIn = doc.querySelector('#nernst-old-c');
  oldIn.value = '0,020';
  oldIn.dispatchEvent({ type: 'input', target: oldIn });
  doc.querySelector('form[data-check-form="nernst-old"]').dispatchEvent({ type: 'submit' });
  assert.ok(doc.querySelector('#fb-nernst-old').textContent.startsWith('✔'));

  // Transferaufgabe Kupfer (0,001 M | 0,1 M) -> mV-Hinweis testen, dann 0,059 V
  const cuIn = doc.querySelector('#nernst-ex-cu');
  cuIn.value = '59';
  cuIn.dispatchEvent({ type: 'input', target: cuIn });
  doc.querySelector('form[data-check-form="nernst-ex-cu"]').dispatchEvent({ type: 'submit' });
  assert.equal(cuIn.getAttribute('aria-invalid'), 'true');
  assert.ok(doc.querySelector('#fb-nernst-ex-cu').textContent.includes('statt Millivolt (mV)'));

  cuIn.value = '0,059';
  cuIn.dispatchEvent({ type: 'input', target: cuIn });
  doc.querySelector('form[data-check-form="nernst-ex-cu"]').dispatchEvent({ type: 'submit' });
  assert.ok(doc.querySelector('#fb-nernst-ex-cu').textContent.startsWith('✔'));

  assert.equal(doc.querySelector('#progress-text').textContent, '5 / 16 erledigt');

  // Hauptlabor-Verknüpfung (Kupfer 0,001 M | 0,1 M)
  doc.querySelector('#nernst-open-cu-lab').click();
  assert.equal(doc.querySelector('#expert-mode').checked, true);
  const parsed = JSON.parse(store['gz-portal-v1']);
  assert.equal(parsed.lab.left.metal, 'Cu');
  assert.equal(parsed.lab.left.c, 0.001);
  assert.equal(parsed.lab.right.c, 0.1);

  // Reset setzt alles zurück
  doc.querySelector('#reset-all').click();
  assert.equal(doc.querySelector('#progress-text').textContent, '0 / 16 erledigt');
  assert.equal(doc.querySelector('#nernst-badge').textContent, '0 / 7 gemessen');
  assert.equal(doc.querySelector('#nernst-formula-details').open, false);
  assert.equal(doc.querySelector('#fb-nernst-old').textContent, '');
});

test('Eingabehinweise spoilern keine konkreten Lösungswerte', () => {
  const { doc } = mountApp();
  const slopeHint = doc.querySelector('#nernst-slope-hint').textContent;
  const oldHint = doc.querySelector('#nernst-old-c-hint').textContent;
  const cuHint = doc.querySelector('#nernst-ex-cu-hint').textContent;
  assert.equal(slopeHint.includes('0,059'), false, slopeHint);
  assert.equal(oldHint.includes('0,020'), false, oldHint);
  assert.equal(cuHint.includes('0,059'), false, cuHint);
});
