# Virtuelles Labor: Galvanische Zellen (Kursstufe Leistungsfach)

> **Interaktives Lernportal für die Kursstufe (Leistungsfach Chemie, Schule Birklehof)**  
> Didaktische Ausarbeitung und interaktives virtuelles Labor zum Bau und zur Spannungsmessung galvanischer Zellen aus den Halbzellen **Ag / AgNO₃**, **Cu / CuSO₄**, **Fe / FeSO₄** und **Zn / ZnSO₄** nach dem Bildungsplan Baden-Württemberg (3.4.7 Elektrochemie, Teilkompetenzen 5, 6, 7, 8 und 11) inklusive Visualisierung der **Teilchenebene**, der Bildung der **elektrochemischen Doppelschicht** und integrierter **Fachsprachen-Box**.

---

## 🎯 Zweck & didaktisches Konzept

Dieses interaktive HTML5-Portal ermöglicht Schülerinnen und Schülern das vollständige **virtuelle Erproben, Verstehen und Protokollieren galvanischer Zellen**:

1. **Strukturierter 4-Schritte-Arbeitsauftrag:**
   - **Schritt 1:** Halbzelle aus Metallblech und Elektrolyt (0,1 mol/L) vorbereiten.
   - **Schritt 2:** Voltmeter anschließen, sodass eine **positive Spannung** gemessen wird (Polung erkennen: rotes Kabel an V = Kathode/Pluspol, schwarzes Kabel an COM = Anode/Minuspol; Umschalten auf Motor/Verbraucher zur Visualisierung des Stromflusses).
   - **Schritt 3:** Stromkreis durch Salzbrücke / Stromschlüssel (Filterpapier mit KNO₃ getränkt) schließen.
   - **Schritt 4:** Messwert in die interaktive Versuchsgalerie übernehmen.

2. **Fehlkonzepte experimentell erfahrbar machen:**
   - **Trockenes Filterpapier oder fehlende Brücke:** Stromkreis bleibt offen ($0\,\text{V}$), da kein innerer Ladungsausgleich über wandernde Ionen möglich ist.
   - **Fehlkombination (z. B. Zinkblech in Kupfersulfatlösung):** Warnung und Visualisierung der **direkten Redoxreaktion** an der Metalloberfläche (Kupfer scheidet sich ab, Zink löst sich auf; Elektronen werden direkt übertragen und fließen nicht durch das Kabel).
   - **Gleiche Halbzellen:** Kein Potenzialunterschied ($\Delta E = 0\,\text{V}$).

3. **Interaktive Teilchenebene:**
   - Echtzeit-Canvas-Animation mit animiertem Metallgitter (Lattice), Atomauflösung an der Anode, Kationenabscheidung an der Kathode, wandernden Elektronen im Kabel, rotierendem Motor und Ionenwanderung in der KNO₃-Salzbrücke.
   - Ein- und ausblendbare elektrochemische Doppelschicht.
   - Integriertes **Wassermodell** (Halbzellenpotenziale als Bergseen zur Veranschaulichung des Elektronendrucks).

4. **Dediziertes Doppelschicht-Labor:**
   - Eintauchen eines einzelnen Metallblechs in die Lösung seiner Ionen.
   - Visualisierung der Auflösungstendenz und des dynamischen Gleichgewichts ($\text{M} \rightleftharpoons \text{M}^{z+} + z\,\text{e}^-$).
   - Live-Diagramm der Elektrodenaufladung über die Zeit.
   - Vergleich der Gleichgewichtsladungen aller 4 Metalle (Zn > Fe > Cu > Ag).

5. **Versuchsgalerie & Protokoll:**
   - Protokolltabelle für alle 6 Kernkombinationen mit Bestimmung von Minuspol (Anode) und Pluspol (Kathode) samt formativer Rückmeldung.
   - Zusätzlicher **Expertenmodus**: Konzentrationen variieren und Konzentrationszellen / Nernst-Gleichung testen.

