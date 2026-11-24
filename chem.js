/* Galvanische Zellen – fachliche Logik (ohne DOM)
 * Läuft im Browser (window.GZChem) und in Node (module.exports) für Tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GZChem = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Nernst-Faktor bei 25 °C in V (RT/F · ln10) */
  const NERNST = 0.059;
  const R_GAS = 8.314462618;
  const F_CONST = 96485.33212;
  const T_STD = 298.15;

  /** Konjugierte Redoxpaare der Versuchsanleitung (Standardpotenziale nach Schulbuch-Tabellen) */
  const PAIRS = {
    Zn: {
      id: 'Zn', name: 'Zink', z: 2, E0: -0.76,
      ion: 'Zn²⁺', salt: 'ZnSO₄', saltName: 'Zinksulfat', anion: 'SO₄²⁻', anionId: 'SO4',
      metalColor: '#9aa4ae', metalDark: '#6c757e', ionColor: '#8792a0',
      solution: 'rgba(226, 233, 239, 0.55)', solutionNote: 'farblos',
    },
    Fe: {
      id: 'Fe', name: 'Eisen', z: 2, E0: -0.41,
      ion: 'Fe²⁺', salt: 'FeSO₄', saltName: 'Eisen(II)-sulfat', anion: 'SO₄²⁻', anionId: 'SO4',
      metalColor: '#77706a', metalDark: '#4f4945', ionColor: '#6aa457',
      solution: 'rgba(193, 223, 165, 0.6)', solutionNote: 'blassgrün',
    },
    Cu: {
      id: 'Cu', name: 'Kupfer', z: 2, E0: 0.34,
      ion: 'Cu²⁺', salt: 'CuSO₄', saltName: 'Kupfer(II)-sulfat', anion: 'SO₄²⁻', anionId: 'SO4',
      metalColor: '#c8703a', metalDark: '#8e4a22', ionColor: '#2a7fd4',
      solution: 'rgba(104, 168, 232, 0.6)', solutionNote: 'hellblau',
    },
    Ag: {
      id: 'Ag', name: 'Silber', z: 1, E0: 0.8,
      ion: 'Ag⁺', salt: 'AgNO₃', saltName: 'Silbernitrat', anion: 'NO₃⁻', anionId: 'NO3',
      metalColor: '#d3d8de', metalDark: '#959ca5', ionColor: '#9aa3ae',
      solution: 'rgba(234, 238, 242, 0.5)', solutionNote: 'farblos',
    },
  };

  /** Reihenfolge von unedel nach edel */
  const ORDER = ['Zn', 'Fe', 'Cu', 'Ag'];
  const CONCENTRATIONS = [1, 0.1, 0.01, 0.001, 0.0001];
  const NERNST_SERIES = [1, 0.1, 0.01, 0.001, 0.0001];
  const SILVER_CONCS = [0.1, 0.01, 0.001];
  const SILVER_CELL_COMBOS = [
    { id: 'eq', c1: 0.1, c2: 0.1, label: '0,1 M ‖ 0,1 M (Vergleich)' },
    { id: '0.01_0.1', c1: 0.01, c2: 0.1, label: '0,01 M ‖ 0,1 M' },
    { id: '0.001_0.01', c1: 0.001, c2: 0.01, label: '0,001 M ‖ 0,01 M' },
    { id: '0.001_0.1', c1: 0.001, c2: 0.1, label: '0,001 M ‖ 0,1 M' },
  ];
  const OLD_AG_CONC = 0.02;
  const DEFAULT_C = 0.1;

  /* ---------- Formatierung ---------- */
  const SUP_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  function toSuperscriptInt(n) {
    const sign = n < 0 ? '⁻' : '';
    return sign + String(Math.abs(n)).split('').map((d) => SUP_DIGITS[Number(d)]).join('');
  }
  function fmtNum(x, digits) {
    const d = digits === undefined ? 2 : digits;
    const s = Math.abs(x).toFixed(d).replace('.', ',');
    return (x < 0 && Number(Math.abs(x).toFixed(d)) !== 0 ? '−' : '') + s;
  }
  function fmtSigned(x, digits) {
    const s = fmtNum(x, digits);
    return x > 0 && Number(Math.abs(x).toFixed(digits === undefined ? 2 : digits)) !== 0 ? '+' + s : s;
  }
  function fmtC(c) {
    const num = Number(c);
    if (Number.isFinite(num) && num > 0 && num < 1) {
      const exp = -Math.log10(num);
      const rounded = Math.round(exp);
      if (Math.abs(exp - rounded) < 1e-9 && rounded >= 1) {
        return num.toFixed(rounded).replace('.', ',');
      }
    }
    return String(c).replace('.', ',');
  }
  function fmtSci(c) {
    const num = Number(c);
    if (!Number.isFinite(num) || num <= 0) return fmtC(c);
    const exp = Math.log10(num);
    const rounded = Math.round(exp);
    if (Math.abs(exp - rounded) < 1e-9) {
      return '10' + toSuperscriptInt(rounded);
    }
    return fmtC(c);
  }

  /* ---------- Potenziale ---------- */
  function potential(id, c) {
    const p = PAIRS[id];
    if (!p) throw new Error('Unbekanntes Redoxpaar: ' + id);
    const conc = c === undefined ? DEFAULT_C : c;
    return p.E0 + (NERNST / p.z) * Math.log10(conc);
  }

  function isComplete(hc) {
    return !!(hc && hc.metal && hc.electrolyte);
  }
  function isConjugate(hc) {
    return isComplete(hc) && hc.metal === hc.electrolyte;
  }

  /** Beschreibt eine Fehlkombination (Metall taucht in fremde Salzlösung) */
  function mismatchInfo(hc) {
    if (!isComplete(hc) || isConjugate(hc)) return null;
    const m = PAIRS[hc.metal];
    const e = PAIRS[hc.electrolyte];
    if (m.E0 < e.E0) {
      return {
        type: 'direct',
        text: m.name + ' ist unedler als ' + e.name + ': Die ' + e.ion + '-Ionen reagieren direkt am ' +
          m.name + 'blech (' + e.name + ' scheidet sich ab, ' + m.ion + '-Ionen gehen in Lösung). ' +
          'Die Elektronen werden direkt übertragen – sie fließen nicht durch das Kabel.',
      };
    }
    return {
      type: 'none',
      text: m.name + ' reagiert nicht mit ' + e.ion + '-Ionen, aber ' + m.name + '/' + e.salt +
        ' ist kein konjugiertes Redoxpaar: Es bildet sich keine definierte Doppelschicht, der Messwert driftet.',
    };
  }

  /**
   * Analysiert den Zustand des Versuchsaufbaus.
   * state = { left: {metal, electrolyte, c}, right: {...}, cables: bool,
   *           redSide: 'left'|'right', bridge: 'none'|'dry'|'kno3', device: 'voltmeter'|'motor' }
   */
  function analyzeCell(state) {
    const L = state.left || {};
    const R = state.right || {};
    const res = {
      halfCellsReady: isComplete(L) && isComplete(R),
      conjugate: isConjugate(L) && isConjugate(R),
      mismatch: { left: mismatchInfo(L), right: mismatchInfo(R) },
      cables: !!state.cables,
      bridgeClosed: state.bridge === 'kno3',
      EL: null, ER: null,
      anodeSide: null, cathodeSide: null,
      deltaE: 0, reading: 0,
      closed: false, current: 0,
      valid: false, stable: false,
    };
    if (res.conjugate) {
      res.EL = potential(L.metal, L.c);
      res.ER = potential(R.metal, R.c);
      const diff = res.ER - res.EL;
      if (Math.abs(diff) > 1e-9) {
        res.anodeSide = diff > 0 ? 'left' : 'right';
        res.cathodeSide = diff > 0 ? 'right' : 'left';
      }
      res.deltaE = Math.abs(diff);
    }
    res.closed = res.halfCellsReady && res.cables && res.bridgeClosed;
    res.valid = res.closed && res.conjugate;
    res.stable = res.valid;
    if (res.valid) {
      const red = state.redSide === 'left' ? res.EL : res.ER;
      const black = state.redSide === 'left' ? res.ER : res.EL;
      res.reading = red - black;
      if (state.device === 'motor') {
        res.current = res.deltaE / (R_INTERNAL + R_MOTOR); // in A
      }
    }
    return res;
  }

  /** Innenwiderstand (v. a. Filterpapier-Salzbrücke) und Motorwiderstand in Ω */
  const R_INTERNAL = 300;
  const R_MOTOR = 20;

  /* ---------- Reaktionsgleichungen ---------- */
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function lcm(a, b) { return (a * b) / gcd(a, b); }
  function coef(n) { return n > 1 ? n + ' ' : ''; }
  function electrons(z) { return (z > 1 ? z + ' ' : '') + 'e⁻'; }

  function oxidation(id) {
    const p = PAIRS[id];
    return p.id + ' → ' + p.ion + ' + ' + electrons(p.z);
  }
  function reduction(id) {
    const p = PAIRS[id];
    return p.ion + ' + ' + electrons(p.z) + ' → ' + p.id;
  }
  function redoxPair(id) {
    const p = PAIRS[id];
    return '(' + p.id + ' / ' + p.ion + ')';
  }

  /** Gesamtgleichung (Anode wird oxidiert, Kathode reduziert) */
  function overall(anodeId, cathodeId, cAnode, cCathode) {
    const a = PAIRS[anodeId];
    const k = PAIRS[cathodeId];
    if (anodeId === cathodeId) {
      return k.ion + ' (c = ' + fmtC(cCathode) + ' mol/L) → ' + k.ion + ' (c = ' + fmtC(cAnode) + ' mol/L)';
    }
    const n = lcm(a.z, k.z);
    const fa = n / a.z;
    const fk = n / k.z;
    return coef(fa) + a.id + ' + ' + coef(fk) + k.ion + ' → ' + coef(fa) + a.ion + ' + ' + coef(fk) + k.id;
  }

  /** Transferierte Elektronen pro Formelumsatz */
  function electronsTransferred(anodeId, cathodeId) {
    return lcm(PAIRS[anodeId].z, PAIRS[cathodeId].z);
  }

  /** Zelldiagramm: Anode | Anoden-Ion ‖ Kathoden-Ion | Kathode */
  function cellDiagram(anode, cathode) {
    const a = PAIRS[anode.metal];
    const k = PAIRS[cathode.metal];
    return a.id + ' | ' + a.ion + ' (' + fmtC(anode.c) + ' mol/L) ‖ ' + k.ion + ' (' + fmtC(cathode.c) + ' mol/L) | ' + k.id;
  }

  /* ---------- Messwerte ---------- */
  /** Kombinationsschlüssel unabhängig von der Seite */
  function comboKey(a, b) {
    const ka = a.metal + '@' + a.c;
    const kb = b.metal + '@' + b.c;
    return ka < kb ? ka + '|' + kb : kb + '|' + ka;
  }

  /** Deterministische „Messabweichung“ (±0,015 V) pro Kombination */
  function measurementOffset(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const u = ((h >>> 0) % 10000) / 10000; // 0..1
    return (u - 0.5) * 0.03;
  }

  /** Realistischer Messwert (Betrag) einer Zelle in V */
  function measuredDeltaE(a, b) {
    const d = Math.abs(potential(a.metal, a.c) - potential(b.metal, b.c));
    if (d < 1e-9) return 0;
    if (a.metal === b.metal) {
      const v = d + measurementOffset(comboKey(a, b)) * 0.1;
      return Math.round(Math.max(0, v) * 1000) / 1000;
    }
    const v = d + measurementOffset(comboKey(a, b));
    return Math.round(Math.max(0, v) * 100) / 100;
  }

  /* ---------- Konzentrationszelle & Nernst-Auswertung ---------- */
  /** Mess- und Theoriedaten für einen Punkt einer Konzentrationszelle gegenüber Bezugshalbzelle cRef */
  function concentrationCellPoint(metalId, cTest, cRef) {
    const p = PAIRS[metalId];
    if (!p) throw new Error('Unbekanntes Redoxpaar: ' + metalId);
    const ref = cRef === undefined ? 1 : Number(cRef);
    const test = Number(cTest);
    if (!(test > 0) || !(ref > 0)) throw new Error('Konzentration muss positiv sein');
    const theoE = potential(metalId, test);
    const theoRef = potential(metalId, ref);
    const theoDeltaE = Math.abs(theoRef - theoE);
    const U = measuredDeltaE({ metal: metalId, c: test }, { metal: metalId, c: ref });
    const E = Math.round((theoRef + (test < ref ? -U : test > ref ? U : 0)) * 1000) / 1000;
    return {
      metal: metalId,
      z: p.z,
      E0: p.E0,
      c: test,
      cRef: ref,
      logC: Math.log10(test),
      negLogRatio: Math.log10(ref / test),
      theoE,
      theoDeltaE,
      U,
      E,
      anodeSide: test < ref ? 'test' : test > ref ? 'ref' : null,
    };
  }

  /** Lineare Regression (OLS) für { x, y }-Punkte */
  function linearRegression(points) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const n = points.length;
    let sx = 0;
    let sy = 0;
    for (const pt of points) {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
      sx += pt.x;
      sy += pt.y;
    }
    const mx = sx / n;
    const my = sy / n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const pt of points) {
      const dx = pt.x - mx;
      const dy = pt.y - my;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }
    if (sxx < 1e-12) return null;
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const r2 = syy < 1e-12 ? 1 : Math.min(1, Math.max(0, (sxy * sxy) / (sxx * syy)));
    return { slope, intercept, r2, n };
  }

  /** Berechnet unbekannte Konzentration einer verdünnten Messhalbzelle aus der Zellspannung U */
  function concentrationFromVoltage(metalId, U, cRef) {
    const p = PAIRS[metalId];
    if (!p) throw new Error('Unbekanntes Redoxpaar: ' + metalId);
    const ref = cRef === undefined ? 1 : Number(cRef);
    if (!(ref > 0)) throw new Error('Referenzkonzentration muss positiv sein');
    const logC = Math.log10(ref) - (p.z * Number(U)) / NERNST;
    return { logC, c: Math.pow(10, logC) };
  }

  /** Konzentrationszelle zwischen beliebigen Konzentrationen cLeft und cRight desselben Metalls */
  function concentrationCellPair(metalId, cLeft, cRight) {
    const p = PAIRS[metalId];
    if (!p) throw new Error('Unbekanntes Redoxpaar: ' + metalId);
    const left = Number(cLeft);
    const right = Number(cRight);
    if (!(left > 0) || !(right > 0)) throw new Error('Konzentration muss positiv sein');
    const c1 = Math.min(left, right);
    const c2 = Math.max(left, right);
    const ratio = c2 / c1;
    const logRatio = Math.log10(ratio);
    const theoDeltaE = (NERNST / p.z) * logRatio;
    const U = measuredDeltaE({ metal: metalId, c: c1 }, { metal: metalId, c: c2 });
    const factorX = logRatio > 1e-9 ? U / logRatio : null;
    const same = Math.abs(left - right) < 1e-12;
    const anodeSide = same ? null : left < right ? 'left' : 'right';
    const cathodeSide = same ? null : left < right ? 'right' : 'left';
    const comboId = same ? 'eq' : String(c1) + '_' + String(c2);
    return {
      metal: metalId,
      z: p.z,
      cLeft: left,
      cRight: right,
      c1,
      c2,
      ratio,
      logRatio,
      theoDeltaE,
      U,
      factorX,
      anodeSide,
      cathodeSide,
      comboId,
    };
  }

  /** Messung der alten Silbernitrat-Lösung (cTrue) gegen eine frische Referenzhalbzelle cRef */
  function oldSilverCell(cRef) {
    const ref = Number(cRef);
    const pair = concentrationCellPair('Ag', OLD_AG_CONC, ref);
    const oldIsAnode = OLD_AG_CONC < ref;
    const estimatedC = oldIsAnode
      ? ref / Math.pow(10, pair.U / NERNST)
      : ref * Math.pow(10, pair.U / NERNST);
    return Object.assign({}, pair, {
      oldSide: 'left',
      oldIsAnode,
      cRef: ref,
      cTrue: OLD_AG_CONC,
      estimatedC,
    });
  }

  /** Die sechs Pflichtkombinationen der Versuchsanleitung (0,1 mol/L) */
  function coreCombos() {
    const list = [];
    for (let i = 0; i < ORDER.length; i++) {
      for (let j = i + 1; j < ORDER.length; j++) {
        const anode = ORDER[i];
        const cathode = ORDER[j];
        list.push({
          key: comboKey({ metal: anode, c: DEFAULT_C }, { metal: cathode, c: DEFAULT_C }),
          anode, cathode,
        });
      }
    }
    return list;
  }

  /* ---------- Doppelschicht-Modell ---------- */
  /**
   * Gleichgewichtsladung (überschüssige Elektronen im Modellausschnitt) einer Halbzelle.
   * Unedle Metalle: große Lösungstendenz → viele Elektronen bleiben zurück.
   */
  function doubleLayerCharge(id, c) {
    const E = potential(id, c === undefined ? DEFAULT_C : c);
    return Math.max(1, Math.round(5.5 - 6 * E));
  }

  /** Raten (pro Sekunde) für Auflösung bzw. Abscheidung bei aktueller Ladung q */
  function doubleLayerRates(id, q, c) {
    const qEq = doubleLayerCharge(id, c);
    const k = 2.4;
    const lambda = 5;
    const rDissolve = k * Math.exp(-q / lambda);
    const rDeposit = k * Math.exp(-qEq / lambda) * (q / qEq);
    return { rDissolve, rDeposit, qEq };
  }

  return {
    NERNST, R_GAS, F_CONST, T_STD, PAIRS, ORDER, CONCENTRATIONS, NERNST_SERIES,
    SILVER_CONCS, SILVER_CELL_COMBOS, OLD_AG_CONC, DEFAULT_C, R_INTERNAL, R_MOTOR,
    fmtNum, fmtSigned, fmtC, fmtSci,
    potential, isComplete, isConjugate, mismatchInfo, analyzeCell,
    oxidation, reduction, redoxPair, overall, electronsTransferred, cellDiagram, lcm,
    comboKey, measurementOffset, measuredDeltaE, coreCombos,
    concentrationCellPoint, linearRegression, concentrationFromVoltage,
    concentrationCellPair, oldSilverCell,
    doubleLayerCharge, doubleLayerRates,
  };
});
