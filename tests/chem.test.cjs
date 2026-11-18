// Tests für die fachliche Logik: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../chem.js');

const hc = (m, e, c = 0.1) => ({ metal: m, electrolyte: e === undefined ? m : e, c });
const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('Nernst-Potenziale bei 0,1 mol/L', () => {
  near(C.potential('Zn', 0.1), -0.7895);
  near(C.potential('Cu', 0.1), 0.3105);
  near(C.potential('Ag', 0.1), 0.741);
  near(C.potential('Fe', 1), -0.41);
});

test('Daniell-Element: Zn ist Anode, ΔE ≈ 1,10 V', () => {
  const r = C.analyzeCell({ left: hc('Zn'), right: hc('Cu'), cables: true, redSide: 'right', bridge: 'kno3', device: 'voltmeter' });
  assert.equal(r.valid, true);
  assert.equal(r.anodeSide, 'left');
  assert.equal(r.cathodeSide, 'right');
  near(r.deltaE, 1.10, 0.005);
  assert.ok(r.reading > 0, 'rotes Kabel am Pluspol → positive Anzeige');
});

test('Vertauschte Kabel liefern negative Anzeige', () => {
  const r = C.analyzeCell({ left: hc('Zn'), right: hc('Cu'), cables: true, redSide: 'left', bridge: 'kno3' });
  assert.ok(r.reading < 0);
});

test('Ohne getränkte Salzbrücke ist der Kreis offen', () => {
  for (const bridge of ['none', 'dry']) {
    const r = C.analyzeCell({ left: hc('Zn'), right: hc('Cu'), cables: true, redSide: 'right', bridge });
    assert.equal(r.closed, false);
    assert.equal(r.reading, 0);
  }
});

test('Fehlkombination Zn in CuSO₄ wird als direkte Redoxreaktion erkannt', () => {
  const info = C.mismatchInfo(hc('Zn', 'Cu'));
  assert.equal(info.type, 'direct');
  assert.equal(C.mismatchInfo(hc('Cu', 'Zn')).type, 'none');
  const r = C.analyzeCell({ left: hc('Zn', 'Cu'), right: hc('Ag'), cables: true, redSide: 'right', bridge: 'kno3' });
  assert.equal(r.valid, false);
});

test('Gesamtgleichungen werden korrekt ausgeglichen', () => {
  assert.equal(C.overall('Zn', 'Cu'), 'Zn + Cu²⁺ → Zn²⁺ + Cu');
  assert.equal(C.overall('Zn', 'Ag'), 'Zn + 2 Ag⁺ → Zn²⁺ + 2 Ag');
  assert.equal(C.overall('Cu', 'Ag'), 'Cu + 2 Ag⁺ → Cu²⁺ + 2 Ag');
  assert.equal(C.oxidation('Fe'), 'Fe → Fe²⁺ + 2 e⁻');
  assert.equal(C.reduction('Ag'), 'Ag⁺ + e⁻ → Ag');
  assert.equal(C.electronsTransferred('Zn', 'Ag'), 2);
});

test('Konzentrationszelle: verdünnte Seite ist Anode', () => {
  const r = C.analyzeCell({ left: hc('Cu', 'Cu', 0.001), right: hc('Cu', 'Cu', 1), cables: true, redSide: 'right', bridge: 'kno3' });
  assert.equal(r.anodeSide, 'left');
  near(r.deltaE, 0.0885, 0.001);
});

test('Gleiche Halbzellen liefern 0 V', () => {
  const r = C.analyzeCell({ left: hc('Fe'), right: hc('Fe'), cables: true, redSide: 'right', bridge: 'kno3' });
  assert.equal(r.deltaE, 0);
  assert.equal(r.anodeSide, null);
});

test('Sechs Pflichtkombinationen mit realistischen Messwerten', () => {
  const combos = C.coreCombos();
  assert.equal(combos.length, 6);
  for (const { anode, cathode } of combos) {
    const theo = Math.abs(C.potential(anode) - C.potential(cathode));
    const meas = C.measuredDeltaE(hc(anode), hc(cathode));
    assert.ok(Math.abs(meas - theo) <= 0.021, `${anode}/${cathode}: ${meas} vs ${theo}`);
    assert.equal(meas, C.measuredDeltaE(hc(cathode), hc(anode)), 'symmetrisch');
  }
});

test('Doppelschicht: unedle Metalle laden sich stärker negativ auf', () => {
  const q = C.ORDER.map((id) => C.doubleLayerCharge(id));
  for (let i = 1; i < q.length; i++) assert.ok(q[i] < q[i - 1], q.join(','));
  const { rDissolve, rDeposit, qEq } = C.doubleLayerRates('Zn', C.doubleLayerCharge('Zn'));
  near(rDissolve, rDeposit, 1e-9);
  assert.equal(qEq, C.doubleLayerCharge('Zn'));
});

test('Zahlenformat deutsch mit echtem Minuszeichen', () => {
  assert.equal(C.fmtNum(-0.76), '−0,76');
  assert.equal(C.fmtSigned(0.8), '+0,80');
  assert.equal(C.fmtNum(-0.001, 2), '0,00');
  assert.equal(C.fmtC(0.1), '0,1');
});
