/* Virtuelles Labor: Galvanische Zellen – Steuerung, Auswertung, Persistenz */
(function () {
  'use strict';
  const C = window.GZChem;
  const P = C.PAIRS;
  const STORE_KEY = 'gz-portal-v1';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- Zustand ---------- */
  const DEFAULT_NERNST = () => ({
    cLeft: 0.01,
    cRight: 0.1,
    measured: {},
    showFit: true,
    showCuCompare: false,
    qualitative: { q1: '', q2: '', q3: '' },
    qualOk: false,
    reasonRatio: '',
    reasonLog: '',
    slope: '',
    deriveOk: false,
    oldRefC: 0.1,
    oldC: '',
    oldCOk: false,
    exCu: '',
    exCuOk: false,
  });

  const DEFAULT_STATE = () => ({
    lab: {
      left: { metal: '', electrolyte: '', c: 0.1 },
      right: { metal: '', electrolyte: '', c: 0.1 },
      cables: false, redSide: 'right', bridge: 'none', device: 'voltmeter',
    },
    ui: { expert: false, showDL: true, labels: true, speed: 1 },
    gallery: {},
    extra: [],
    tasks: { order: ['', '', '', ''], orderOk: false, additiv: '', additivOk: false, sentenceCell: '', sentences: {}, sentencesOk: false, match: {}, matchOk: false, dlNotes: '' },
    dl: {},
    nernst: DEFAULT_NERNST(),
  });

  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return DEFAULT_STATE();
      const s = JSON.parse(raw);
      const d = DEFAULT_STATE();
      const dn = DEFAULT_NERNST();
      const sn = s.nernst || {};
      const nernst = Object.assign(dn, sn, {
        measured: Object.assign({}, sn.measured || {}),
        qualitative: Object.assign(dn.qualitative, sn.qualitative || {}),
      });
      if (!C.SILVER_CONCS.includes(Number(nernst.cLeft))) nernst.cLeft = 0.01;
      if (!C.SILVER_CONCS.includes(Number(nernst.cRight))) nernst.cRight = 0.1;
      if (!C.SILVER_CONCS.includes(Number(nernst.oldRefC))) nernst.oldRefC = 0.1;
      return {
        lab: Object.assign(d.lab, s.lab || {}),
        ui: Object.assign(d.ui, s.ui || {}),
        gallery: s.gallery || {},
        extra: Array.isArray(s.extra) ? s.extra : [],
        tasks: Object.assign(d.tasks, s.tasks || {}),
        dl: s.dl || {},
        nernst,
      };
    } catch (e) {
      return DEFAULT_STATE();
    }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* privat-Modus */ }
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const name = (id) => (P[id] ? P[id].name : '');

  /* ---------- Analyse & Messanzeige ---------- */
  let analysis = C.analyzeCell(state.lab);
  let noise = 0;
  let drift = 0.4;

  function displayValue() {
    const lab = state.lab;
    const an = analysis;
    if (!lab.cables || !an.halfCellsReady) return null;
    if (!an.closed) return 0;
    if (!an.conjugate) return drift;
    if (an.deltaE < 1e-9) return noise / 4;
    const sign = Math.sign(an.reading);
    return sign * C.measuredDeltaE(lab.left, lab.right) + noise;
  }
  function displayText() {
    const v = displayValue();
    if (v === null) return '- - -';
    return C.fmtNum(v, 3) + ' V';
  }

  /* ---------- Teilchen-Ansichten ---------- */
  let cellView = null;
  let dlView = null;

  /* =====================================================================
     LABOR
     ===================================================================== */
  function initLab() {
    $$('.halfcell').forEach((fs) => {
      const side = fs.dataset.side;
      $$('select', fs).forEach((sel) => {
        sel.addEventListener('change', () => {
          const f = sel.dataset.field;
          state.lab[side][f] = f === 'c' ? Number(sel.value) : sel.value;
          // Elektrolyt automatisch vorschlagen? Nein – Lernende sollen das konjugierte Paar selbst wählen.
          onLabChange();
        });
      });
    });
    $('#toggle-cables').addEventListener('click', () => {
      state.lab.cables = !state.lab.cables;
      onLabChange();
    });
    $('#swap-cables').addEventListener('click', () => {
      state.lab.redSide = state.lab.redSide === 'left' ? 'right' : 'left';
      onLabChange();
    });
    $$('input[name="device"]').forEach((r) => r.addEventListener('change', () => { state.lab.device = r.value; onLabChange(); }));
    $$('input[name="bridge"]').forEach((r) => r.addEventListener('change', () => { state.lab.bridge = r.value; onLabChange(); }));
    $('#record-btn').addEventListener('click', recordMeasurement);
    $('#random-cell').addEventListener('click', () => {
      const ids = C.ORDER.slice().sort(() => Math.random() - 0.5);
      setCell(ids[0], ids[1]);
    });
    $('#next-cell').addEventListener('click', () => {
      const open = C.coreCombos().find((c) => !state.gallery[c.key]);
      if (!open) { setStatusOnce('Alle sechs Zellen sind bereits dokumentiert. Probiere den Expertenmodus aus!'); return; }
      if (Math.random() < 0.5) setCell(open.anode, open.cathode); else setCell(open.cathode, open.anode);
    });
    const expert = $('#expert-mode');
    expert.checked = state.ui.expert;
    expert.addEventListener('change', () => {
      state.ui.expert = expert.checked;
      if (!expert.checked) { state.lab.left.c = 0.1; state.lab.right.c = 0.1; }
      onLabChange();
    });
    // Live-Messrauschen des Multimeters
    setInterval(() => {
      noise = (Math.random() - 0.5) * 0.004;
      drift = Math.max(0.05, Math.min(0.95, drift + (Math.random() - 0.5) * 0.12));
      if (state.lab.cables && analysis.closed) updateReadout();
    }, 650);
  }

  let statusOverride = '';
  function setStatusOnce(msg) { statusOverride = msg; renderStatus(); statusOverride = ''; }

  function setCell(a, b) {
    state.lab.left = { metal: a, electrolyte: a, c: state.ui.expert ? state.lab.left.c : 0.1 };
    state.lab.right = { metal: b, electrolyte: b, c: state.ui.expert ? state.lab.right.c : 0.1 };
    onLabChange();
  }

  function onLabChange() {
    analysis = C.analyzeCell(state.lab);
    syncControls();
    renderApparatus();
    updateReadout();
    renderSteps();
    renderStatus();
    renderCaption();
    renderWaterModel();
    if (cellView) cellView.configure(viewConfig());
    save();
  }

  function viewConfig() {
    return {
      left: state.lab.left, right: state.lab.right, cables: state.lab.cables,
      redSide: state.lab.redSide, bridge: state.lab.bridge, device: state.lab.device,
      analysis, displayText: displayText(),
    };
  }

  function syncControls() {
    document.body.classList.toggle('expert', state.ui.expert);
    $$('.halfcell').forEach((fs) => {
      const side = fs.dataset.side;
      $$('select', fs).forEach((sel) => {
        const v = state.lab[side][sel.dataset.field];
        sel.value = String(v);
      });
    });
    const tc = $('#toggle-cables');
    tc.textContent = state.lab.cables ? 'Kabel abziehen' : 'Kabel anschließen';
    $('#swap-cables').disabled = !state.lab.cables;
    $$('input[name="device"]').forEach((r) => { r.checked = r.value === state.lab.device; });
    $$('input[name="bridge"]').forEach((r) => { r.checked = r.value === state.lab.bridge; });
    const ci = $('#cable-info');
    if (!state.lab.cables) ci.textContent = 'Kabel nicht angeschlossen.';
    else {
      const red = state.lab.redSide === 'left' ? 'linke' : 'rechte';
      const black = state.lab.redSide === 'left' ? 'rechte' : 'linke';
      const rm = state.lab[state.lab.redSide].metal;
      const bm = state.lab[state.lab.redSide === 'left' ? 'right' : 'left'].metal;
      ci.textContent = 'Rotes Kabel (V) → ' + red + ' Elektrode' + (rm ? ' (' + name(rm) + ')' : '') + ', schwarzes Kabel (COM) → ' + black + ' Elektrode' + (bm ? ' (' + name(bm) + ')' : '') + '.';
    }
  }

  function updateReadout() {
    const lab = state.lab;
    const an = analysis;
    const label = $('#readout-label');
    const out = $('#readout-value');
    if (lab.device === 'motor') {
      label.textContent = 'Amperemeter-Anzeige (Stromstärke I)';
      out.textContent = lab.cables ? (an.valid ? C.fmtNum(an.current * 1000, 2) + ' mA' : '0,00 mA') : '—';
    } else {
      label.textContent = 'Voltmeter-Anzeige (Spannung U)';
      out.textContent = displayText();
    }
    out.classList.toggle('is-negative', (displayValue() || 0) < -0.0005 && lab.device === 'voltmeter');
    out.classList.toggle('is-unstable', lab.cables && an.closed && !an.conjugate);
    const ra = $('#readout-anode');
    const rk = $('#readout-cathode');
    if (an.conjugate && an.anodeSide) {
      ra.textContent = name(lab[an.anodeSide].metal) + ' (' + (an.anodeSide === 'left' ? 'links' : 'rechts') + ')';
      rk.textContent = name(lab[an.cathodeSide].metal) + ' (' + (an.cathodeSide === 'left' ? 'links' : 'rechts') + ')';
    } else {
      ra.textContent = '—';
      rk.textContent = '—';
    }
    if (cellView) { cellView.cfg && (cellView.cfg.displayText = displayText()); }
    renderRecordButton();
    // Anzeige im SVG
    const svgText = $('#svg-display');
    if (svgText) svgText.textContent = lab.device === 'motor' ? out.textContent : displayText();
  }

  function stepState() {
    const lab = state.lab;
    const an = analysis;
    const s1 = an.conjugate;
    const s2 = lab.cables && (an.conjugate ? (an.cathodeSide ? lab.redSide === an.cathodeSide : true) : false);
    const s3 = lab.bridge === 'kno3';
    const key = an.conjugate ? C.comboKey(lab.left, lab.right) : '';
    const s4 = !!key && (!!state.gallery[key] || state.extra.some((e) => e.key === key));
    return { s1, s2, s3, s4, key };
  }

  function renderSteps() {
    const st = stepState();
    const an = analysis;
    const flags = [st.s1, st.s2, st.s3, st.s4];
    flags.forEach((ok, i) => {
      const li = $('#step-' + (i + 1));
      li.classList.toggle('is-done', ok);
      const ov = $('#todo-overview li[data-step="' + (i + 1) + '"]');
      if (ov) ov.classList.toggle('is-done', ok);
    });
    $('#step-1').classList.toggle('is-warn', !!(an.mismatch.left || an.mismatch.right));
    $('#step-2').classList.toggle('is-warn', state.lab.cables && an.conjugate && !!an.cathodeSide && state.lab.redSide !== an.cathodeSide);
    const note = $('#mismatch-note');
    const msgs = [];
    for (const side of ['left', 'right']) {
      const m = an.mismatch[side];
      if (m) msgs.push('<strong>' + (side === 'left' ? 'Links' : 'Rechts') + ':</strong> ' + esc(m.text));
    }
    note.hidden = !msgs.length;
    note.innerHTML = msgs.join('<br>');
    const badge = $('#lab-badge');
    badge.className = 'badge';
    if (an.valid && an.reading > 0 && state.lab.device === 'voltmeter') { badge.textContent = 'Messung stabil'; badge.classList.add('is-done'); }
    else if (an.valid && state.lab.device === 'motor') { badge.textContent = 'Strom fließt'; badge.classList.add('is-done'); }
    else if (an.valid) { badge.textContent = 'Kabel prüfen'; badge.classList.add('is-ready'); }
    else if (an.halfCellsReady && !an.conjugate) { badge.textContent = 'Fehlkombination'; badge.classList.add('is-over'); }
    else { badge.textContent = 'Aufbau unvollständig'; }
  }

  function renderStatus() {
    const lab = state.lab;
    const an = analysis;
    const box = $('#lab-status');
    let msg = '';
    if (statusOverride) msg = statusOverride;
    else if (!an.halfCellsReady) msg = 'Schritt 1: Wähle für beide Bechergläser ein Metallblech und den passenden Elektrolyten (konjugiertes Redoxpaar).';
    else if (!an.conjugate) msg = 'Achtung: Mindestens eine „Halbzelle“ besteht nicht aus einem konjugierten Redoxpaar. Wähle zum Metall die Lösung seiner eigenen Ionen.';
    else if (!lab.cables) msg = 'Schritt 2: Verbinde beide Elektroden über Kabel mit dem Messgerät.';
    else if (lab.bridge === 'none') msg = 'Die Anzeige bleibt bei 0 V: Der Stromkreis ist nicht geschlossen. Es fehlt der innere Stromkreis – die leitende Verbindung zwischen den Elektrolyten (Schritt 3).';
    else if (lab.bridge === 'dry') msg = 'Trockenes Filterpapier enthält keine frei beweglichen Ionen: Es ist kein Ladungsausgleich möglich, der Stromkreis bleibt offen (0 V). Tränke das Filterpapier mit KNO₃-Lösung.';
    else if (an.deltaE < 1e-9) msg = 'Beide Halbzellen sind identisch und besitzen dasselbe Potenzial – es gibt keinen Potenzialunterschied (U = 0 V). Kombiniere zwei verschiedene Halbzellen.';
    else if (lab.device === 'motor') msg = 'Stromkreis geschlossen: Es fließt ein Strom von I = ' + C.fmtNum(an.current * 1000, 2) + ' mA (Innenwiderstand v. a. durch die Salzbrücke). Elektronen fließen vom ' + name(lab[an.anodeSide].metal) + 'blech (Minuspol) zum ' + name(lab[an.cathodeSide].metal) + 'blech (Pluspol). Zum Messen der Spannung wieder auf „Voltmeter“ umschalten.';
    else if (an.reading < 0) msg = 'Negative Anzeige: Das rote Kabel (V) hängt am Minuspol (' + name(lab[an.anodeSide].metal) + '). Tausche die Kabel, damit eine positive Spannung angezeigt wird.';
    else {
      const U = C.measuredDeltaE(lab.left, lab.right);
      const dec = lab.left.metal === lab.right.metal ? 3 : 2;
      msg = 'Stabile, positive Spannung: U ≈ ' + C.fmtNum(U, dec) + ' V. Das rote Kabel (V) hängt am Pluspol (' + name(lab[an.cathodeSide].metal) + '), das schwarze (COM) am Minuspol (' + name(lab[an.anodeSide].metal) + '). → Übernimm den Messwert in die Versuchsgalerie (Schritt 4).';
    }
    box.textContent = msg;
  }

  function canRecord() {
    const an = analysis;
    return an.valid && state.lab.device === 'voltmeter' && an.deltaE > 1e-9 && an.reading > 0;
  }

  function renderRecordButton() {
    const btn = $('#record-btn');
    const info = $('#record-info');
    const ok = canRecord();
    btn.disabled = !ok;
    const st = stepState();
    if (ok && st.s4) info.textContent = 'Diese Zelle ist bereits dokumentiert. Erneutes Übernehmen überschreibt den Eintrag.';
    else if (ok) info.textContent = 'Bereit: Die Anzeige ist stabil und positiv.';
    else if (analysis.valid && state.lab.device === 'motor') info.textContent = 'Zum Dokumentieren der Spannung auf „Voltmeter“ umschalten.';
    else if (analysis.valid && analysis.reading < 0) info.textContent = 'Negative Anzeige – erst Kabel tauschen.';
    else info.textContent = 'Übernehmen ist möglich, sobald eine stabile, positive Spannung angezeigt wird.';
  }

  function recordMeasurement() {
    if (!canRecord()) return;
    const lab = state.lab;
    const an = analysis;
    const anode = lab[an.anodeSide];
    const cathode = lab[an.cathodeSide];
    const key = C.comboKey(lab.left, lab.right);
    const U = C.measuredDeltaE(lab.left, lab.right);
    const isCore = anode.c === 0.1 && cathode.c === 0.1 && anode.metal !== cathode.metal;
    if (isCore) {
      const prev = state.gallery[key] || {};
      state.gallery[key] = { U, anode: anode.metal, cathode: cathode.metal, selAnode: prev.selAnode || '', selCathode: prev.selCathode || '' };
    } else {
      state.extra = state.extra.filter((e) => e.key !== key);
      state.extra.push({ key, U, diagram: C.cellDiagram(anode, cathode), anode: anode.metal, cathode: cathode.metal, cA: anode.c, cK: cathode.c, theo: an.deltaE });
    }
    save();
    renderSteps();
    renderRecordButton();
    renderGallery();
    renderTasks();
    renderProgress();
    const dec = anode.metal === cathode.metal ? 3 : 2;
    setStatusOnce('✔ Messwert U = ' + C.fmtNum(U, dec) + ' V in die Versuchsgalerie übernommen. ' + (isCore ? 'Bestimme dort Minus- und Pluspol.' : '(Expertenmessung)'));
  }

  /* ---------- SVG-Versuchsaufbau ---------- */
  function renderApparatus() {
    const lab = state.lab;
    const an = analysis;
    const host = $('#apparatus');
    const beaker = (side, x) => {
      const hc = lab[side];
      const sol = hc.electrolyte ? P[hc.electrolyte].solution.replace(/0\.\d+\)$/, '0.85)') : 'none';
      const metal = hc.metal ? P[hc.metal] : null;
      const ex = x + 58;
      let s = '';
      if (hc.electrolyte) s += `<path d="M${x + 4} 205 H${x + 156} V312 Q${x + 156} 322 ${x + 146} 322 H${x + 14} Q${x + 4} 322 ${x + 4} 312 Z" fill="${sol}"/>`;
      if (metal) s += `<rect x="${ex}" y="112" width="26" height="182" rx="2" fill="${metal.metalColor}" stroke="${metal.metalDark}" stroke-width="1.5"/>
        <text x="${ex + 13}" y="270" class="svg-metal" transform="rotate(-90 ${ex + 13} 270)">${metal.name}</text>`;
      s += `<path d="M${x} 150 V312 Q${x} 326 ${x + 14} 326 H${x + 146} Q${x + 160} 326 ${x + 160} 312 V150" fill="none" stroke="#6f8396" stroke-width="2.5"/>`;
      let lbl = 'leer';
      if (hc.metal || hc.electrolyte) lbl = (hc.metal ? P[hc.metal].id : '?') + ' | ' + (hc.electrolyte ? P[hc.electrolyte].salt : '?') + (hc.electrolyte ? ' (' + C.fmtC(hc.c) + ' M)' : '');
      s += `<text x="${x + 80}" y="344" class="svg-label">${esc(lbl)}</text>`;
      if (an.valid && an.anodeSide) {
        const isA = side === an.anodeSide;
        s += `<circle cx="${ex + 13}" cy="96" r="11" fill="${isA ? '#1756c9' : '#b3261e'}"/><text x="${ex + 13}" y="100.5" class="svg-pole">${isA ? '−' : '+'}</text>`;
      }
      if (an.mismatch[side]) s += `<text x="${x + 80}" y="196" class="svg-warn">⚠ kein konj. Paar</text>`;
      return s;
    };
    let cables = '';
    if (lab.cables) {
      const redLeft = lab.redSide === 'left';
      const colL = redLeft ? '#c62828' : '#222';
      const colR = redLeft ? '#222' : '#c62828';
      if (lab.left.metal) cables += `<path d="M111 112 C111 60 170 70 222 70" fill="none" stroke="${colL}" stroke-width="4" stroke-linecap="round"/>`;
      if (lab.right.metal) cables += `<path d="M411 112 C411 60 350 70 298 70" fill="none" stroke="${colR}" stroke-width="4" stroke-linecap="round"/>`;
    }
    let bridge = '';
    if (lab.bridge !== 'none') {
      const wet = lab.bridge === 'kno3';
      bridge = `<path d="M150 300 V162 Q150 140 172 140 H350 Q372 140 372 162 V300" fill="none" stroke="${wet ? '#d8c58f' : '#f4f0e2'}" stroke-width="14" stroke-linejoin="round"/>
        <path d="M150 300 V162 Q150 140 172 140 H350 Q372 140 372 162 V300" fill="none" stroke="${wet ? '#a89462' : '#cfc7ad'}" stroke-width="1" stroke-dasharray="${wet ? '0' : '4 3'}" transform="translate(0,0)"/>
        <text x="261" y="133" class="svg-small">${wet ? 'Salzbrücke (KNO₃)' : 'Filterpapier (trocken)'}</text>`;
    }
    const isMotor = lab.device === 'motor';
    const redLeft = lab.redSide === 'left';
    const meter = `<rect x="200" y="14" width="120" height="70" rx="9" fill="#f2c230" stroke="#8a6d0b" stroke-width="2"/>
      <rect x="210" y="22" width="100" height="28" rx="4" fill="#c9d8b6"/>
      <text id="svg-display" x="260" y="42" class="svg-lcd">${esc(isMotor ? (lab.cables && an.valid ? C.fmtNum(an.current * 1000, 2) + ' mA' : '0,00 mA') : displayText())}</text>
      <circle cx="222" cy="70" r="5" fill="${redLeft ? '#c62828' : '#222'}"/><circle cx="298" cy="70" r="5" fill="${redLeft ? '#222' : '#c62828'}"/>
      <text x="236" y="73" class="svg-tiny">${redLeft ? (isMotor ? 'mA' : 'V') : 'COM'}</text><text x="284" y="73" class="svg-tiny">${redLeft ? 'COM' : (isMotor ? 'mA' : 'V')}</text>
      ${isMotor ? '<circle cx="345" cy="40" r="15" fill="#e6e9ec" stroke="#555" stroke-width="2"/><text x="345" y="44.5" class="svg-tiny" style="font-size:12px">M</text><line x1="320" y1="40" x2="330" y2="40" stroke="#555" stroke-width="2"/>' : ''}`;
    host.innerHTML = `<svg viewBox="0 0 522 356" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${beaker('left', 50)}${beaker('right', 312)}
      ${bridge}${cables}${meter}
    </svg>`;
    const parts = [];
    parts.push('Links: ' + (lab.left.metal ? name(lab.left.metal) + 'blech' : 'kein Blech') + ' in ' + (lab.left.electrolyte ? P[lab.left.electrolyte].saltName + '-Lösung' : 'keiner Lösung'));
    parts.push('rechts: ' + (lab.right.metal ? name(lab.right.metal) + 'blech' : 'kein Blech') + ' in ' + (lab.right.electrolyte ? P[lab.right.electrolyte].saltName + '-Lösung' : 'keiner Lösung'));
    parts.push(lab.cables ? 'Kabel angeschlossen' : 'Kabel nicht angeschlossen');
    parts.push({ none: 'keine Salzbrücke', dry: 'trockener Filterpapierstreifen', kno3: 'Salzbrücke mit KNO₃' }[lab.bridge]);
    host.setAttribute('aria-label', 'Versuchsaufbau. ' + parts.join(', ') + '.');
  }

  /* ---------- Erklärung „Was passiert gerade?“ ---------- */
  function renderCaption() {
    const lab = state.lab;
    const an = analysis;
    const box = $('#particle-caption');
    let html = '<h3>Was passiert gerade?</h3>';
    if (!an.halfCellsReady) {
      html += '<p>Baue im Labor zuerst zwei Halbzellen auf. Jede Halbzelle besteht aus einem <strong>Elektronenleiter</strong> (Metallblech) in einem <strong>Ionenleiter</strong> (Lösung seiner Metall-Ionen).</p>';
      box.innerHTML = html;
      return;
    }
    for (const side of ['left', 'right']) {
      const m = an.mismatch[side];
      if (m) {
        const hc = lab[side];
        html += '<p class="warn-text"><strong>' + (side === 'left' ? 'Linkes' : 'Rechtes') + ' Becherglas:</strong> ' + esc(m.text) + '</p>';
        if (m.type === 'direct') html += '<p class="eq">' + esc(C.overall(hc.metal, hc.electrolyte)) + '</p>';
      }
    }
    if (!an.conjugate) { box.innerHTML = html; return; }
    const L = lab.left;
    const R = lab.right;
    const EL = C.potential(L.metal, L.c);
    const ER = C.potential(R.metal, R.c);
    const flowing = an.valid && lab.device === 'motor' && an.deltaE > 1e-9;
    if (an.deltaE < 1e-9) {
      html += '<p>Beide Halbzellen sind gleich. An beiden Elektroden bildet sich die gleiche Doppelschicht – es gibt keinen Potenzialunterschied, also keine Spannung.</p>';
      box.innerHTML = html;
      return;
    }
    const A = lab[an.anodeSide];
    const K = lab[an.cathodeSide];
    const EA = C.potential(A.metal, A.c);
    const EK = C.potential(K.metal, K.c);
    if (!flowing) {
      html += '<p><strong>Doppelschichten im Gleichgewicht:</strong> In beiden Halbzellen gehen Metall-Atome als Kationen in Lösung, Elektronen bleiben zurück, und Kationen werden wieder abgeschieden:</p>';
      html += '<p class="eq">' + esc(L.metal) + ' ⇌ ' + esc(P[L.metal].ion) + ' + ' + (P[L.metal].z > 1 ? P[L.metal].z + ' ' : '') + 'e⁻ &nbsp;&nbsp;|&nbsp;&nbsp; ' + esc(R.metal) + ' ⇌ ' + esc(P[R.metal].ion) + ' + ' + (P[R.metal].z > 1 ? P[R.metal].z + ' ' : '') + 'e⁻</p>';
      if (A.metal !== K.metal) {
        html += '<p>' + name(A.metal) + ' ist unedler als ' + name(K.metal) + ': Im ' + name(A.metal) + 'blech bleiben <strong>mehr Elektronen</strong> zurück. Es hat das niedrigere Potenzial und wird zum <strong>Minuspol</strong>.</p>';
      } else {
        html += '<p>In der verdünnteren Lösung gehen mehr Atome in Lösung, bevor sich das Gleichgewicht einstellt (Le Chatelier). Diese Elektrode ist stärker negativ geladen und wird zum <strong>Minuspol</strong> (Konzentrationszelle).</p>';
      }
      if (an.valid) html += '<p>Das Voltmeter ist sehr hochohmig: Es fließt praktisch kein Strom, gemessen wird nur der Potenzialunterschied. <em>Tipp: Schalte auf „Verbraucher“, um die Teilchenwanderung bei Stromfluss zu sehen.</em></p>';
      else if (!lab.cables || !an.bridgeClosed) html += '<p>Der Stromkreis ist offen – die Doppelschichten bleiben im Gleichgewicht, es fließen keine Elektronen.</p>';
    } else {
      html += '<p><strong>Stromfluss:</strong> Die Elektronen fließen im äußeren Stromkreis vom Minuspol zum Pluspol. Dadurch werden die Gleichgewichte an beiden Elektroden gestört:</p>';
      html += '<ul class="compact-list">';
      html += '<li><strong>Anode (Minuspol, ' + name(A.metal) + '):</strong> Oxidation <span class="eq-inline">' + esc(C.oxidation(A.metal)) + '</span></li>';
      html += '<li><strong>Kathode (Pluspol, ' + name(K.metal) + '):</strong> Reduktion <span class="eq-inline">' + esc(C.reduction(K.metal)) + '</span></li>';
      html += '<li><strong>Gesamt:</strong> <span class="eq-inline">' + esc(C.overall(A.metal, K.metal, A.c, K.c)) + '</span></li>';
      html += '<li><strong>Innerer Stromkreis:</strong> NO₃⁻-Ionen der Salzbrücke wandern in den Anodenraum (dort entstehen zusätzliche Kationen), K⁺-Ionen in den Kathodenraum (dort werden Kationen verbraucht) – Ladungsausgleich.</li>';
      html += '</ul>';
    }
    const dec = A.metal === K.metal ? 3 : 2;
    html += '<p class="small-note"><strong>Zelldiagramm:</strong> ' + esc(C.cellDiagram(A, K)) + '</p>';
    html += '<p class="small-note"><strong>Zellspannung:</strong> ΔE = E(Kathode) − E(Anode) = ' + C.fmtNum(EK, dec) + ' V − (' + C.fmtNum(EA, dec) + ' V) = ' + C.fmtNum(EK - EA, dec) + ' V' + (state.ui.expert || A.c !== 1 ? ' <span class="muted">(E nach Nernst: E = E° + 0,059 V / z · lg c)</span>' : '') + '</p>';
    void EL; void ER;
    box.innerHTML = html;
  }

  /* ---------- Wassermodell ---------- */
  function renderWaterModel() {
    const lab = state.lab;
    const an = analysis;
    const host = $('#water-model');
    const yOf = (E) => 22 + ((E + 0.95) / 1.85) * 168; // negatives E oben
    const isConc = an.conjugate && lab.left.metal === lab.right.metal;
    const dec = isConc ? 3 : 2;
    let s = '<svg viewBox="0 0 380 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    s += '<line x1="40" y1="16" x2="40" y2="200" stroke="#9aa8b5"/>';
    s += '<text x="8" y="14" class="svg-tiny" text-anchor="start">E in V</text>';
    for (let E = -0.8; E <= 0.81; E += 0.4) {
      const y = yOf(E);
      s += `<line x1="36" y1="${y}" x2="44" y2="${y}" stroke="#9aa8b5"/><text x="32" y="${y + 3.5}" class="svg-tiny" text-anchor="end">${C.fmtNum(E, 1)}</text>`;
    }
    s += '<text x="52" y="28" class="svg-tiny" text-anchor="start" fill="#1756c9">hoher Elektronendruck (unedel)</text>';
    s += '<text x="52" y="208" class="svg-tiny" text-anchor="start" fill="#b3261e">niedriger Elektronendruck (edel)</text>';
    // Redoxreihe als Hintergrundmarken
    for (const id of C.ORDER) {
      const y = yOf(C.potential(id, 0.1));
      s += `<line x1="44" y1="${y}" x2="360" y2="${y}" stroke="#e3e9ef" stroke-dasharray="3 3"/><text x="372" y="${y + 3.5}" class="svg-tiny" text-anchor="end" fill="#8592a0">${id}</text>`;
    }
    const lake = (side, cx) => {
      const hc = lab[side];
      if (!C.isConjugate(hc)) return '';
      const E = C.potential(hc.metal, hc.c);
      const y = yOf(E);
      const col = P[hc.metal].solution.replace(/0\.\d+\)$/, '0.95)');
      const cLbl = (state.ui.expert || isConc) ? ` (${C.fmtC(hc.c)} M)` : '';
      let r = `<path d="M${cx - 48} ${y} Q${cx} ${y + 26} ${cx + 48} ${y}" fill="${col}" stroke="#4d7ea8" stroke-width="1.5"/>`;
      r += `<path d="M${cx - 60} ${y - 4} L${cx - 48} ${y} M${cx + 48} ${y} L${cx + 60} ${y - 4}" stroke="#6b7b6b" stroke-width="2"/>`;
      r += `<text x="${cx}" y="${y - 8}" class="svg-tiny" font-weight="700">${hc.metal}${cLbl}: E = ${C.fmtNum(E, dec)} V</text>`;
      return r;
    };
    s += lake('left', 130) + lake('right', 280);
    if (an.conjugate && an.deltaE > 1e-9) {
      const yA = yOf(C.potential(lab[an.anodeSide].metal, lab[an.anodeSide].c));
      const yK = yOf(C.potential(lab[an.cathodeSide].metal, lab[an.cathodeSide].c));
      s += `<line x1="205" y1="${yA}" x2="205" y2="${yK}" stroke="#d96b43" stroke-width="2" marker-end="url(#arr)" marker-start="url(#arr)"/>`;
      s += `<text x="212" y="${(yA + yK) / 2 + 4}" class="svg-tiny" text-anchor="start" font-weight="700" fill="#9c381c">ΔE = ${C.fmtNum(an.deltaE, dec)} V</text>`;
      s += '<defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#d96b43"/></marker></defs>';
      const flowing = an.valid && lab.device === 'motor';
      if (flowing) {
        const xA = an.anodeSide === 'left' ? 130 : 280;
        const xK = an.anodeSide === 'left' ? 280 : 130;
        s += `<path d="M${xA} ${yA + 14} Q${(xA + xK) / 2} ${(yA + yK) / 2 - 10} ${xK} ${yK - 14}" fill="none" stroke="#1756c9" stroke-width="2" stroke-dasharray="5 4" class="flow-line"/>`;
        s += `<text x="${(xA + xK) / 2}" y="${(yA + yK) / 2 - 18}" class="svg-tiny" fill="#1756c9" font-weight="700">e⁻ fließen „bergab“</text>`;
      }
    } else {
      s += '<text x="200" y="115" class="svg-tiny">Baue zwei konjugierte Halbzellen auf.</text>';
    }
    s += '</svg>';
    host.innerHTML = s;
  }

  /* =====================================================================
     TEILCHENEBENE – Steuerung
     ===================================================================== */
  function initParticles() {
    const canvas = $('#particle-canvas');
    cellView = new window.GZParticles.CellView(canvas);
    const dl = $('#show-dl');
    const lb = $('#show-labels');
    const sp = $('#sim-speed');
    const pause = $('#sim-pause');
    dl.checked = state.ui.showDL;
    lb.checked = state.ui.labels;
    sp.value = String(state.ui.speed);
    cellView.showDL = dl.checked;
    cellView.labels = lb.checked;
    cellView.speed = Number(sp.value);
    dl.addEventListener('change', () => { state.ui.showDL = dl.checked; cellView.showDL = dl.checked; if (!cellView.running) cellView.draw(); save(); });
    lb.addEventListener('change', () => { state.ui.labels = lb.checked; cellView.labels = lb.checked; if (!cellView.running) cellView.draw(); save(); });
    sp.addEventListener('input', () => { state.ui.speed = Number(sp.value); cellView.speed = state.ui.speed; save(); });
    const syncPause = () => { pause.textContent = cellView.running ? 'Pause' : 'Abspielen'; };
    pause.addEventListener('click', () => { cellView.setRunning(!cellView.running); syncPause(); });
    syncPause();
    cellView.configure(viewConfig());
  }

  /* =====================================================================
     DOPPELSCHICHT-LABOR
     ===================================================================== */
  function initDoubleLayer() {
    const sel = $('#dl-metal');
    const startBtn = $('#dl-start');
    const pauseBtn = $('#dl-pause');
    const status = $('#dl-status');
    let lastEq = false;
    dlView = new window.GZParticles.DoubleLayerView($('#dl-canvas'), $('#dl-chart'), {
      onUpdate(s) {
        $('#dl-q').textContent = String(s.q);
        $('#dl-ions').textContent = String(s.ions);
        const max = 2.4;
        $('#dl-bar-d').style.setProperty('--pct', Math.min(100, (s.rDissolve / max) * 100) + '%');
        $('#dl-bar-r').style.setProperty('--pct', Math.min(100, (s.rDeposit / max) * 100) + '%');
        if (s.eq !== lastEq || !s.eq) {
          lastEq = s.eq;
          const p = P[dlView.metal];
          if (s.eq) {
            status.innerHTML = '<strong>Dynamisches Gleichgewicht erreicht:</strong> Pro Zeiteinheit gehen genauso viele ' + p.id + '-Atome in Lösung, wie ' + p.ion + '-Ionen abgeschieden werden. Die Elektrode trägt ca. ' + s.q + ' überschüssige Elektronen (Modell).';
          } else if (s.started) {
            status.innerHTML = 'Es lösen sich mehr ' + p.id + '-Atome als ' + p.ion + '-Ionen abgeschieden werden. Die Elektrode lädt sich negativ auf, die Kationen sammeln sich vor der Oberfläche …';
          }
        }
      },
      onEquilibrium(metal, q) {
        state.dl[metal] = q;
        save();
        renderDlCompare();
        renderProgress();
      },
    });
    const restoreRuns = () => { /* Verläufe werden nur für die aktuelle Sitzung gezeichnet */ };
    restoreRuns();
    sel.addEventListener('change', () => {
      dlView.reset(sel.value);
      lastEq = false;
      startBtn.textContent = 'Metallblech eintauchen';
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      pauseBtn.textContent = 'Pause';
      status.textContent = 'Tauche das ' + P[sel.value].name + 'blech in die ' + P[sel.value].saltName + '-Lösung.';
      $('#dl-q').textContent = '0';
      $('#dl-ions').textContent = '0';
      $('#dl-bar-d').style.setProperty('--pct', '0%');
      $('#dl-bar-r').style.setProperty('--pct', '0%');
    });
    startBtn.addEventListener('click', () => {
      if (dlView.started) {
        dlView.reset(sel.value);
        lastEq = false;
      }
      dlView.start();
      startBtn.textContent = 'Neu starten';
      pauseBtn.disabled = false;
      pauseBtn.textContent = 'Pause';
    });
    pauseBtn.addEventListener('click', () => {
      if (dlView.running) { dlView.pause(); pauseBtn.textContent = 'Weiter'; }
      else { dlView.start(); pauseBtn.textContent = 'Pause'; }
    });
    renderDlCompare();
  }

  function renderDlCompare() {
    const host = $('#dl-compare-bars');
    const maxQ = 12;
    let html = '';
    for (const id of C.ORDER) {
      const q = state.dl[id];
      const p = P[id];
      const pct = q !== undefined ? (q / maxQ) * 100 : 0;
      html += `<div class="compare-row"><span class="compare-name">${p.name} (${p.id} / ${p.ion})</span>
        <span class="meter-track"><span class="meter-fill" style="--pct:${pct}%; background:${p.metalDark}"></span></span>
        <span class="compare-val">${q !== undefined ? q + ' e⁻' : 'noch offen'}</span></div>`;
    }
    const done = C.ORDER.every((id) => state.dl[id] !== undefined);
    if (done) html += '<p class="feedback ok">✔ Je unedler das Metall, desto mehr Elektronen bleiben im Gleichgewicht im Metall zurück – desto negativer ist das Halbzellenpotenzial. Die Reihenfolge entspricht der Redoxreihe Zn &lt; Fe &lt; Cu &lt; Ag.</p>';
    host.innerHTML = html;
  }

  /* =====================================================================
     VERSUCHSGALERIE
     ===================================================================== */
  function renderGallery() {
    const body = $('#gallery-body');
    const rows = C.coreCombos().map((c) => {
      const g = state.gallery[c.key];
      const pairLabel = `(${c.anode} / ${P[c.anode].ion}) und (${c.cathode} / ${P[c.cathode].ion})`;
      if (!g) {
        return `<tr><th scope="row">${esc(name(c.anode))} / ${esc(name(c.cathode))}<br><span class="muted">${esc(pairLabel)}</span></th>
          <td class="muted">noch nicht gemessen</td><td>—</td><td>—</td>
          <td><button type="button" class="btn btn-ghost btn-sm" data-build="${c.anode},${c.cathode}">Im Labor aufbauen</button></td></tr>`;
      }
      const opts = (sel) => ['<option value="">– wählen –</option>'].concat([c.anode, c.cathode].sort().map((id) => `<option value="${id}" ${sel === id ? 'selected' : ''}>${esc(name(id))}</option>`)).join('');
      const fb = galleryFeedback(g);
      return `<tr data-key="${esc(c.key)}"><th scope="row">${esc(name(c.anode))} / ${esc(name(c.cathode))}<br><span class="muted">${esc(pairLabel)}</span></th>
        <td class="num">${C.fmtNum(g.U, 2)} V</td>
        <td><select data-pole="selAnode" aria-label="Minuspol für ${esc(name(c.anode))}/${esc(name(c.cathode))}">${opts(g.selAnode)}</select></td>
        <td><select data-pole="selCathode" aria-label="Pluspol für ${esc(name(c.anode))}/${esc(name(c.cathode))}">${opts(g.selCathode)}</select></td>
        <td class="feedback ${fb.cls}">${fb.html}</td></tr>`;
    });
    body.innerHTML = rows.join('');
    $$('select[data-pole]', body).forEach((s) => s.addEventListener('change', () => {
      const key = s.closest('tr').dataset.key;
      state.gallery[key][s.dataset.pole] = s.value;
      save();
      renderGallery();
      renderProgress();
    }));
    $$('button[data-build]', body).forEach((b) => b.addEventListener('click', () => {
      const [a, k] = b.dataset.build.split(',');
      if (Math.random() < 0.5) setCell(a, k); else setCell(k, a);
      document.getElementById('labor').scrollIntoView({ behavior: window.GZParticles.reduceMotion ? 'auto' : 'smooth' });
    }));
    // Expertenmessungen
    const ex = $('#extra-measurements');
    if (!state.extra.length) { ex.innerHTML = ''; return; }
    ex.innerHTML = '<h3>Weitere Messungen (Expertenmodus)</h3><div class="table-wrap"><table class="gallery-table"><thead><tr><th scope="col">Zelldiagramm</th><th scope="col">U gemessen</th><th scope="col">ΔE berechnet (Nernst)</th></tr></thead><tbody>' +
      state.extra.map((e) => {
        const dec = e.anode === e.cathode ? 3 : 2;
        return `<tr><td>${esc(e.diagram)}</td><td class="num">${C.fmtNum(e.U, dec)} V</td><td class="num">${C.fmtNum(e.theo, 3)} V</td></tr>`;
      }).join('') + '</tbody></table></div>';
  }

  function galleryFeedback(g) {
    if (!g.selAnode && !g.selCathode) return { cls: '', html: 'Pole bestimmen' };
    if (g.selAnode && g.selAnode === g.selCathode) return { cls: 'bad', html: 'Minus- und Pluspol müssen verschiedene Elektroden sein.' };
    const aOk = g.selAnode === g.anode;
    const kOk = g.selCathode === g.cathode;
    if (aOk && kOk) return { cls: 'ok', html: '✔ richtig: ' + esc(name(g.anode)) + ' ist unedler → Minuspol (Anode).' };
    if (!g.selAnode || !g.selCathode) return { cls: '', html: 'Beide Pole wählen.' };
    return { cls: 'bad', html: '✘ Tipp: Das schwarze Kabel (COM) hing bei positiver Anzeige am Minuspol. Welches Metall ist unedler?' };
  }

  function galleryCorrect(key) {
    const g = state.gallery[key];
    return !!g && g.selAnode === g.anode && g.selCathode === g.cathode;
  }

  /* =====================================================================
     AUSWERTUNG
     ===================================================================== */
  function measuredPairs() {
    const list = [];
    for (const c of C.coreCombos()) {
      const g = state.gallery[c.key];
      if (g) list.push({ key: c.key, anode: g.anode, cathode: g.cathode, U: g.U, label: name(g.anode) + ' / ' + name(g.cathode) + ' (' + C.fmtNum(g.U, 2) + ' V)' });
    }
    return list;
  }

  function renderTasks() {
    // Aufgabe 1: Redoxreihe
    const row = $('#order-row');
    const labels = ['1. (unedelstes)', '2.', '3.', '4. (edelstes)'];
    row.innerHTML = labels.map((l, i) => `<label class="order-slot">${l}<select data-order="${i}"><option value="">– wählen –</option>${C.ORDER.slice().sort().map((id) => `<option value="${id}" ${state.tasks.order[i] === id ? 'selected' : ''}>${esc(C.redoxPair(id))}</option>`).join('')}</select></label>`).join('<span class="order-arrow" aria-hidden="true">→</span>');
    $$('select[data-order]', row).forEach((s) => s.addEventListener('change', () => {
      state.tasks.order[Number(s.dataset.order)] = s.value;
      state.tasks.orderOk = false;
      save();
    }));
    if (state.tasks.orderOk) setFeedback('order', true, '✔ Richtig! Redoxreihe: Zn < Fe < Cu < Ag. Je weiter links, desto leichter gibt das Metall Elektronen ab (Reduktionsmittel) und desto negativer ist das Potenzial.');

    // Aufgabe 2: Additivität
    const keyZC = C.comboKey({ metal: 'Zn', c: 0.1 }, { metal: 'Cu', c: 0.1 });
    const keyCA = C.comboKey({ metal: 'Cu', c: 0.1 }, { metal: 'Ag', c: 0.1 });
    const keyZA = C.comboKey({ metal: 'Zn', c: 0.1 }, { metal: 'Ag', c: 0.1 });
    const gZC = state.gallery[keyZC];
    const gCA = state.gallery[keyCA];
    const gZA = state.gallery[keyZA];
    const txt = $('#additiv-text');
    if (gZC && gCA) {
      txt.innerHTML = 'Deine Messwerte: ΔE(Zn/Cu) = <strong>' + C.fmtNum(gZC.U, 2) + ' V</strong>, ΔE(Cu/Ag) = <strong>' + C.fmtNum(gCA.U, 2) + ' V</strong>. Berechne die Summe und vergleiche sie mit ΔE(Zn/Ag)' + (gZA ? ' = <strong>' + C.fmtNum(gZA.U, 2) + ' V</strong>' : ' (noch nicht gemessen)') + '.';
    } else {
      txt.textContent = 'Miss zuerst die Zellen Zink/Kupfer und Kupfer/Silber (und zum Vergleich Zink/Silber).';
    }
    const inp = $('#additiv-input');
    inp.value = state.tasks.additiv;
    inp.disabled = !(gZC && gCA);
    if (state.tasks.additivOk) checkAdditiv(true);

    // Aufgabe 3: Satzbausteine
    const sc = $('#sentence-cell');
    const pairs = measuredPairs();
    sc.innerHTML = pairs.length ? pairs.map((p) => `<option value="${esc(p.key)}" ${state.tasks.sentenceCell === p.key ? 'selected' : ''}>${esc(p.label)}</option>`).join('') : '<option value="">– zuerst eine Zelle messen –</option>';
    sc.disabled = !pairs.length;
    if (pairs.length && !pairs.some((p) => p.key === state.tasks.sentenceCell)) state.tasks.sentenceCell = pairs[0].key;
    renderSentences();
    if (state.tasks.sentencesOk) setFeedback('sentences', true, '✔ Alle Satzbausteine sind fachlich korrekt ergänzt. Übertrage die Sätze in dein Protokoll!');

    $('#dl-notes').value = state.tasks.dlNotes;
  }

  function sentenceModel() {
    const key = state.tasks.sentenceCell;
    const g = state.gallery[key];
    if (!g) return null;
    const metals = C.ORDER.map((id) => ({ v: id, t: name(id) }));
    const A = g.anode;
    const B = g.cathode;
    const uOpts = [g.U, Math.abs(C.potential(A)), Math.abs(C.potential(B))]
      .map((u) => Math.round(u * 100) / 100)
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .sort((x, y) => x - y)
      .map((u) => ({ v: String(u), t: C.fmtNum(u, 2) }));
    const gap = (id, options, correct) => ({ id, options, correct });
    return {
      A, B,
      parts: [
        ['„Da ', gap('s1a', metals, A), ' unedler ist als ', gap('s1b', metals, B), ', besitzt die ', name(A), '-Halbzelle das ', gap('s1c', [{ v: 'n', t: 'niedrigere' }, { v: 'h', t: 'höhere' }], 'n'), ' elektrische Potenzial und bildet in dieser Kombination die ', gap('s1d', [{ v: 'A', t: 'Anode' }, { v: 'K', t: 'Kathode' }], 'A'), ' (den ', gap('s1e', [{ v: 'm', t: 'Minuspol' }, { v: 'p', t: 'Pluspol' }], 'm'), ').“'],
        ['„Zwischen der ' + name(A) + '-Halbzelle und der ' + name(B) + '-Halbzelle besteht ein ', gap('s2a', [{ v: 'pu', t: 'Potenzialunterschied' }, { v: 'st', t: 'Stromfluss' }, { v: 'wi', t: 'Widerstand' }], 'pu'), ', den wir als elektrische Spannung (Zellspannung U bzw. ΔE) von ', gap('s2b', uOpts, String(Math.round(g.U * 100) / 100)), ' V messen.“'],
        ['„Im äußeren Stromkreis fließen die ', gap('s3a', [{ v: 'e', t: 'Elektronen' }, { v: 'i', t: 'Ionen' }], 'e'), ' durch das Kabel von der ', gap('s3b', [{ v: 'A', t: 'Anode' }, { v: 'K', t: 'Kathode' }], 'A'), ' zur ', gap('s3c', [{ v: 'A', t: 'Anode' }, { v: 'K', t: 'Kathode' }], 'K'), ', während im inneren Stromkreis ', gap('s3d', [{ v: 'i', t: 'Ionen' }, { v: 'e', t: 'Elektronen' }], 'i'), ' durch die Salzbrücke wandern, um den ', gap('s3e', [{ v: 'l', t: 'Ladungsausgleich' }, { v: 'p', t: 'Potenzialunterschied' }], 'l'), ' sicherzustellen.“'],
      ],
    };
  }

  function renderSentences() {
    const area = $('#sentence-area');
    const m = sentenceModel();
    if (!m) { area.innerHTML = '<p class="muted">Sobald du eine Zelle in der Versuchsgalerie dokumentiert hast, erscheinen hier die Satzbausteine.</p>'; return; }
    const vals = state.tasks.sentences[state.tasks.sentenceCell] || {};
    area.innerHTML = m.parts.map((parts) => '<p class="sentence">' + parts.map((p) => {
      if (typeof p === 'string') return esc(p);
      const opts = ['<option value="">…</option>'].concat(p.options.map((o) => `<option value="${esc(o.v)}" ${vals[p.id] === o.v ? 'selected' : ''}>${esc(o.t)}</option>`)).join('');
      return `<select class="gap" data-gap="${p.id}" aria-label="Lücke">${opts}</select>`;
    }).join('') + '</p>').join('');
    $$('select[data-gap]', area).forEach((s) => s.addEventListener('change', () => {
      const k = state.tasks.sentenceCell;
      state.tasks.sentences[k] = state.tasks.sentences[k] || {};
      state.tasks.sentences[k][s.dataset.gap] = s.value;
      state.tasks.sentencesOk = false;
      s.classList.remove('gap-ok', 'gap-bad');
      save();
    }));
  }

  function setFeedback(id, ok, html) {
    const el = $('#fb-' + id);
    el.className = 'feedback ' + (ok === null ? '' : ok ? 'ok' : 'bad');
    el.innerHTML = html;
  }

  function checkOrder() {
    const o = state.tasks.order;
    if (o.some((x) => !x)) { setFeedback('order', false, 'Wähle für alle vier Positionen ein Redoxpaar.'); return; }
    const ok = o.every((x, i) => x === C.ORDER[i]);
    state.tasks.orderOk = ok;
    if (ok) setFeedback('order', true, '✔ Richtig! Redoxreihe: Zn < Fe < Cu < Ag. Je weiter links, desto leichter gibt das Metall Elektronen ab (Reduktionsmittel) und desto negativer ist das Potenzial.');
    else {
      const wrong = o.map((x, i) => (x === C.ORDER[i] ? null : i + 1)).filter(Boolean);
      setFeedback('order', false, '✘ Position ' + wrong.join(', ') + ' stimmt noch nicht. Tipp: Das Metall, das in allen seinen Zellen Minuspol war, ist am unedelsten.');
    }
    save();
    renderProgress();
  }

  function parseNum(s) {
    const v = parseFloat(String(s).replace(',', '.').replace('−', '-').replace(/[^\d.\-]/g, ''));
    return Number.isFinite(v) ? v : null;
  }

  function checkAdditiv(silent) {
    const keyZC = C.comboKey({ metal: 'Zn', c: 0.1 }, { metal: 'Cu', c: 0.1 });
    const keyCA = C.comboKey({ metal: 'Cu', c: 0.1 }, { metal: 'Ag', c: 0.1 });
    const keyZA = C.comboKey({ metal: 'Zn', c: 0.1 }, { metal: 'Ag', c: 0.1 });
    const gZC = state.gallery[keyZC];
    const gCA = state.gallery[keyCA];
    const gZA = state.gallery[keyZA];
    if (!gZC || !gCA) { setFeedback('additiv', false, 'Miss zuerst Zn/Cu und Cu/Ag.'); return; }
    const sum = Math.round((gZC.U + gCA.U) * 100) / 100;
    const v = parseNum(state.tasks.additiv);
    if (v === null) { setFeedback('additiv', false, 'Gib einen Zahlenwert in V ein (z. B. 1,53).'); return; }
    const ok = Math.abs(v - sum) <= 0.011;
    state.tasks.additivOk = ok;
    if (ok) {
      let html = '✔ Richtig: ' + C.fmtNum(gZC.U, 2) + ' V + ' + C.fmtNum(gCA.U, 2) + ' V = ' + C.fmtNum(sum, 2) + ' V.';
      if (gZA) html += ' Gemessen wurde ΔE(Zn/Ag) = ' + C.fmtNum(gZA.U, 2) + ' V (Abweichung ' + C.fmtNum(Math.abs(gZA.U - sum), 2) + ' V im Rahmen der Messgenauigkeit). Zellspannungen addieren sich, weil sie Potenzialdifferenzen sind – wie Höhenunterschiede im Wassermodell.';
      else html += ' Miss nun auch Zn/Ag zum Vergleich!';
      setFeedback('additiv', true, html);
    } else if (!silent) {
      setFeedback('additiv', false, '✘ Addiere die beiden Messwerte: ΔE(Zn/Cu) + ΔE(Cu/Ag).');
    }
    save();
    renderProgress();
  }

  function checkSentences() {
    const m = sentenceModel();
    if (!m) { setFeedback('sentences', false, 'Dokumentiere zuerst eine Zelle.'); return; }
    const vals = state.tasks.sentences[state.tasks.sentenceCell] || {};
    let all = true;
    let wrong = 0;
    m.parts.flat().forEach((p) => {
      if (typeof p === 'string') return;
      const sel = $(`select[data-gap="${p.id}"]`);
      const ok = vals[p.id] === p.correct;
      if (!ok) { all = false; wrong++; }
      sel.classList.toggle('gap-ok', ok);
      sel.classList.toggle('gap-bad', !ok);
    });
    state.tasks.sentencesOk = all;
    if (all) setFeedback('sentences', true, '✔ Alle Satzbausteine sind fachlich korrekt ergänzt. Übertrage die Sätze in dein Protokoll!');
    else setFeedback('sentences', false, '✘ ' + wrong + ' Lücke(n) noch nicht korrekt (rot markiert). Tipp: Der Minuspol ist die Anode – dort findet die Oxidation statt (AnOx).');
    save();
    renderProgress();
  }

  /* =====================================================================
     FACHSPRACHEN-BOX
     ===================================================================== */
  const GLOSSARY_1 = [
    { term: 'Halbzelle', text: 'Ein Teilsystem einer galvanischen Zelle, bestehend aus einem Elektronenleiter (Metallblech), der in einen Ionenleiter (Salzlösung mit den passenden Metall-Ionen) eintaucht. Beispiel: Zinkblech in Zinksulfat-Lösung (Zn / Zn²⁺).', short: 'Metallblech, das in die Lösung seiner eigenen Metall-Ionen eintaucht.' },
    { term: 'Konjugiertes Redoxpaar (korrespondierendes Paar)', text: 'Zwei Teilchensorten desselben Elements, die durch Elektronenabgabe (Oxidation) oder Elektronenaufnahme (Reduktion) ineinander übergehen: Red ⇌ Ox + z e⁻ (z. B. das Paar Zn / Zn²⁺ oder Cu / Cu²⁺ in einer Halbzelle).', short: 'Zwei Teilchen desselben Elements, die durch Elektronenübergang ineinander übergehen.' },
    { term: 'Elektrochemische Doppelschicht', text: 'Grenzschicht an der Elektrodenoberfläche: Gehen Metall-Atome als Kationen in Lösung, bleiben Elektronen im Metall zurück. Die negativ geladene Elektrode und die angelagerten Kationen im Elektrolyten bilden ein dynamisches Gleichgewicht und erzeugen das Halbzellenpotenzial.', short: 'Grenzschicht aus negativ geladener Elektrode und angelagerten Kationen.' },
    { term: 'Elektrode (Elektronenleiter)', text: 'Das feste Metallblech (oder ein Graphitstab) in einer Halbzelle. An ihrer Oberfläche findet die Elektronenübergabe statt; im Metall bewegen sich frei bewegliche Elektronen (e⁻).', short: 'Festes Metallblech, an dessen Oberfläche die Elektronenübergabe stattfindet.' },
    { term: 'Elektrolyt (Ionenleiter)', text: 'Eine wässrige Salzlösung, die frei bewegliche, elektrisch geladene Teilchen (Kationen und Anionen) enthält und dadurch den elektrischen Strom über Ionenwanderung leitet.', short: 'Salzlösung, die den Strom durch wandernde Ionen leitet.' },
    { term: 'Anode (hier: Minuspol)', text: 'Die Elektrode, an der die Oxidation (Elektronenabgabe) abläuft. In einer galvanischen Zelle ist dies immer das unedlere Metall (Eselsbrücke: AnOx). Durch die frei werdenden Elektronen entsteht hier ein Elektronenüberschuss (Minuspol).', short: 'Elektrode, an der die Oxidation abläuft (unedleres Metall).' },
    { term: 'Kathode (hier: Pluspol)', text: 'Die Elektrode, an der die Reduktion (Elektronenaufnahme) abläuft. In einer galvanischen Zelle ist dies immer das edlere Metall (Eselsbrücke: KRed). Da Kationen hier Elektronen aufnehmen, herrscht Elektronenmangel (Pluspol).', short: 'Elektrode, an der die Reduktion abläuft (edleres Metall).' },
    { term: 'Salzbrücke (Ionenbrücke / Diaphragma)', text: 'Leitende Verbindung zwischen beiden Halbzellen (z. B. ein mit KNO₃-Lösung getränkter Filterpapierstreifen). Sie trennt die Halbzellen räumlich, ermöglicht aber die Wanderung von Ionen zum Ladungsausgleich.', short: 'Verbindet die Halbzellen und ermöglicht Ionenwanderung zum Ladungsausgleich.' },
  ];
  const GLOSSARY_2 = [
    { term: 'Elektrisches Potenzial & Redoxpotenzial (E in V)', text: 'Maß für den „Elektronendruck“ an der elektrochemischen Doppelschicht einer Halbzelle (Redoxpotenzial eines Redoxpaares). Unedle Paare geben leicht Elektronen ab (negatives Potenzial), edle Paare ungern (positives Potenzial). Einzeln nicht messbar!', water: 'Die Meereshöhe eines einzelnen Bergsees (z. B. 800 m ü. NN).', short: 'Maß für den „Elektronendruck“ einer Halbzelle – einzeln nicht messbar.' },
    { term: 'Elektrische Spannung & Zellspannung (U bzw. ΔE in V)', text: 'Der Potenzialunterschied zwischen zwei verbundenen Halbzellen (Zellspannung ΔE = E(Kathode) − E(Anode)). Sie ist die Triebkraft, die Elektronen vom Minuspol zum Pluspol drückt.', water: 'Der Höhenunterschied (das Gefälle) zwischen einem oberen und unteren See.', short: 'Potenzialunterschied zwischen zwei Halbzellen: ΔE = E(Kathode) − E(Anode).' },
    { term: 'Elektrische Stromstärke (I in A)', text: 'Die Menge an elektrischer Ladung (Anzahl der Elektronen im Kabel bzw. Ionen in der Lösung), die pro Sekunde durch den Querschnitt des Leiters fließt.', water: 'Die Wassermenge pro Sekunde (Liter/s), die durch die Rohrleitung strömt.', short: 'Ladung, die pro Sekunde durch den Leiterquerschnitt fließt.' },
    { term: 'Elektrischer Widerstand (R in Ω)', text: 'Maß dafür, wie stark der Fluss der Ladungsträger im Kabel, am Messgerät oder in den Poren der Salzbrücke abgebremst bzw. behindert wird.', water: 'Eine Engstelle oder Steine im Rohr, die den Wasserstrom abbremsen.', short: 'Maß dafür, wie stark der Ladungsfluss behindert wird.' },
    { term: 'Geschlossener Stromkreis', text: 'Dauerstrom fließt nur im geschlossenen Kreis aus zwei Teilen: 1. Äußerer Kreis (Elektronen fließen durchs Metallkabel) und 2. Innerer Kreis (Ionen wandern durch Elektrolyt & Salzbrücke).', water: 'Geschlossener Wasserkreislauf mit Pumpe und Rücklauf; wird ein Rohr abgeklemmt, stoppt alles.', short: 'Äußerer Kreis (Elektronen im Kabel) + innerer Kreis (Ionen in Lösung und Salzbrücke).' },
    { term: 'Konzentrationszelle (Konzentrationskette)', text: 'Eine galvanische Zelle aus zwei Halbzellen desselben Redoxpaares mit unterschiedlichen Ionenkonzentrationen (z. B. Ag | AgNO₃ (c₁) ‖ AgNO₃ (c₂) | Ag). Die verdünntere Halbzelle c₁ bildet die Anode (Minuspol); das Standardpotenzial E° fällt bei der Differenzbildung heraus.', short: 'Galvanische Zelle aus zwei gleichen Halbzellen mit unterschiedlicher Ionenkonzentration.' },
    { term: 'Nernst-Gleichung', text: 'Beschreibt die Konzentrationsabhängigkeit des Elektrodenpotenzials: E = E° + (0,059 V / z) · lg c(M^z+) bei 25 °C. Für Konzentrationszellen desselben Metalls vereinfacht sie sich durch Wegfall von E° zu U = ΔE = (0,059 V / z) · lg(c₂ / c₁) (mit c₂ > c₁).', short: 'Formel zur Berechnung des Halbzellenpotenzials in Abhängigkeit von der Ionenkonzentration.' },
  ];

  function renderGlossary() {
    const card = (g) => `<details class="gloss-item"><summary>${esc(g.term)}</summary><p>${esc(g.text)}</p>${g.water ? `<p class="water-hint"><strong>Wassermodell:</strong> ${esc(g.water)}</p>` : ''}</details>`;
    $('#glossary-1').innerHTML = GLOSSARY_1.map(card).join('');
    $('#glossary-2').innerHTML = GLOSSARY_2.map(card).join('');
  }

  const MATCH_ITEMS = GLOSSARY_1.concat(GLOSSARY_2).map((g, i) => ({ id: 'm' + i, term: g.term.replace(/\s*\(.*\)$/, ''), short: g.short }));
  // feste, „zufällig“ wirkende Reihenfolge der Erklärungen
  const MATCH_OPTIONS = MATCH_ITEMS.map((m, i) => ({ m, k: (i * 7 + 3) % MATCH_ITEMS.length })).sort((a, b) => a.k - b.k).map((x) => x.m);

  function renderMatch() {
    const area = $('#match-area');
    area.innerHTML = MATCH_ITEMS.map((m) => `<div class="match-row"><span class="match-term">${esc(m.term)}</span>
      <select data-match="${m.id}" aria-label="Erklärung für ${esc(m.term)}"><option value="">– Erklärung wählen –</option>${MATCH_OPTIONS.map((o) => `<option value="${o.id}" ${state.tasks.match[m.id] === o.id ? 'selected' : ''}>${esc(o.short)}</option>`).join('')}</select></div>`).join('');
    $$('select[data-match]', area).forEach((s) => s.addEventListener('change', () => {
      state.tasks.match[s.dataset.match] = s.value;
      state.tasks.matchOk = false;
      s.classList.remove('gap-ok', 'gap-bad');
      save();
    }));
    if (state.tasks.matchOk) setFeedback('match', true, '✔ Alle ' + MATCH_ITEMS.length + ' Fachbegriffe richtig zugeordnet!');
  }

  function checkMatch() {
    let right = 0;
    MATCH_ITEMS.forEach((m) => {
      const sel = $(`select[data-match="${m.id}"]`);
      const ok = state.tasks.match[m.id] === m.id;
      if (ok) right++;
      sel.classList.toggle('gap-ok', ok);
      sel.classList.toggle('gap-bad', !ok);
    });
    state.tasks.matchOk = right === MATCH_ITEMS.length;
    setFeedback('match', state.tasks.matchOk, state.tasks.matchOk ? '✔ Alle ' + MATCH_ITEMS.length + ' Fachbegriffe richtig zugeordnet!' : right + ' von ' + MATCH_ITEMS.length + ' richtig. Die falschen Zuordnungen sind rot markiert – schlage in der Fachsprachen-Box unten nach.');
    save();
    renderProgress();
  }

  /* =====================================================================
     NERNST-GLEICHUNG (SILBER-KONZENTRATIONSZELLEN)
     ===================================================================== */
  function nernstMeasuredCombos() {
    const list = [];
    for (const combo of C.SILVER_CELL_COMBOS) {
      const m = state.nernst.measured[combo.id];
      if (m) list.push(Object.assign({}, combo, m));
    }
    return list;
  }

  function openInMainLab(metal, cLeft, cRight) {
    state.ui.expert = true;
    $('#expert-mode').checked = true;
    state.lab.left = { metal, electrolyte: metal, c: cLeft };
    state.lab.right = { metal, electrolyte: metal, c: cRight };
    state.lab.cables = true;
    state.lab.redSide = cLeft > cRight ? 'left' : 'right';
    state.lab.bridge = 'kno3';
    state.lab.device = 'voltmeter';
    onLabChange();
    const target = document.getElementById('labor');
    if (target) {
      target.scrollIntoView({ behavior: window.GZParticles && window.GZParticles.reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function renderNernstApparatus() {
    const cL = state.nernst.cLeft;
    const cR = state.nernst.cRight;
    const pt = C.concentrationCellPair('Ag', cL, cR);
    const host = $('#nernst-apparatus');
    const count = nernstMeasuredCombos().length;
    const badge = $('#nernst-badge');
    badge.textContent = count + ' / ' + C.SILVER_CELL_COMBOS.length + ' gemessen';
    badge.className = 'badge' + (count === C.SILVER_CELL_COMBOS.length ? ' is-done' : count >= 2 ? ' is-ready' : '');

    // Ionendichte links und rechts symbolisch und symmetrisch (ohne Elektroden-Überlappung)
    const nDotsMap = { '1': 16, '0.1': 11, '0.01': 6, '0.001': 2 };
    const nLeft = nDotsMap[String(cL)] || 6;
    const nRight = nDotsMap[String(cR)] || 6;
    const dotCoords = [
      [120, 175], [142, 198], [164, 172], [126, 212], [154, 216],
      [176, 194], [116, 192], [138, 166], [168, 214], [182, 176],
      [148, 184], [128, 184], [174, 206], [158, 198], [146, 206], [160, 184],
    ];
    let leftDots = '';
    for (let i = 0; i < nLeft; i++) {
      const [dx, dy] = dotCoords[i];
      leftDots += `<circle cx="${dx}" cy="${dy}" r="3.4" fill="#9aa3ae" stroke="#5e6873" stroke-width="0.8"/>`;
    }
    let rightDots = '';
    for (let i = 0; i < nRight; i++) {
      const [dx, dy] = dotCoords[i];
      rightDots += `<circle cx="${498 - dx}" cy="${dy}" r="3.4" fill="#9aa3ae" stroke="#5e6873" stroke-width="0.8"/>`;
    }

    const leftAnode = pt.anodeSide === 'left';
    const rightAnode = pt.anodeSide === 'right';
    const colLeft = rightAnode ? '#c62828' : '#222';
    const colRight = rightAnode ? '#222' : '#c62828';
    const poleLeft = pt.anodeSide ? `<circle cx="93" cy="69" r="10" fill="${leftAnode ? '#1756c9' : '#b3261e'}"/><text x="93" y="73.5" class="svg-pole">${leftAnode ? '−' : '+'}</text>` : '';
    const poleRight = pt.anodeSide ? `<circle cx="405" cy="69" r="10" fill="${rightAnode ? '#1756c9' : '#b3261e'}"/><text x="405" y="73.5" class="svg-pole">${rightAnode ? '−' : '+'}</text>` : '';
    const title = `Silber-Konzentrationszelle: Links ${C.fmtC(cL)} mol/L, rechts ${C.fmtC(cR)} mol/L, Spannung ${C.fmtNum(pt.U, 3)} V`;

    host.innerHTML = `<svg role="img" viewBox="0 0 500 268" xmlns="http://www.w3.org/2000/svg" aria-label="${esc(title)}">
      <title>${esc(title)}</title>
      <!-- Becher links -->
      <path d="M54 146 H194 V224 Q194 232 186 232 H62 Q54 232 54 224 Z" fill="rgba(234, 238, 242, 0.72)"/>
      <path d="M50 108 V224 Q50 236 62 236 H186 Q198 236 198 224 V108" fill="none" stroke="#6f8396" stroke-width="2.2"/>
      <rect x="82" y="84" width="22" height="134" rx="2" fill="#d3d8de" stroke="#959ca5" stroke-width="1.5"/>
      <text x="93" y="198" class="svg-metal" transform="rotate(-90 93 198)">Silber</text>
      ${leftDots}
      <text x="124" y="254" class="svg-label">Ag | AgNO₃ (${esc(C.fmtC(cL))} M)</text>
      ${poleLeft}
      <!-- Becher rechts -->
      <path d="M304 146 H444 V224 Q444 232 436 232 H312 Q304 232 304 224 Z" fill="rgba(226, 232, 238, 0.80)"/>
      <path d="M300 108 V224 Q300 236 312 236 H436 Q448 236 448 224 V108" fill="none" stroke="#6f8396" stroke-width="2.2"/>
      <rect x="394" y="84" width="22" height="134" rx="2" fill="#d3d8de" stroke="#959ca5" stroke-width="1.5"/>
      <text x="405" y="198" class="svg-metal" transform="rotate(-90 405 198)">Silber</text>
      ${rightDots}
      <text x="374" y="254" class="svg-label">Ag | AgNO₃ (${esc(C.fmtC(cR))} M)</text>
      ${poleRight}
      <!-- Salzbrücke -->
      <path d="M174 214 V120 Q174 102 192 102 H308 Q326 102 326 120 V214" fill="none" stroke="#d8c58f" stroke-width="12" stroke-linejoin="round"/>
      <text x="250" y="94" class="svg-small">Salzbrücke (KNO₃)</text>
      <!-- Kabel -->
      <path d="M93 84 C93 48 150 56 212 56" fill="none" stroke="${colLeft}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M405 84 C405 48 350 56 288 56" fill="none" stroke="${colRight}" stroke-width="3.5" stroke-linecap="round"/>
      <!-- Voltmeter -->
      <rect x="192" y="10" width="116" height="60" rx="8" fill="#f2c230" stroke="#8a6d0b" stroke-width="2"/>
      <rect x="202" y="17" width="96" height="25" rx="4" fill="#c9d8b6"/>
      <text x="250" y="35" class="svg-lcd">${esc(C.fmtNum(pt.U, 3))} V</text>
      <circle cx="212" cy="56" r="4.5" fill="${colLeft}"/><circle cx="288" cy="56" r="4.5" fill="${colRight}"/>
      <text x="227" y="59" class="svg-tiny">${rightAnode ? 'V' : 'COM'}</text><text x="276" y="59" class="svg-tiny">${rightAnode ? 'COM' : 'V'}</text>
    </svg>`;

    $('#nernst-u').textContent = C.fmtNum(pt.U, 3) + ' V';
    $('#nernst-ratio').textContent = pt.anodeSide
      ? C.fmtNum(pt.ratio, 0) + ' : 1 (lg = ' + C.fmtNum(pt.logRatio, 0) + ')'
      : '1 : 1 (lg = 0)';
    $('#nernst-role').textContent = pt.anodeSide === 'left'
      ? 'Links Anode (−) · Rechts Kathode (+)'
      : pt.anodeSide === 'right'
        ? 'Rechts Anode (−) · Links Kathode (+)'
        : 'gleich (U = 0 V)';
  }

  function renderNernstTable() {
    const body = $('#nernst-table-body');
    const curPair = C.concentrationCellPair('Ag', state.nernst.cLeft, state.nernst.cRight);
    const rows = C.SILVER_CELL_COMBOS.map((combo) => {
      const pt = C.concentrationCellPair('Ag', combo.c1, combo.c2);
      const saved = state.nernst.measured[combo.id];
      const isActive = curPair.comboId === combo.id;
      const factorStr = saved
        ? (saved.factorX !== null ? C.fmtNum(saved.factorX, 3) + ' V' : '— (lg = 0)')
        : '<span class="muted">—</span>';
      return `<tr class="${isActive ? 'is-active' : ''}">
        <th scope="row">${esc(combo.label)}</th>
        <td class="num">${esc(C.fmtNum(pt.ratio, 0))} : 1</td>
        <td class="num">${esc(C.fmtNum(pt.logRatio, 0))}</td>
        <td class="num">${saved ? esc(C.fmtNum(saved.U, 3)) + ' V' : '<span class="muted">noch offen</span>'}</td>
        <td class="num">${factorStr}</td>
        <td><button type="button" class="btn btn-ghost btn-sm" data-nernst-combo="${esc(combo.id)}">${saved ? 'Anzeigen' : 'Wählen & messen'}</button></td>
      </tr>`;
    });
    body.innerHTML = rows.join('');
    $$('button[data-nernst-combo]', body).forEach((btn) => {
      btn.addEventListener('click', () => {
        const combo = C.SILVER_CELL_COMBOS.find((c) => c.id === btn.dataset.nernstCombo);
        if (!combo) return;
        state.nernst.cLeft = combo.c1;
        state.nernst.cRight = combo.c2;
        const radL = $(`input[name="nernst-c-left"][value="${String(combo.c1)}"]`);
        const radR = $(`input[name="nernst-c-right"][value="${String(combo.c2)}"]`);
        if (radL) radL.checked = true;
        if (radR) radR.checked = true;
        if (!state.nernst.measured[combo.id]) {
          recordNernstPair(combo.c1, combo.c2);
        } else {
          save();
          renderNernstApparatus();
          renderNernstTable();
          renderNernstCharts();
        }
      });
    });
  }

  function recordNernstPair(cL, cR) {
    const pt = C.concentrationCellPair('Ag', cL, cR);
    state.nernst.measured[pt.comboId] = {
      c1: pt.c1,
      c2: pt.c2,
      ratio: pt.ratio,
      logRatio: pt.logRatio,
      U: pt.U,
      factorX: pt.factorX,
    };
    save();
    renderNernstApparatus();
    renderNernstTable();
    renderNernstCharts();
    renderProgress();
    const count = nernstMeasuredCombos().length;
    $('#nernst-status').textContent = '✔ Messung ' + C.fmtC(pt.c1) + ' M ‖ ' + C.fmtC(pt.c2) + ' M (c₂ / c₁ = ' + C.fmtNum(pt.ratio, 0) + ', U = ' + C.fmtNum(pt.U, 3) + ' V) übernommen (' + count + ' / ' + C.SILVER_CELL_COMBOS.length + ').';
  }

  function renderNernstCharts() {
    const measured = nernstMeasuredCombos();
    const curComboId = C.concentrationCellPair('Ag', state.nernst.cLeft, state.nernst.cRight).comboId;
    const showFit = state.nernst.showFit;
    const showCu = state.nernst.showCuCompare;

    // --- Diagramm A: U gegen lineares Verhältnis c2 / c1 ---
    const hostA = $('#nernst-chart-linear');
    {
      const W = 420, H = 265, x0 = 62, x1 = 398, y0 = 218, y1 = 20;
      const xPx = (r) => x0 + (r / 1050) * (x1 - x0);
      const yPx = (u) => y0 - ((u + 0.01) / 0.215) * (y0 - y1);
      let s = `<svg role="img" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="Diagramm A: Zellspannung U gegen lineares Konzentrationsverhältnis c2 zu c1">`;
      s += '<title>Zellspannung U gegen lineares Konzentrationsverhältnis c₂ / c₁</title>';
      for (let u = 0; u <= 0.201; u += 0.05) {
        const y = yPx(u);
        s += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${Math.abs(u) < 1e-6 ? '#b8c6d4' : '#e7edf2'}"/>`;
        s += `<line x1="${x0 - 4}" y1="${y}" x2="${x0}" y2="${y}" stroke="#7f91a3"/>`;
        s += `<text x="${x0 - 8}" y="${y + 3.5}" class="svg-tiny" text-anchor="end">${esc(C.fmtNum(u, 2))}</text>`;
      }
      for (let r = 0; r <= 1001; r += 200) {
        const x = xPx(r);
        s += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y0}" stroke="#eef2f6"/>`;
        s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + 4}" stroke="#7f91a3"/>`;
        s += `<text x="${x}" y="${y0 + 16}" class="svg-tiny" text-anchor="middle">${esc(C.fmtNum(r, 0))}</text>`;
      }
      s += `<line x1="${x0}" y1="${y1}" x2="${x0}" y2="${y0}" stroke="#516170" stroke-width="1.5"/>`;
      s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="#516170" stroke-width="1.5"/>`;
      s += `<text x="${(x0 + x1) / 2}" y="${H - 8}" class="svg-tiny" font-weight="700" text-anchor="middle">Konzentrationsverhältnis c₂ / c₁</text>`;
      s += `<text x="16" y="${(y0 + y1) / 2}" class="svg-tiny" font-weight="700" text-anchor="middle" transform="rotate(-90 16 ${(y0 + y1) / 2})">Spannung U = ΔE in V</text>`;

      if (measured.length >= 2) {
        let pathD = '';
        for (let i = 0; i <= 50; i++) {
          const lg = (3 * i) / 50;
          const r = Math.pow(10, lg);
          const u = C.NERNST * lg;
          pathD += (i === 0 ? 'M' : 'L') + xPx(r).toFixed(1) + ' ' + yPx(u).toFixed(1) + ' ';
        }
        s += `<path d="${pathD}" fill="none" stroke="#85a8c4" stroke-width="1.8" stroke-dasharray="5 4"/>`;
      }

      for (const m of measured) {
        const cx = xPx(m.ratio);
        const cy = yPx(m.U);
        const sel = m.comboId === curComboId;
        if (sel) s += `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="#d96b43" stroke-width="2"/>`;
        s += `<circle cx="${cx}" cy="${cy}" r="4.8" fill="#006699" stroke="#fff" stroke-width="1.2"><title>${esc(m.label)}: c₂/c₁ = ${esc(C.fmtNum(m.ratio, 0))}, U = ${esc(C.fmtNum(m.U, 3))} V</title></circle>`;
      }
      if (!measured.length) {
        s += `<text x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2}" class="svg-label">Noch keine Messpunkte übernommen</text>`;
      }
      s += '</svg>';
      hostA.innerHTML = s;
    }

    // --- Diagramm B: U gegen lg(c2 / c1) ---
    const hostB = $('#nernst-chart-log');
    const summaryEl = $('#nernst-reg-summary');
    {
      const W = 460, H = 285, x0 = 68, x1 = 426, y0 = 224, y1 = 22;
      const xMin = -0.2, xMax = 3.25;
      const yMin = -0.01, yMax = 0.205;
      const xPx = (x) => x0 + ((x - xMin) / (xMax - xMin)) * (x1 - x0);
      const yPx = (y) => y0 - ((y - yMin) / (yMax - yMin)) * (y0 - y1);

      let s = `<svg role="img" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="Diagramm B: Zellspannung U gegen den dekadischen Logarithmus von c2 zu c1">`;
      s += '<title>Zellspannung U = ΔE gegen lg(c₂ / c₁)</title>';

      for (let yv = 0; yv <= 0.201; yv += 0.05) {
        const y = yPx(yv);
        s += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${Math.abs(yv) < 1e-6 ? '#b8c6d4' : '#e7edf2'}"/>`;
        s += `<line x1="${x0 - 4}" y1="${y}" x2="${x0}" y2="${y}" stroke="#7f91a3"/>`;
        s += `<text x="${x0 - 8}" y="${y + 3.5}" class="svg-tiny" text-anchor="end">${esc(C.fmtNum(yv, 2))}</text>`;
      }
      const xLabels = [[0, '(1 : 1)'], [1, '(10 : 1)'], [2, '(100 : 1)'], [3, '(1000 : 1)']];
      for (const [xv, sub] of xLabels) {
        const x = xPx(xv);
        const isZero = xv === 0;
        s += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y0}" stroke="${isZero ? '#b8c6d4' : '#eef2f6'}" ${isZero ? 'stroke-dasharray="4 3"' : ''}/>`;
        s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + 4}" stroke="#7f91a3"/>`;
        s += `<text x="${x}" y="${y0 + 15}" class="svg-tiny" text-anchor="middle">${esc(C.fmtNum(xv, 0))}</text>`;
        s += `<text x="${x}" y="${y0 + 27}" class="svg-tiny" text-anchor="middle" fill="#6a7a89">${sub}</text>`;
      }
      s += `<line x1="${x0}" y1="${y1}" x2="${x0}" y2="${y0}" stroke="#516170" stroke-width="1.5"/>`;
      s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="#516170" stroke-width="1.5"/>`;
      s += `<text x="${(x0 + x1) / 2}" y="${H - 8}" class="svg-tiny" font-weight="700" text-anchor="middle">lg(c₂(Ag⁺) / c₁(Ag⁺))</text>`;
      s += `<text x="16" y="${(y0 + y1) / 2}" class="svg-tiny" font-weight="700" text-anchor="middle" transform="rotate(-90 16 ${(y0 + y1) / 2})">Spannung U = ΔE in V</text>`;

      // Punkte deduplizieren nach logRatio, falls mehrere Kombinationen dasselbe Verhältnis (lg = 1) haben -> Regression über alle gemessenen Punkte!
      const dataPts = measured.map((m) => ({ x: m.logRatio, y: m.U, comboId: m.comboId, label: m.label }));
      const reg = C.linearRegression(dataPts);

      if (showFit && reg) {
        const ly0 = reg.intercept;
        const ly3 = reg.slope * 3 + reg.intercept;
        s += `<line x1="${xPx(0)}" y1="${yPx(ly0)}" x2="${xPx(3)}" y2="${yPx(ly3)}" stroke="#006699" stroke-width="2.2"/>`;

        // Steigungsdreieck links-oben über der Geraden (1 -> 2), kollisionsfrei mit Kupfer (z = 2)
        const ty1 = reg.slope * 1 + reg.intercept;
        const ty2 = reg.slope * 2 + reg.intercept;
        const px1 = xPx(1), px2 = xPx(2), py1 = yPx(ty1), py2 = yPx(ty2);
        s += `<polyline points="${px1},${py1} ${px1},${py2} ${px2},${py2}" fill="none" stroke="#d96b43" stroke-width="1.8" stroke-dasharray="4 3"/>`;
        s += `<text x="${px1 - 6}" y="${(py1 + py2) / 2 + 3}" class="svg-tiny" font-weight="700" fill="#9c381c" text-anchor="end">ΔU = +${esc(C.fmtNum(reg.slope, 3))} V</text>`;
        s += `<text x="${(px1 + px2) / 2}" y="${py2 - 7}" class="svg-tiny" font-weight="700" fill="#9c381c" text-anchor="middle">Δ(lg(c₂ / c₁)) = 1</text>`;
      }

      if (showCu) {
        const cuSlope = C.NERNST / 2;
        s += `<line x1="${xPx(0)}" y1="${yPx(0)}" x2="${xPx(3)}" y2="${yPx(cuSlope * 3)}" stroke="#c8703a" stroke-width="2.2" stroke-dasharray="6 4"/>`;
        for (let xv = 0; xv <= 3; xv++) {
          s += `<circle cx="${xPx(xv)}" cy="${yPx(cuSlope * xv)}" r="3.6" fill="#c8703a" stroke="#fff" stroke-width="1"><title>Kupfer (z = 2): lg(c₂/c₁) = ${xv}, U ≈ ${esc(C.fmtNum(cuSlope * xv, 3))} V</title></circle>`;
        }
        s += `<rect x="${x0 + 8}" y="${y1 + 4}" width="186" height="36" rx="4" fill="rgba(255,255,255,0.92)" stroke="#cfdbe6"/>`;
        s += `<line x1="${x0 + 16}" y1="${y1 + 16}" x2="${x0 + 34}" y2="${y1 + 16}" stroke="#006699" stroke-width="2.2"/>`;
        s += `<text x="${x0 + 40}" y="${y1 + 19}" class="svg-tiny" text-anchor="start">Ag (z = 1): x ≈ 0,059 V</text>`;
        s += `<line x1="${x0 + 16}" y1="${y1 + 30}" x2="${x0 + 34}" y2="${y1 + 30}" stroke="#c8703a" stroke-width="2.2" stroke-dasharray="4 3"/>`;
        s += `<text x="${x0 + 40}" y="${y1 + 33}" class="svg-tiny" text-anchor="start">Cu (z = 2): x ≈ 0,0295 V</text>`;
      }

      for (const pt of dataPts) {
        const cx = xPx(pt.x);
        const cy = yPx(pt.y);
        const sel = pt.comboId === curComboId;
        if (sel) s += `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="#d96b43" stroke-width="2"/>`;
        s += `<circle cx="${cx}" cy="${cy}" r="4.8" fill="#006699" stroke="#fff" stroke-width="1.2"><title>${esc(pt.label)}: lg(c₂/c₁) = ${esc(C.fmtNum(pt.x, 0))}, U = ${esc(C.fmtNum(pt.y, 3))} V</title></circle>`;
      }

      if (!measured.length) {
        s += `<text x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2}" class="svg-label">Noch keine Messpunkte übernommen</text>`;
      }
      s += '</svg>';
      hostB.innerHTML = s;

      if (reg) {
        const eq = `U = ${C.fmtNum(reg.slope, 3)} V · lg(c₂ / c₁) (${reg.intercept >= 0 ? '+' : '−'}${C.fmtNum(Math.abs(reg.intercept), 3)} V)`;
        summaryEl.innerHTML = `<strong>Ausgleichsgerade (n = ${reg.n}):</strong> ${esc(eq)} &nbsp;|&nbsp; Faktor <strong>x = ${esc(C.fmtNum(reg.slope, 3))}</strong> &nbsp;|&nbsp; R² = ${esc(C.fmtNum(reg.r2, 4))}`;
      } else {
        summaryEl.textContent = 'Miss mindestens zwei verschiedene Kombinationen, um Ausgleichsgerade und Proportionalitätsfaktor x zu bestimmen.';
      }
    }
  }

  function renderOldSilverLab() {
    const res = C.oldSilverCell(state.nernst.oldRefC);
    $('#nernst-old-u').textContent = C.fmtNum(res.U, 3) + ' V';
    $('#nernst-old-poles').textContent = res.oldIsAnode
      ? 'Frische ' + C.fmtC(res.cRef) + ' M = Pluspol (c₂) · Alte Lösung = Minuspol (c₁) → c_alt < ' + C.fmtC(res.cRef) + ' mol/L'
      : 'Alte Lösung = Pluspol (c₂) · Frische ' + C.fmtC(res.cRef) + ' M = Minuspol (c₁) → c_alt > ' + C.fmtC(res.cRef) + ' mol/L';
  }

  function clearInvalid(el) {
    if (el) {
      el.removeAttribute('aria-invalid');
      el.classList.remove('gap-ok', 'gap-bad');
    }
  }

  function markValidity(el, ok) {
    if (!el) return;
    if (ok) el.removeAttribute('aria-invalid');
    else el.setAttribute('aria-invalid', 'true');
    el.classList.toggle('gap-ok', ok);
    el.classList.toggle('gap-bad', !ok);
  }

  function checkNernstQual() {
    const q = state.nernst.qualitative;
    const ok1 = q.q1 === 'prod';
    const ok2 = q.q2 === 'mehr';
    const ok3 = q.q3 === 'anode';
    markValidity($('#nernst-q1'), ok1);
    markValidity($('#nernst-q2'), ok2);
    markValidity($('#nernst-q3'), ok3);
    const all = ok1 && ok2 && ok3;
    state.nernst.qualOk = all;
    if (all) {
      setFeedback('nernst-qual', true, '✔ Richtig! In der verdünnteren Halbzelle c₁ gehen nach Le Chatelier mehr Ag-Atome in Lösung. Sie hat das niedrigere Potenzial und bildet die Anode (Minuspol), bis c₁ = c₂ erreicht ist.');
    } else {
      setFeedback('nernst-qual', false, '✘ Prüfe die rot markierten Felder: Bei geringerer Ag⁺-Konzentration weicht Ag ⇌ Ag⁺ + e⁻ so aus, dass mehr Ag⁺-Ionen nachgebildet werden.');
    }
    save();
    renderProgress();
  }

  function checkNernstDerive() {
    const rEl = $('#nernst-reason-ratio');
    const lEl = $('#nernst-reason-log');
    const mEl = $('#nernst-slope-in');
    const rOk = state.nernst.reasonRatio === 'ratio';
    const lOk = state.nernst.reasonLog === 'double';
    const m = parseNum(state.nernst.slope);
    const mOk = m !== null && m >= 0.055 && m <= 0.063;
    markValidity(rEl, rOk);
    markValidity(lEl, lOk);
    markValidity(mEl, mOk);
    const all = rOk && lOk && mOk;
    state.nernst.deriveOk = all;
    if (all) {
      const det = $('#nernst-formula-details');
      if (det) det.open = true;
      setFeedback('nernst-derive', true, '✔ Richtig! Die Spannung hängt vom Konzentrationsverhältnis c₂ / c₁ ab und wächst mit lg(c₂ / c₁). Der Proportionalitätsfaktor beträgt x ≈ 0,059 V: U = ΔE = 0,059 V · lg(c₂(Ag⁺) / c₁(Ag⁺)).');
    } else {
      const hints = [];
      if (!rOk) hints.push('gleiches Verhältnis c₂ / c₁ = 10 liefert dieselbe Spannung');
      if (!lOk) hints.push('Verzehnfachung von c₂ / c₁ auf 100 verdoppelt U (lg 100 = 2)');
      if (!mOk) {
        hints.push(m !== null && m >= 55 && m <= 63
          ? 'Proportionalitätsfaktor x in Volt (V) statt Millivolt (mV) angeben – teile deinen Wert durch 1000'
          : 'Faktor x als Steigung ΔU / Δ(lg(c₂ / c₁)) aus Tabelle oder Diagramm B bestimmen');
      }
      setFeedback('nernst-derive', false, '✘ Noch nicht ganz vollständig: ' + hints.join('; ') + '.');
    }
    save();
    renderProgress();
  }

  function checkNernstOld() {
    const el = $('#nernst-old-c');
    const v = parseNum(state.nernst.oldC);
    const ok = v !== null && v >= 0.017 && v <= 0.023;
    markValidity(el, ok);
    state.nernst.oldCOk = ok;
    if (ok) {
      setFeedback('nernst-old', true, '✔ Richtig! Die alte Silbernitrat-Lösung hat tatsächlich nur noch eine Konzentration von c_alt ≈ 0,020 mol/L (ein Fünftel der aufgedruckten 0,1 mol/L).');
    } else {
      setFeedback('nernst-old', false, '✘ Prüfe deinen Rechenansatz: Setze den gemessenen Spannungswert U und die gewählte Referenzkonzentration in U = 0,059 V · lg(c₂ / c₁) (mit c₂ > c₁) ein.');
    }
    save();
    renderProgress();
  }

  function checkNernstExCu() {
    const el = $('#nernst-ex-cu');
    const v = parseNum(state.nernst.exCu);
    const ok = v !== null && v >= 0.057 && v <= 0.061;
    markValidity(el, ok);
    state.nernst.exCuOk = ok;
    if (ok) {
      setFeedback('nernst-ex-cu', true, '✔ Richtig! Für Kupfer (z = 2) beträgt der Vorfaktor 0,059 V / 2 = 0,0295 V. Bei c₂ / c₁ = 100 gilt ΔE = 0,0295 V · 2 = 0,059 V.');
    } else if (v !== null && v >= 57 && v <= 61) {
      setFeedback('nernst-ex-cu', false, '✘ Bitte in Volt (V) statt Millivolt (mV) angeben – teile dein Ergebnis durch 1000.');
    } else {
      setFeedback('nernst-ex-cu', false, '✘ Prüfe deine Rechnung: Bei Kupfer (Cu ⇌ Cu²⁺ + 2 e⁻) ist z = 2. Multipliziere 0,059 V / 2 mit lg(0,1 / 0,001) = 2.');
    }
    save();
    renderProgress();
  }

  function syncNernstControls() {
    const n = state.nernst;
    const radL = $(`input[name="nernst-c-left"][value="${String(n.cLeft)}"]`);
    if (radL) radL.checked = true;
    const radR = $(`input[name="nernst-c-right"][value="${String(n.cRight)}"]`);
    if (radR) radR.checked = true;
    const radOld = $(`input[name="nernst-old-ref"][value="${String(n.oldRefC)}"]`);
    if (radOld) radOld.checked = true;
    $('#nernst-show-fit').checked = !!n.showFit;
    $('#nernst-show-cu').checked = !!n.showCuCompare;
    $('#nernst-q1').value = n.qualitative.q1 || '';
    $('#nernst-q2').value = n.qualitative.q2 || '';
    $('#nernst-q3').value = n.qualitative.q3 || '';
    $('#nernst-reason-ratio').value = n.reasonRatio || '';
    $('#nernst-reason-log').value = n.reasonLog || '';
    $('#nernst-slope-in').value = n.slope || '';
    $('#nernst-old-c').value = n.oldC || '';
    $('#nernst-ex-cu').value = n.exCu || '';
  }

  function initNernst() {
    syncNernstControls();
    renderNernstApparatus();
    renderNernstTable();
    renderNernstCharts();
    renderOldSilverLab();

    $$('input[name="nernst-c-left"]').forEach((r) => r.addEventListener('change', () => {
      state.nernst.cLeft = Number(r.value);
      save();
      renderNernstApparatus();
      renderNernstTable();
      renderNernstCharts();
    }));
    $$('input[name="nernst-c-right"]').forEach((r) => r.addEventListener('change', () => {
      state.nernst.cRight = Number(r.value);
      save();
      renderNernstApparatus();
      renderNernstTable();
      renderNernstCharts();
    }));

    $('#nernst-record').addEventListener('click', () => recordNernstPair(state.nernst.cLeft, state.nernst.cRight));
    $('#nernst-record-all').addEventListener('click', () => {
      for (const combo of C.SILVER_CELL_COMBOS) {
        const pt = C.concentrationCellPair('Ag', combo.c1, combo.c2);
        state.nernst.measured[combo.id] = {
          c1: pt.c1,
          c2: pt.c2,
          ratio: pt.ratio,
          logRatio: pt.logRatio,
          U: pt.U,
          factorX: pt.factorX,
        };
      }
      save();
      renderNernstApparatus();
      renderNernstTable();
      renderNernstCharts();
      renderProgress();
      $('#nernst-status').textContent = '✔ Alle ' + C.SILVER_CELL_COMBOS.length + ' Silber-Konzentrationszellen wurden in die Messtabelle übernommen.';
    });

    $('#nernst-open-lab').addEventListener('click', () => openInMainLab('Ag', state.nernst.cLeft, state.nernst.cRight));
    $('#nernst-open-cu-lab').addEventListener('click', () => openInMainLab('Cu', 0.001, 0.1));

    $('#nernst-show-fit').addEventListener('change', (e) => {
      state.nernst.showFit = e.target.checked;
      save();
      renderNernstCharts();
    });
    $('#nernst-show-cu').addEventListener('change', (e) => {
      state.nernst.showCuCompare = e.target.checked;
      save();
      renderNernstCharts();
    });

    $$('input[name="nernst-old-ref"]').forEach((r) => r.addEventListener('change', () => {
      state.nernst.oldRefC = Number(r.value);
      save();
      renderOldSilverLab();
    }));

    $$('select[data-nernst-qual]').forEach((s) => s.addEventListener('change', () => {
      state.nernst.qualitative[s.dataset.nernstQual] = s.value;
      state.nernst.qualOk = false;
      clearInvalid(s);
      save();
    }));

    const bindDerive = (sel, key, evt) => {
      const el = $(sel);
      el.addEventListener(evt, () => {
        state.nernst[key] = el.value;
        state.nernst.deriveOk = false;
        clearInvalid(el);
        save();
      });
    };
    bindDerive('#nernst-reason-ratio', 'reasonRatio', 'change');
    bindDerive('#nernst-reason-log', 'reasonLog', 'change');
    bindDerive('#nernst-slope-in', 'slope', 'input');

    $('#nernst-old-c').addEventListener('input', (e) => {
      state.nernst.oldC = e.target.value;
      state.nernst.oldCOk = false;
      clearInvalid(e.target);
      save();
    });
    $('#nernst-ex-cu').addEventListener('input', (e) => {
      state.nernst.exCu = e.target.value;
      state.nernst.exCuOk = false;
      clearInvalid(e.target);
      save();
    });

    $$('form[data-check-form]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const k = form.dataset.checkForm;
        if (k === 'nernst-qual') checkNernstQual();
        else if (k === 'nernst-derive') checkNernstDerive();
        else if (k === 'nernst-old') checkNernstOld();
        else if (k === 'nernst-ex-cu') checkNernstExCu();
      });
    });

    if (state.nernst.qualOk) checkNernstQual();
    if (state.nernst.deriveOk) checkNernstDerive();
    if (state.nernst.oldCOk) checkNernstOld();
    if (state.nernst.exCuOk) checkNernstExCu();
  }

  /* =====================================================================
     FORTSCHRITT, DRUCK, RESET
     ===================================================================== */
  function renderProgress() {
    const combos = C.coreCombos();
    const items = combos.map((c) => galleryCorrect(c.key));
    items.push(state.tasks.orderOk, state.tasks.additivOk, state.tasks.sentencesOk, state.tasks.matchOk);
    items.push(C.ORDER.every((id) => state.dl[id] !== undefined));
    const nernstDone = C.SILVER_CELL_COMBOS.every((combo) => !!state.nernst.measured[combo.id]);
    items.push(nernstDone, state.nernst.qualOk, state.nernst.deriveOk, state.nernst.oldCOk, state.nernst.exCuOk);
    const done = items.filter(Boolean).length;
    $('#progress-text').textContent = done + ' / ' + items.length + ' erledigt';
    const bar = $('#progress-bar');
    bar.max = items.length;
    bar.value = done;
  }

  function initGlobal() {
    $('#print-page').addEventListener('click', () => window.print());
    $('#reset-all').addEventListener('click', () => {
      if (!window.confirm('Alle Messwerte, Antworten und Einstellungen löschen?')) return;
      state = DEFAULT_STATE();
      save();
      $('#expert-mode').checked = false;
      onLabChange();
      renderGallery();
      renderTasks();
      renderMatch();
      renderDlCompare();
      syncNernstControls();
      renderNernstApparatus();
      renderNernstTable();
      renderNernstCharts();
      renderOldSilverLab();
      $('#nernst-status').textContent = 'Wähle links und rechts zwei AgNO₃-Konzentrationen und übernimm die Zellspannung in die Tabelle.';
      const det = $('#nernst-formula-details');
      if (det) det.open = false;
      ['#nernst-q1', '#nernst-q2', '#nernst-q3', '#nernst-reason-ratio', '#nernst-reason-log', '#nernst-slope-in', '#nernst-old-c', '#nernst-ex-cu'].forEach((s) => clearInvalid($(s)));
      renderProgress();
      ['order', 'additiv', 'sentences', 'match', 'nernst-qual', 'nernst-derive', 'nernst-old', 'nernst-ex-cu'].forEach((id) => setFeedback(id, null, ''));
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-check]');
      if (!b) return;
      const t = b.dataset.check;
      if (t === 'order') checkOrder();
      else if (t === 'additiv') checkAdditiv(false);
      else if (t === 'sentences') checkSentences();
      else if (t === 'match') checkMatch();
    });
    $('#additiv-input').addEventListener('input', (e) => { state.tasks.additiv = e.target.value; state.tasks.additivOk = false; save(); });
    $('#sentence-cell').addEventListener('change', (e) => { state.tasks.sentenceCell = e.target.value; state.tasks.sentencesOk = false; setFeedback('sentences', null, ''); renderSentences(); save(); });
    $('#dl-notes').addEventListener('input', (e) => { state.tasks.dlNotes = e.target.value; save(); });
  }

  /* ---------- Start ---------- */
  function init() {
    initGlobal();
    initLab();
    renderGlossary();
    initParticles();
    initDoubleLayer();
    onLabChange();
    renderGallery();
    renderTasks();
    renderMatch();
    initNernst();
    renderProgress();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