6. **Formative Auswertung & Fachsprachen-Box:**
   - **Aufgabe 1:** Redoxreihe anhand der Messungen aufstellen ($\text{Zn} < \text{Fe} < \text{Cu} < \text{Ag}$).
   - **Aufgabe 2:** Additivität der Zellspannungen rechnerisch überprüfen ($\Delta E(\text{Zn/Cu}) + \Delta E(\text{Cu/Ag}) \approx \Delta E(\text{Zn/Ag})$).
   - **Aufgabe 3:** Formulierungshilfe mit interaktiven Satzbausteinen aus der Fachsprachen-Box.
   - **Aufgabe 4:** Reflexionsaufgabe zur Erklärung der Zellspannung über Doppelschichten mit Musterlösung.
   - **Fachbegriffe-Matching:** 15 Kernbegriffe aus der Fachsprachen-Box mit Sofortrückmeldung.

7. **Ableitung der Nernst-Gleichung (Silber-Konzentrationszellen):**
   - **Messreihe aus 1 / 0,1 / 0,01 / 0,001 mol/L (7 Kombinationen):** Kombinieren zweier Silber-Halbzellen unterschiedlicher AgNO₃-Konzentration ($\text{Ag} \mid \text{AgNO}_3\ (c_1) \parallel \text{AgNO}_3\ (c_2) \mid \text{Ag}$) samt $\text{KNO}_3$-Salzbrücke und 1-mV-genauer Spannungsanzeige (`1 mol/L` als virtuelle Erweiterung zur `0,1 M`-Verdünnungsreihe).
   - **Lineare vs. logarithmische Auswertung:** Direktes Diagramm $U$ gegen das Verhältnis $c_2 / c_1$ im Vergleich zu $U$ gegen $\lg(c_2 / c_1)$ mit live berechneter Ausgleichsgerade, Steigungsdreieck ($x \approx 0{,}059\,\text{V}$) und optionaler Vergleichsgerade für Kupfer ($z = 2$).
   - **Auswertung & Ziel-Experiment:** Begründung über das Prinzip von Le Chatelier, Bestimmung des Proportionalitätsfaktors $x$ in $U = \Delta E = 0{,}059\,\text{V} \cdot \lg(c_2 / c_1)$ sowie Konzentrationsbestimmung einer **alten Silbernitrat-Lösung** ($c_{\text{alt}} \approx 0{,}020\,\text{mol/L}$) gegen wählbare frische Referenzhalbzellen.
   - **Brücke zur allgemeinen Nernst-Gleichung:** Algebraischer Nachweis, warum $E^\circ(\text{Ag}/\text{Ag}^+)$ bei Silber gegen Silber herausfällt, Verallgemeinerung auf $E = E^\circ + \frac{0{,}059\,\text{V}}{z} \cdot \lg c(\text{M}^{z+})$ und Transferaufgabe zu Kupfer ($z = 2$).

---

## 📂 Struktur der Dateien

- `index.html`: Semantisches, barrierefreies HTML5-Dokument mit ARIA-Live-Regionen, Skip-Link und Sticky-Navigation.
- `style.css`: Birklehof-Designsystem, responsive Grids, moderne Switches, Canvas-Container und Print-Layout (`@media print`).
- `chem.js`: Fachliche Logik (Nernst-Potenziale, Zellanalyse, Reaktionsgleichungen, Messwertberechnung mit realistischer Streuung, Doppelschicht-Raten); lauffähig in Browser und Node.js.
- `particles.js`: Performance-optimierte Canvas-Rendering-Engine für die Teilchenebene und das Doppelschicht-Labor (inkl. `prefers-reduced-motion` und `IntersectionObserver`-Pausierung).
- `app.js`: Interaktive Steuerung, DOM-Bindung, Aufgabenüberprüfung, Versuchsgalerie und `localStorage`-Persistenz.
- `tests/chem.test.cjs`: Automatisierte Unit-Tests für chemische Korrektheit.
- `assets/`: Offizielle Birklehof- und MINT-Logos.

---

## 🚀 Lokale Nutzung

Die Anwendung läuft vollständig im Browser ohne externe Abhängigkeiten oder Server:

```bash
open "KS_Leistungsfach/E-Chemie/Lernportal_Galvanische_Zellen/index.html"
```

### Unit-Tests ausführen

```bash
node --test tests/
```
