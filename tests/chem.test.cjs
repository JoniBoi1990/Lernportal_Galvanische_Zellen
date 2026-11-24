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
  assert.equal(C.fmtC(0.0001), '0,0001');
  assert.equal(C.fmtC(1e-5), '0,00001');
});

test('NERNST_SERIES und fmtSci formatieren 5 Dekaden sauber', () => {
  assert.deepEqual(C.NERNST_SERIES, [1, 0.1, 0.01, 0.001, 0.0001]);
  assert.deepEqual(C.NERNST_SERIES.map(C.fmtSci), ['10⁰', '10⁻¹', '10⁻²', '10⁻³', '10⁻⁴']);
  assert.equal(C.fmtSci(1e-5), '10⁻⁵');
});

test('Nernst-Potenziale für Silber über alle 5 Konzentrationsstufen', () => {
  const expected = [0.800, 0.741, 0.682, 0.623, 0.564];
  C.NERNST_SERIES.forEach((c, idx) => {
    near(C.potential('Ag', c), expected[idx], 1e-6);
  });
});

test('measuredDeltaE für Silber-Konzentrationszellen liefert 1-mV-Auflösung und Symmetrie', () => {
  assert.equal(C.measuredDeltaE(hc('Ag', 'Ag', 1), hc('Ag', 'Ag', 1)), 0);
  for (const c of C.NERNST_SERIES) {
    const theo = Math.abs(C.potential('Ag', 1) - C.potential('Ag', c));
    const u1 = C.measuredDeltaE(hc('Ag', 'Ag', c), hc('Ag', 'Ag', 1));
    const u2 = C.measuredDeltaE(hc('Ag', 'Ag', 1), hc('Ag', 'Ag', c));
    assert.equal(u1, u2, 'symmetrisch');
    assert.ok(Math.abs(u1 - theo) <= 0.002, `c=${c}: ${u1} vs ${theo}`);
    assert.equal(Math.round(u1 * 1000), u1 * 1000, '3 Nachkommastellen');
  }
});

test('concentrationCellPoint liefert konsistente Daten für alle 5 Stufen', () => {
  for (const c of C.NERNST_SERIES) {
    const pt = C.concentrationCellPoint('Ag', c, 1);
    assert.equal(pt.metal, 'Ag');
    assert.equal(pt.z, 1);
    assert.equal(pt.E0, 0.8);
    assert.equal(pt.anodeSide, c < 1 ? 'test' : null);
    near(pt.E, pt.E0 - pt.U, 1e-9);
    near(pt.logC, Math.log10(c), 1e-9);
  }
});

test('linearRegression für exakte Gerade, Silber, Kupfer und Randfälle', () => {
  const exact = C.linearRegression([{ x: 0, y: 3 }, { x: 1, y: 5 }, { x: 2, y: 7 }]);
  near(exact.slope, 2, 1e-9);
  near(exact.intercept, 3, 1e-9);
  near(exact.r2, 1, 1e-9);
  assert.equal(exact.n, 3);

  const agPts = C.NERNST_SERIES.map((c) => {
    const pt = C.concentrationCellPoint('Ag', c, 1);
    return { x: pt.logC, y: pt.E };
  });
  const agFit = C.linearRegression(agPts);
  assert.ok(agFit.slope >= 0.058 && agFit.slope <= 0.060, `Ag Steigung ${agFit.slope}`);
  assert.ok(agFit.intercept >= 0.798 && agFit.intercept <= 0.802, `Ag Achsenabschnitt ${agFit.intercept}`);
  assert.ok(agFit.r2 > 0.999, `Ag R² ${agFit.r2}`);

  const cuPts = C.NERNST_SERIES.map((c) => {
    const pt = C.concentrationCellPoint('Cu', c, 1);
    return { x: pt.logC, y: pt.E };
  });
  const cuFit = C.linearRegression(cuPts);
  assert.ok(cuFit.slope >= 0.0285 && cuFit.slope <= 0.0305, `Cu Steigung ${cuFit.slope}`);

  assert.equal(C.linearRegression([]), null);
  assert.equal(C.linearRegression([{ x: 1, y: 2 }]), null);
  assert.equal(C.linearRegression([{ x: 1, y: 2 }, { x: 1, y: 5 }]), null);
});

test('concentrationFromVoltage kehrt Nernst-Gleichung für unbekannte Lösung um', () => {
  const res = C.concentrationFromVoltage('Ag', 0.295, 1);
  near(res.logC, -5, 1e-9);
  near(res.c, 1e-5, 1e-12);
});

test('overall für Konzentrationszelle formatiert Konzentrationsausgleich', () => {
  assert.equal(C.overall('Ag', 'Ag', 0.001, 1), 'Ag⁺ (c = 1 mol/L) → Ag⁺ (c = 0,001 mol/L)');
});

test('SILVER_CONCS, SILVER_CELL_COMBOS und concentrationCellPair decken Unterrichtsgang + 1 M ab', () => {
  assert.deepEqual(C.SILVER_CONCS, [1, 0.1, 0.01, 0.001]);
  assert.equal(C.SILVER_CELL_COMBOS.length, 7);
  assert.equal(C.OLD_AG_CONC, 0.02);

  const eq = C.concentrationCellPair('Ag', 0.1, 0.1);
  assert.equal(eq.comboId, 'eq');
  assert.equal(eq.U, 0);
  assert.equal(eq.factorX, null);
  assert.equal(eq.anodeSide, null);

  const p1 = C.concentrationCellPair('Ag', 0.01, 0.1);
  const p2 = C.concentrationCellPair('Ag', 0.1, 0.01);
  assert.equal(p1.U, p2.U, 'symmetrische Spannung');
  assert.equal(p1.anodeSide, 'left');
  assert.equal(p2.anodeSide, 'right');
  near(p1.ratio, 10, 1e-9);
  near(p1.logRatio, 1, 1e-9);
  assert.ok(p1.factorX >= 0.057 && p1.factorX <= 0.061, `factorX=${p1.factorX}`);

  const p100 = C.concentrationCellPair('Ag', 0.001, 0.1);
  assert.equal(p100.comboId, '0.001_0.1');
  near(p100.ratio, 100, 1e-9);
  near(p100.logRatio, 2, 1e-9);
  near(p100.theoDeltaE, 0.118, 1e-6);
  assert.ok(p100.factorX >= 0.058 && p100.factorX <= 0.060, `factorX=${p100.factorX}`);

  const p1000 = C.concentrationCellPair('Ag', 0.001, 1);
  assert.equal(p1000.comboId, '0.001_1');
  near(p1000.ratio, 1000, 1e-9);
  near(p1000.logRatio, 3, 1e-9);
  near(p1000.theoDeltaE, 0.177, 1e-6);
  assert.ok(p1000.factorX >= 0.058 && p1000.factorX <= 0.060, `factorX=${p1000.factorX}`);
});

test('oldSilverCell zeigt Polwechsel zwischen 0,1 M und 0,01 M und liefert c_alt ≈ 0,020 mol/L', () => {
  const r1 = C.oldSilverCell(1);
  assert.equal(r1.oldIsAnode, true);
  assert.ok(r1.U >= 0.098 && r1.U <= 0.102, `gegen 1 M: U=${r1.U}`);
  assert.ok(r1.estimatedC >= 0.018 && r1.estimatedC <= 0.022, `est=${r1.estimatedC}`);

  const r01 = C.oldSilverCell(0.1);
  assert.equal(r01.oldIsAnode, true);
  assert.ok(r01.U >= 0.039 && r01.U <= 0.043, `gegen 0,1 M: U=${r01.U}`);
  assert.ok(r01.estimatedC >= 0.018 && r01.estimatedC <= 0.022, `est=${r01.estimatedC}`);

  const r001 = C.oldSilverCell(0.01);
  assert.equal(r001.oldIsAnode, false);
  assert.ok(r001.U >= 0.016 && r001.U <= 0.020, `gegen 0,01 M: U=${r001.U}`);
  assert.ok(r001.estimatedC >= 0.018 && r001.estimatedC <= 0.022, `est=${r001.estimatedC}`);

  const r0001 = C.oldSilverCell(0.001);
  assert.equal(r0001.oldIsAnode, false);
  assert.ok(r0001.U >= 0.075 && r0001.U <= 0.079, `gegen 0,001 M: U=${r0001.U}`);
  assert.ok(r0001.estimatedC >= 0.018 && r0001.estimatedC <= 0.022, `est=${r0001.estimatedC}`);
});
