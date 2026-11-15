# Pflichtenheft Turniersoftware LPD – Version 2 (Highscore)

Stand 15.11.2026 (aktualisiert: P2-17, P1-22) · Quelle: alle Abstimmungen zwischen Thomas Tyka und Claude vom 06.–12.11.2026 (Projektnotiz „Stand-Turniersoftware“, Änderungsliste, Funktionsbeschreibung Highscore-Clip, Vorschauen).
Repository: `ThomasTyka/lpd-turniersoftware` (Backend mit SignalR, Frontend React/TypeScript, Betrieb per Docker).

> **So wird dieses Dokument benutzt**
> - Es ist die verbindliche Liste für v2. Jeder Punkt hat eine ID (z. B. `P2-07`) und ein Abnahmekriterium.
> - Gearbeitet wird **Paket für Paket**. Zu Beginn eines Pakets: alle Punkte des Pakets lesen, Plan zeigen, Freigabe abwarten.
> - Am Ende eines Pakets: jeden Punkt einzeln gegen den Code prüfen, Status in `docs/v2-status.md` eintragen (offen / erledigt / abweichend + Begründung), Thomas testet anhand der Abnahmekriterien.
> - Was hier nicht steht, wird nicht „nebenbei“ gebaut. Was unklar ist, wird gefragt, nicht geraten.
> - Abweichungen vom Pflichtenheft nur nach Rücksprache mit Thomas; Entscheidung wird hier nachgetragen.

---

## 0. Grundregeln (gelten für alle Pakete)

| ID | Regel |
|---|---|
| G-01 | Erst zeigen (Plan, Vorschau, Diff), dann nach **ausdrücklicher Freigabe** von Thomas committen/pushen/ausliefern – auch bei kleinen Änderungen. |
| G-02 | v1 bleibt als Tag/Branch `v1` eingefroren und jederzeit für Events einsetzbar. Gearbeitet wird ausschließlich auf Branch `v2`. |
| G-03 | Kein paralleles Arbeiten: Sandy arbeitet während der Umbauphase nicht am Code (Abstimmung durch Thomas). |
| G-04 | **Komplett offline lauffähig.** Keine CDN-Links, keine Online-Schriften, keine externen APIs zur Laufzeit. Schriften (Barlow Condensed), Videos, Logos werden lokal ausgeliefert. |
| G-05 | Spielstand liegt **nur auf dem Laptop**. Tablets, Board-Monitore und Leinwand sind reine Ein-/Ausgabegeräte und jederzeit ersetzbar. |
| G-06 | Jede Eingabe wird **sofort** dauerhaft gespeichert. Nach Neustart von Laptop/Docker ist alles da. |
| G-07 | Bestehende Reiter der Turnierleitung (Spieler, Geräte usw.) bleiben erhalten; Neues kommt dazu. |
| G-08 | Texte deutsch. **Ausnahme:** Rundennamen der K.O.-Phase englisch (siehe P5). Begriffe HIGHSCORE, MAXIMUM!, SHOOTOUT bleiben englisch. |
| G-09 | Später kommen 501, Teams und freies Spiel dazu. Datenmodell und Code so anlegen, dass die Spielart (Highscore/501) und Teams sauber ergänzt werden können – aber in v2 **nicht** bauen. |

## 1. Design-System (gilt überall)

| ID | Vorgabe |
|---|---|
| D-01 | Dunkler Look, Chrom-Titel (Silber-Verlauf), Gold (#f4c52d) = „jetzt dran / wichtig“, LPD-Streifen Grün #0b5a1e · Gold #f4ad00 · Rot #d0103a. |
| D-02 | Schrift **Barlow Condensed** (lokal mitgeliefert), ein einheitlicher Neigungswinkel von 8° für schräge Elemente. |
| D-03 | Spieler, der dran ist: Nummer, Name, Punkte in Gold + goldene Hinterlegung (Tablet, Board-Monitor, Leinwand-Kacheln). |
| D-04 | Kundenlogo immer auf heller Fläche. LPD-Logo hell (weiße Schrift) auf dunklem Grund, dunkel auf hellem Grund. |
| D-05 | Hauptaktions-Buttons in **Gold mit dunkler Schrift** (z. B. EINTRAGEN, „Vorrunde beenden“, „Durchsage senden“). **Keine grünen Buttons mit schwarzer Schrift.** |
| D-06 | Kundenfarbe nur als Akzent; Hintergrund bleibt dunkel; zu dunkle Kundenfarben für Leuchten/Text automatisch aufhellen (Kontrastprüfung). |
| D-07 | Kein Sound im Spielbetrieb. Optional Sound nur für Siegerehrung/Finalstart (Schalter, Standard aus). |

Referenz-Vorschauen (Optik verbindlich, Code nicht übernehmen):
- Board-Monitor 22" hochkant: https://claude.ai/artifact/Y1ZgQr5MPEJHKizcFYMwFb (Variante B)
- Tablet: https://claude.ai/artifact/UbuBbeXqEEf6VPDP8AtpE7
- Spielbetrieb Tablet + Monitor (klickbar, inkl. neuer Eingabebereich): https://claude.ai/artifact/Bxz5CYe7nZvN4RfiATway3
- Leinwand Rangliste: https://claude.ai/artifact/Cxn62iuU1MSSgm1p9E7WTp
- Spieler-Import: https://claude.ai/artifact/UqucpgkAjcFc1eBWGAEooQ
- Turnierleitung Startseite: https://claude.ai/artifact/1WrHaxrisPx9xaWoChSuzZ
- K.O.-Runden + Leinwand + 65"-Rangliste: https://claude.ai/artifact/Qr8jZ1cHyLVLdixN2NEUx6
(Claude Code kann diese Links ggf. nicht öffnen → Thomas stellt bei Bedarf Screenshots bereit; die Texte hier sind maßgeblich.)

---

## Paket 1 – Fundament (Betrieb, Daten, Ausfallsicherheit)

| ID | Anforderung | Abnahme |
|---|---|---|
| P1-01 | Bestandsaufnahme: Architektur, Datenhaltung, SignalR-Verbindungen, Docker-Setup dokumentieren (`docs/v2-ist-stand.md`). Prüffragen: Liegt der Spielstand nur auf dem Server? Wird jede Eingabe sofort gespeichert? Verbinden Clients automatisch neu? Gibt es einen Zwischenspeicher am Tablet? | Dokument liegt vor, Thomas hat es gelesen. |
| P1-02 | Docker Desktop (Windows) startet mit Windows, Container mit automatischem Neustart; Daten in festem Ordner außerhalb des Containers. | Laptop neu starten → Turnierleitung ohne Eingriff erreichbar, Daten vorhanden. |
| P1-03 | Port **8080** (Doku korrigieren, alte Angabe 5289). Feste IP **192.168.0.10** für jeden Event-Laptop; Windows-Firewall-Freigabe dokumentiert. | Anleitung stimmt; Aufruf `http://192.168.0.10:8080` klappt. |
| P1-04 | Pro Laptop immer **genau ein aktives Event**. Anderes Event aktivieren nur mit Rückfrage; alte Events bleiben als Archiv. | Umschalten fragt nach; Archiv sichtbar. |
| P1-05 | **Event bereitstellen** (zu Hause): ein Klick exportiert das komplette Event (Einstellungen, Spieler, Teams, Logos, Welcome-Video) als eine Datei in den Google-Drive-Ordner „LPD Events“ (Drive für Desktop gleicht ab). | Datei erscheint im Ordner. |
| P1-06 | **Update + Events laden** am Laptop: Event aus dem Ordner laden, Anzeige „Stand: Datum, Uhrzeit“. Erneutes Laden bei Änderungen (Nachmeldungen am Vorabend) überschreibt nach Rückfrage. Jeder Laptop (auch Sandys/Ersatz) kann jedes Event spielen. | Event auf zweitem Laptop geladen und spielbar. |
| P1-07 | Nach dem Event: Ergebnisse + Kunden-PDF in den Drive-Ordner; Upload sobald der Laptop online ist (vorher lokal in Warteschlange). | Offline beendet → später online → Dateien im Ordner. |
| P1-08 | **Backup** alle paar Minuten automatisch auf fest steckenden USB-Stick. „Backup laden“ am Ersatzlaptop stellt alles inkl. Boardzuordnungen wieder her. Backup-Stand in der Kopfzeile der Turnierleitung. | Laptop A aus, Laptop B + Stick → Spiel läuft weiter. |
| P1-09 | Automatisches **Neuverbinden ohne Zeitlimit** für alle Clients (heute gibt der Board-Monitor nach ca. 45 s ohne WLAN auf). Gleiche Boardnummer bleibt erhalten. | WLAN 5 min trennen → Geräte verbinden sich selbst wieder. |
| P1-10 | **Netzausfall am Tablet:** weiterspielen, Würfe zwischenspeichern („Offline – 4 Würfe warten“), danach nachsenden; Monitore/Leinwand holen auf. | Tablet offline 3 Würfe → online → alles korrekt übernommen. |
| P1-11 | Ohne aktives Event zeigen Geräte „Kein Event aktiv – bitte Turnierleitung“ bzw. „Warte auf Turnierleitung …“ und verbinden sich automatisch. | Laptop ohne aktives Event → Hinweis auf allen Geräten. |
| P1-12 | Branding (Logo, Farben) wird **live** übernommen; heute lädt der Board-Monitor es nur beim Start. | Logo im Event ändern → alle Monitore zeigen es ohne Neuladen. |
| P1-13 | Barlow Condensed, Videos (Clips, Siegersheets, Welcome) und Logos lokal ausliefern; Vorladen auf den Sticks beim Start. | Netzwerk ohne Internet → alles erscheint korrekt. |

## Paket 1b – Event vorbereiten & Import (Workflow 1)

| ID | Anforderung | Abnahme |
|---|---|---|
| P1-20 | Event anlegen: Eventname, Kunde, Datum, Ort/Halle, Kundenlogo, Kundenfarbe (Vorschlag automatisch aus dem Logo), optional Notiz fürs Team. Kein Ansprechpartner. | Felder vorhanden. |
| P1-21 | Einstellungen: Spielart (v2: Highscore; 501 nur vorbereitet), **Runden als freie Zahl**, gewertete Spiele (z. B. beste 3), Finalplätze, Team-Wertung (Summe aller Würfe des Teams – nur vorbereitet), Board-Monitore ja/nein, Haltezeit Siegerehrung (Standard 60 s), Leinwand-Startwerte (hell/dunkel, Tempo, Schrittweite), Sound (Standard aus). **Alles im Turnier änderbar**, Finalplätze bis Finalstart. | Werte im laufenden Event änderbar. |
| P1-22 | Spieler-Import Excel/CSV (Komma oder Semikolon), Spalten frei zuordnen, Teams mitimportieren, keine doppelten Namen. Zusammenfassung „Datei: 73 Zeilen → 73 importiert, 0 übersprungen“, übersprungene Zeilen mit Grund. Gesamtzahl Spieler/Teams immer sichtbar. Nachrücker jederzeit eintragbar. Doppelte Namen in der Datei: der erste wird übernommen, weitere übersprungen und in der Zusammenfassung mit Grund aufgeführt. Teams-Spalte wird mit eingelesen und gespeichert; alles Weitere zu Teams kommt später (Teams nicht in v2). | Kundenliste mit 73 Zeilen → Zusammenfassung stimmt. |
| P1-23 | Boards: nur Anzahl (Board 1 … n), vor Ort änderbar. Stick→Board-Zuordnung **jedes Event neu** (kein „vom letzten Event übernehmen“). | – |

## Paket 1c – Aufbau vor Ort & Geräte (Workflow 2)

| ID | Anforderung | Abnahme |
|---|---|---|
| P1-30 | TV-Sticks (Fully Kiosk, feste Startadresse) melden sich als **„Neuer Monitor“**; Thomas vergibt Boardnummern in der Turnierleitung. Drehung pro Gerät **einstellbar** (Sticks drehen selbst, kein festes `&rotate=cw`). | Neuer Stick erscheint, Nummer vergeben, Bild richtig. |
| P1-31 | **Tablet-Kopplung ohne QR-Code:** Icon „LPD Turnier“ (fest auf 192.168.0.10:8080) → Ziffernfeld „Welches Board?“ → automatisch im aktiven Event. Board belegt → „Board 3 ist schon belegt – übernehmen?“. Der QR-Code-Weg (Änderungsliste Nr. 8) entfällt. | Tablet in < 10 s an Board gekoppelt. |
| P1-32 | Geräteübersicht: jedes Board mit Monitor/Tablet grün/rot, Verbindungsqualität, Protokoll der Abbrüche. | Stick abziehen → rot + Protokolleintrag. |
| P1-33 | Ersatzgeräte: anderes Tablet → Board wählen, übernehmen → laufendes Spiel erscheint. Ersatz-Stick → zuweisen → zeigt sofort laufendes Spiel. | Tausch mitten im Spiel ohne Datenverlust. |

---

## Paket 2 – Spielbetrieb am Board: Tablet + Board-Monitor (Workflow 3)

### Tablet (Lenovo Tab M10 3rd Gen, 10,1", 1920 × 1200, hochkant, Layout-Basis 800 × 1280)

| ID | Anforderung | Abnahme |
|---|---|---|
| P2-01 | **Eine** Tablet-Ansicht für alle Events (mit und ohne Board-Monitore). Oben Anzeige inkl. Animationen, unten Eingabe. | – |
| P2-02 | Logos: Kundenlogo und LPD-Logo immer sichtbar. Auswahl/Korrektur/Siegerehrung: Kopfzeile Kundenlogo · Eventname · LPD-Logo. Im Spiel: Logos links/rechts in der Zeile „BOARD 1 · Runde 3/5“. | – |
| P2-03 | **Neuer Eingabebereich:** oben eine Zeile **KORRIGIEREN** (links, ca. 150 px, neutral grau/silber umrandet) · **Punkte-Anzeige** (Mitte) · **EINTRAGEN** (rechts, ca. 250 × 92 px, Gold-Verlauf, dunkle Schrift, ✓-Symbol). Darunter Ziffernfeld **4 × 3**: `7 8 9 ⌫ / 4 5 6 C / 1 2 3 0`. Tastenhöhe wie bisher (nie verkleinern). **Keine Schnellwahl-Zeile** (0/26/41/… entfällt). | Vergleich mit Vorschau „Tablet-Eintragen-Neu“ / „-Farben“ (Variante A). |
| P2-04 | Gewonnener Platz geht in die Spielerliste: Richtwerte 6 Spieler ≈ 77 px Zeile / 43 px Name, 10 Spieler ≈ 56 px / 31 px. Ab 8 Spielern kompakt: Board/Runde + Name des aktiven Spielers (gold) in einer Zeile, Punkte-Box flacher. **Keine zwei Spalten.** | 10 Spieler mit langen Namen gut lesbar. |
| P2-05 | Ziffernfeld blockiert **nie** (auch nicht während Hochzählen/Clip). | Schnell hintereinander eingeben → nichts geht verloren. |
| P2-06 | Neues Spiel: oben Wurfreihenfolge (nummeriert, max. 10, je Spieler ✕ zum Entfernen), darunter Volltextsuche (ab 2 Buchstaben, Vor-/Nachname/Team), darunter Teilnehmerliste. Antippen = hinzufügen, Reihenfolge des Antippens = Wurfreihenfolge. Keine Pfeile. Ausgegraut: schon gewählt oder in laufendem Spiel an anderem Board. Neue Spieler legt nur die Turnierleitung an. | – |
| P2-07 | Button **„Gleiche Spieler“** (wenn vorheriges Spiel am Board): übernimmt alle Spieler des letzten Spiels in **zufälliger neuer Reihenfolge**, startet aber nicht. Danach rausnehmen/dazunehmen, dann „Spiel starten“. | – |
| P2-08 | Eingabe: pro Aufnahme die Summe der 3 Darts → EINTRAGEN → „+Wurf“, Punkte zählen hoch (ca. 0,8 s), kurz stehen, nächster Spieler automatisch. Ab 100 erst Clip (P2-20). | – |
| P2-09 | **Korrigieren:** Verlauf aller Eingaben, neueste oben, Kopfleiste „Runde · Spieler · Wurf“, Hinweis „Neuester Wurf oben“; neuester mit „letzter“, geänderte mit „geändert“ markiert. Eintrag antippen → neue Zahl → Übernehmen. Ohne Clip; wer dran ist, ändert sich nicht. **Kein „Würfe tauschen“.** | – |
| P2-10 | Spieler geht weg: wird mit 0 durchgedrückt, ohne Markierung/Animation. | – |
| P2-11 | **Spiel abbrechen** (nur während des Spiels): langer Druck (ca. 1,5 s) aufs LPD-Logo, Logo füllt sich rot, dann „Weiterspielen / Spiel abbrechen“. Abbruch **löscht das Spiel komplett** (keine Rangliste, Spieler sofort frei, Auswahl leer; „Gleiche Spieler“ übernimmt die Spieler des gelöschten Spiels). Monitor → Welcome-Loop. Auf der Siegerehrung kein Abbruch. | – |
| P2-12 | Nach dem letzten Wurf: **Siegerehrung** auf Tablet und Monitor. Sieger direkt unter „Siegerehrung“ (bei wenigen Spielern weiter oben). Aufbau von unten nach oben (letzter Platz zuerst), kurzer Delay, Sieger gold und fetter. | – |
| P2-13 | Unter der Siegerehrung am Tablet nur **„Spiel beenden“** und **„Nochmal korrigieren“** (gleicher Verlauf, danach zurück zur Siegerehrung). | – |
| P2-14 | „Spiel beenden“: erst jetzt in die Rangliste und Leinwand-Aktualisierung. Danach korrigiert nur noch die Turnierleitung. Tablet → „Neues Spiel“. | – |
| P2-15 | Kein Spiel-Limit pro Spieler. | – |
| P2-16 | Tablet-Knopf **„Nochmal zeigen“** (ca. 30 s nach einem Wurf ab 100 sichtbar): spielt die Clip-Animation am Board-Monitor erneut, Schlussbild ca. 5 s für Fotos; ändert keine Punkte/Rangliste/Rekorde, keine Laufzeile. Später: Abspiel-Symbol im Korrektur-Verlauf bei Würfen ab 100. | – |
| P2-17 | **Entschieden 15.11.2026:** Die Highscore-Animation läuft **auch auf dem Tablet** – im oberen Anzeigebereich, gleichzeitig mit dem Board-Monitor (100–179 und eigener 180-Clip, gleiche Einblendungen). Das Ziffernfeld bleibt dabei sichtbar und bedienbar (P2-05). Korrekturen lösen auch am Tablet keinen Clip aus. | Wurf 140 → Clip auf Monitor und Tablet, Eingabe des nächsten Wurfs währenddessen möglich. |

### Board-Monitor (22", hochkant, 1080 × 1920, Xiaomi TV Stick 4K Gen 2 + Fully Kiosk)

| ID | Anforderung | Abnahme |
|---|---|---|
| P2-30 | Spielansicht nach Entwurf „LPD Live-Monitor“ (Variante B): Eventname einzeilig Chrom (= Laufzeilen-Platz, P3), Kundenlogo auf heller Fläche 400 × 128 (Option „Logo füllt Fläche“), Board-Nummer, aktiver Spieler, große Punkte-Box mit umlaufendem Licht und „+Wurf“, Liste in Wurfreihenfolge, max. 10 Spieler ohne Scrollen. | Vergleich mit Vorschau. |
| P2-31 | Ruhezustand / zwischen Spielen: **Welcome-Video-Loop** (P4-30). Nach „Spiel beenden“ bleibt die Siegerehrung stehen bis zum nächsten Spielstart, spätestens nach Haltezeit (Standard 60 s) → Welcome-Loop. | – |
| P2-20 | **Highscore-Clips** ersetzen das Konfetti (heute `useThrowConfetti` in `frontend/src/LiveGameView.tsx`, Lottie `confetti.json`). Clip **100–179** und eigener Clip **180**. Video als `<video muted playsInline>`, Ende über `ended` + Sicherung nach 4 s, beim Start vorladen, bei Fehler ohne Clip weiter. Hochzählen (`useCountUp`) und Pokal (`useGameFinishedTrophy`) warten auf das Clip-Ende; während des Clips eintreffende SignalR-Stände in Warteschlange, danach in Reihenfolge. Nie zwei Dinge gleichzeitig, laufender Clip wird nie abgebrochen. Korrektur löst keinen Clip aus. Leinwand zeigt keinen Clip. | Testfälle siehe Funktionsbeschreibung (99 kein Clip, 100/180 Clip, Eingabe/Korrektur während Clip, Siegwurf, zwei Boards gleichzeitig, Datei fehlt, erster Wurf nach Neustart, Dauerbetrieb Stick). |
| P2-21 | Clip-Inhalt: Video enthält nur Hintergrund + Schriftzug + Effekte (1080 × 1920). Die Software blendet darüber ein: drei LPD-Flights (oben, von Anfang an), Eventname 2-zeilig Chrom (klein), **Spielername**, **Punktzahl** groß gold (bei 180: „MAXIMUM!“ statt Punktzahl, Name + MAXIMUM! erst nach dem Einschlag), Kundenlogo klein auf heller Fläche. Gewichtung: Punkte/MAXIMUM! > Name > Eventname > Logo. Weiche Überblendung zurück (~0,3 s). | Clip-Dateien: `LPD-Clip-100plus-v8-nur-Effekte-1080x1920.mp4` (2 s), `LPD-Clip-180-v2-nur-Effekte-1080x1920.mp4` (3 s) – von Thomas ins Repo. |
| P2-22 | **Rekord-Einblendung** im Eventnamen (alle Monitore, alle Tablets, Leinwand): „Neuer höchster Wurf“ / „Neues höchstes Ergebnis“ / „180!“ → Name + Punkte → Lobwort (Mega!, Stark!, Lecker Darts! …), ca. 3–4 s, 3 Wiederholungen, dann Eventname. Regeln: höchster Wurf ab 90; höchstes Ergebnis erst nach Boardanzahl × 2 Spielen; nur echte Rekorde (übertreffen); jede 180. Am werfenden Board erst Clip, dann Rekord. Tablet: Rekord-Leiste ersetzt kurz die oberste Zeile (aktiver Spieler bleibt in der Liste sichtbar). Rangfolge gegenüber Technik/Durchsage siehe P3-10. | – |

---

## Paket 3 – Turnierleitung während des Events (Workflow 4)

| ID | Anforderung | Abnahme |
|---|---|---|
| P3-01 | Ziel: Laptop muss in der Vorrunde praktisch nicht bedient werden. Rangliste und Leinwand aktualisieren sich **vollautomatisch** (kein „Scoreboard aktualisieren“ mehr). | Vorrunde läuft 1 h ohne Eingriff. |
| P3-02 | **Startseite** = Live-Übersicht vor den bestehenden Reitern: Kopfzeile (Event, Spieler, Boards, Spiele, Laufzeit, Backup-Stand, LPD-Logo); Meldungen nur bei Bedarf (mit „Erledigt“); Board-Kacheln mit Status, Monitor/Tablet grün/rot; Live-Rangliste mit Finallinie und Rekorden; unten Nachrücker, Spieler & Spiele, Einstellungen, Leinwand-Steuerung (langsamer/schneller, Pause, hell/dunkel), Button **„Vorrunde beenden → K.O.-Runde“ (gold)**. | Vergleich mit Vorschau Startseite. |
| P3-03 | Keine Handy-Benachrichtigungen. | – |
| P3-04 | Korrektur beendeter Spiele nur in der Turnierleitung. | – |
| P3-10 | **Laufzeile** auf allen Board-Monitoren (Eventname-Zeile) und Tablets (oberste Zeile), **nicht** auf der Leinwand. Feste Rangfolge: **1. Technik-Meldung** (rot, z. B. „Turnierleitung bitte zu Board 4“ bei Gerät getrennt; bleibt bis gelöst/quittiert, wird nie überschrieben) · **2. Durchsage** · **3. Rekorde** (warten während Durchsage). Sonst: **Eventname steht still** (Chrom, zentriert); nur Meldungen laufen, danach blendet der Eventname wieder ein. | Szenario aus der Startseiten-Vorschau nachstellen. |
| P3-11 | Laufgeschwindigkeit **fest in Pixel pro Sekunde** (gleich für alle Meldungen, unabhängig von der Textlänge), Startwert ca. 120 px/s, beim Stick-Test feinjustieren. | Kurze und lange Meldung gleich schnell. |
| P3-12 | **Durchsage-Feld** auf der Startseite: Freitext + Vorlagen „Ende der Vorrunde um … Uhr“ und „Ende der Vorrunde in … Minuten“ (mit Countdown); Wahl „3× durchlaufen“ oder „Stehen lassen bis Beenden“; „Durchsage senden“ (gold); laufende Durchsage mit „Beenden“. Weitere Vorlagen später. | – |

---

## Paket 4 – Leinwand (Vorrunde) und Welcome

| ID | Anforderung | Abnahme |
|---|---|---|
| P4-01 | Leinwand per Mini-PC (HDMI) oder Laptop-Ausgang, 1920 × 1080; dunkel mit Umschalter Hell (Beamer); Finalplätze pro Event; Finallinie. | – |
| P4-02 | **Rangliste zweispaltig** (Design „Variante C“, für 65"-TV quer): links Plätze 1–12, rechts 13–24; pro Zeile nur **Platz · Name · Gesamt · beste 3 (gold) · klein grau „X Spiele“**. Kräftige Spaltenköpfe mit Goldlinie, Titel „RANGLISTE VORRUNDE“ mit LPD-Logo (hell) links, Kundenlogo rechts. Keine Dauer-Lichteffekte. | Vergleich mit Board „Rangliste-65-C“ in der K.O.-Vorschau. |
| P4-03 | Schrittweises Scrollen durch beide Spalten (Schrittweite z. B. 4 → links 5–16, rechts 17–28); Tempo 2–15 s und Schrittweite einstellbar, jederzeit schneller/langsamer/Pause; am Ende Stopp, Neustart bei Platz 1. | – |
| P4-04 | Spotlight-Animation nur bei **Aufstieg in die Finalplätze**; Rekord-Einblendung (P2-22). | – |
| P4-05 | Falls statt 65" quer ein 43" hochkant gekauft wird: einspaltige Variante mit ca. 14–16 Zeilen (Layout dann mit Thomas abstimmen). | – |
| P4-30 | **Welcome-Video** (Leinwand quer + Board-Monitore hochkant) wird von der Software aus den Event-Daten **erzeugt** (Eventname, Datum, Kundenlogo, Kundenfarbe, Regeln: Spielart, Runden × Darts, so oft du möchtest, beste X zählen, K.O.-Modus, Finalplätze; Seite 1 Willkommen, Seite 2 „Dein Weg ins Finale“) beim Bereitstellen (P1-05); vor Ort per Knopf neu erzeugbar (Richtwert 1–2 min). Wiedergabe als Video-Loop. Vorbild: Thomas' Welcome-Video. **Hinweis:** Gestaltung im Detail noch mit Thomas abstimmen (Vorschau vor Umsetzung). | Video passt zu den Event-Einstellungen. |
| P4-31 | Leinwand-Ansicht „Welcome“ zu Beginn des Events. | – |

---

## Paket 5 – K.O.-Runden / Finale (Workflow 5)

| ID | Anforderung | Abnahme |
|---|---|---|
| P5-01 | Einrichten pro K.O.-Runde: Finalspieler (vorab im Event, hier änderbar, z. B. 16 → 8), Spiele in Runde 1, Boards, Runden pro Spiel, **„Weiter pro Spiel“ nur als Zahl** (1, 2, 3), Modus Best of 1/3/5 (1 gegen 1), Haken „Spiel um Platz 3“. | Vergleich mit K.O.-Vorschau. |
| P5-02 | Spieler pro Spiel = Finalspieler ÷ Spiele. **Durchgänge:** so wenige wie nötig, gleichmäßig (8 Spiele an 5 Boards = 4 + 4; 10 an 4 = 4 + 3 + 3); Anzeige im Baum und auf der Leinwand. | – |
| P5-03 | **Setzliste:** Gruppen ab 3 Spielern der Reihe nach (16 in 4 Gruppen: 1/5/9/13, 2/6/10/14 …; 8 in 2: 1/3/5/7, 2/4/6/8). 1 gegen 1 von außen nach innen (1–8, 2–7, 3–6, 4–5). | Prüfbeispiele stimmen. |
| P5-04 | **Turnierbaum** komplett bis zum Finale erzeugen und zuerst zeigen. Alles manuell änderbar. ⇄ am Spieler öffnet Menü: **„Tauschen mit …“** (zweiten Spieler in beliebigem Spiel der Runde antippen) oder **„Ersetzen …“** (Liste der Nachrücker ab Platz N+1 mit Suche; nächster logischer ist als „Vorschlag“ markiert und vorausgewählt; Thomas kann frei wählen). Manuell geänderte Spieler markiert („getauscht“/„ersetzt“). | – |
| P5-05 | **Boards zuweisen** pro Spiel (Standard mittig; Finale am mittleren Board), Durchgang je Spiel. | – |
| P5-06 | **Rundennamen englisch**, nach Spielerzahl der Runde (auch bei Gruppen à 3/4): Round of 32 · Round of 24 · Round of 16 · Quarter-Final · Semi-Final · 3rd Place · Final (krumme Zahlen „Round of N“). Überall gleich (Turnierleitung, Tablet, Monitor, Leinwand, PDF). Name je Runde von Hand änderbar. | – |
| P5-07 | **Freigabe:** Nach Rundenende trägt die Software die Weitergekommenen ein und verteilt vor; Tablets/Monitore zeigen „Nächste Runde wird vorbereitet …“. Thomas plant (Boards, Spieler, Leinwand-Haken) und tippt **„<Runde> freigeben“** – erst dann erscheinen die Spiele auf Tablets/Monitoren. Bei mehreren Durchgängen Freigabe je Durchgang. Nach Freigabe änderbar, solange nicht gestartet (Tablet zeigt kurz „Geändert“); laufende Spiele gesperrt. | Kunden sehen kein Hin- und Herwandern. |
| P5-08 | Tablet: Finalspiele am Board **voreingestellt**, Mitarbeiter drückt nur „Spiel starten“. | – |
| P5-09 | **Gleichstand** (auch in Best of): immer 3-Dart-Shootout, nur wenn entscheidend; bei erneutem Gleichstand weiteres Shootout. Monitor zeigt „SHOOTOUT“, Tablet erfasst je Spieler eine Aufnahme. | – |
| P5-10 | Board-Monitor im K.O.: oben Runde + Spiel (z. B. „Semi-Final · Spiel 2“), bei Best of Satzstand („1 : 0“), im Finale groß „FINAL“. | – |
| P5-11 | **„Leinwand zeigt“** – nie automatischer Wechsel, genau eine aktive Ansicht, sanfte Überblendung: **Welcome · Rangliste Vorrunde · Turnierbaum · Spiele · Siegersheet**. Bei „Spiele“ pro Spiel Haken „Leinwand“ (keine Block-Schnellknöpfe). | – |
| P5-12 | **Leinwand „Spiele“ live:** Kacheln teilen sich automatisch (1 groß, 2 nebeneinander, 4 als 2 × 2, 6 als 3 × 2, 8 als 4 × 2). Live-Scores bei jeder Aufnahme, Spieler am Zug gold hinterlegt, „Runde 2/5“, bei Best of „Satz 2 · 1 : 0“, bei Gleichstand „SHOOTOUT“. Wurf ab 100: kurzer Akzent in der Kachel („+140“ leuchtet gold auf, bei 180 „180!“ stärker), kein Vollbild-Clip. | – |
| P5-13 | **Spielende:** Spieler absteigend sortiert (kurze Umsortier-Animation), Weitergekommene/Gewinner mit kleinem 🏆 hinter dem Namen (überall einheitlich). Beendete Spiele bleiben mit Endstand stehen, bis umgeschaltet wird (Fotos). Platz 3 und Finale nacheinander oder parallel (beide angehakt → geteilt). | – |

---

## Paket 6 – Siegerehrung und Abschluss (Workflow 6)

| ID | Anforderung | Abnahme |
|---|---|---|
| P6-01 | **Siegersheet** als 5. Leinwand-Ansicht (Thomas schaltet von Hand ein) **und** auf allen Board-Monitoren (hochkant). Technik wie Clips: Hintergrund-/Effektvideo + Einblendung von Kundenlogo, LPD-Logo, Eventname (2-zeilig Chrom), „DIE SIEGER“ (gold) und Namen auf den Podesten durch die Software. | Vergleich mit den 4 freigegebenen Videos. |
| P6-02 | Ablauf (ca. 10 s): dunkle Bühne mit warmem Bokeh · Podeste Gold/Silber/Bronze wachsen nacheinander **von unten** (3 → 2 → 1, Nachfedern), warmer Spot pro Platz, danach steigt der Name ein · Platz 1: Lichtblitz, Pokal, Funkenfontänen links/rechts (ca. 3 s), Goldregen · danach ruhiges Standbild (Fotos), Goldregen schwächer, Glanz läuft immer wieder über die Namen (auch auf Silber sichtbar). Keine Strahlenkränze/gezeichneten Lichtkegel, keine Flights im Hintergrund. | – |
| P6-03 | Ohne Spiel um Platz 3: **zwei Dritte** (beide Semi-Final-Verlierer) untereinander auf Podest 3. | – |
| P6-04 | Board-Monitore: Siegersheet ersetzt nach dem Event das Ruhebild; startet am Tablet ein freies Spiel (später), übernimmt das Spiel den Monitor, danach zurück. In der Turnierleitung jederzeit abschaltbar (→ Welcome/aus). | Siegersheet bleibt nie „hängen“. |
| P6-05 | Video-Dateien: `LPD-Siegersheet-Leinwand-Vorschau-v3.mp4`, `LPD-Siegersheet-Leinwand-zwei-Dritte-v3.mp4`, `LPD-Siegersheet-Monitor-hochkant-v3.mp4`, `LPD-Siegersheet-Monitor-hochkant-zwei-Dritte-v3.mp4` (aktuell mit Namen eingebrannt = Vorschau). Für die Software: Fassung **ohne** Text/Logos rendern (Skript `Siegersheet-render_v3.py`, Schalter ORI=L/P, P3=1/0), Einblendungen per Software. | – |
| P6-10 | **Kunden-PDF** auf Knopfdruck nach dem Event, Dateiname z. B. `Darts-Night-2026_Ihr-Abend.pdf`, Ablage im Drive-Ordner (P1-07). Formulierungen **beibehalten**. | Vergleich mit freigegebenem Muster. |
| P6-11 | Seite 1 (dunkel): Kundenlogo (helle Fläche) + LPD-Logo; **„Was für ein Abend!“** groß gold; darunter Original-Claim **„Emotions for all“** (roter Schriftzug); Eventname groß; Kunde · Datum · Ort; Siegertreppchen; Zeile „X Teilnehmer · Y Spiele · Z× 180 · Danke für einen großartigen Abend!“. | – |
| P6-12 | Innenseiten hell (druckfreundlich). Kopfzeile: Kundenlogo links · Eventname + „Was für ein Abend!“ Mitte · LPD-Logo rechts. Fußzeile: LPD-Streifen als Linie, drei Farbpunkte, „Let’s Play Darts“ fett + „Emotions for all“ rot kursiv + letsplaydarts.de, Seitenzahl im goldenen Kästchen. | – |
| P6-13 | Kapitel: **„Der Weg zum Pokal“** (Round-of-Gruppenkarten mit Punkten; 1-gegen-1-Karten mit Satzstand und Einzelsätzen; **Gewinner immer oben** mit 🏆; Final hervorgehoben) · **„Die großen Momente“** (Kacheln: Teilnehmer, Spiele, Aufnahmen, 180er, Ø Spiel, Boards; höchstes Ergebnis; höchster Wurf; Liste aller 180er mit Board und Uhrzeit) · **„Alle Heldinnen und Helden“** (Rangliste: Platz, Name, Gesamt, beste 3, Anzahl Spiele; Finalplätze gelb; kräftige rote Finallinie mit Hinweiszeile; automatisch mehrseitig) · **„Jeder Wurf zählt“** (alle Spiele jedes Spielers alphabetisch nach Nachname, in Spielreihenfolge, gewertete gold, **mehrzeilig** bei vielen Spielen – z. B. 35 Spiele; unter dem Namen „X Spiele“; Seitenumbruch nach Platzbedarf). Bei Team-Events später zusätzlich Team-Wertung. | Muster mit 48 Spielern inkl. einem mit 35 Spielen reproduzierbar. |
| P6-14 | Uhrzeit und Board jeder Aufnahme werden gespeichert (nötig für 180er-Liste und Bericht). | – |

---

## Nicht in v2 (spätere Pakete – nichts davon bauen, aber nicht verbauen)
- **501**: eigener Ablauf, eigene Board-Monitor-Ansicht – wird separat abgestimmt.
- **Teams**: Reihenfolge der Teams und der Spieler im Team (bis 10), Team-Wertung = Summe aller Würfe; offene Fragen (Team gegen Team an einem Board? Wechsel pro Aufnahme?).
- **Freies Spiel**: am Tablet ohne Rangliste, Spielart frei; nur solange Laptop und Netz laufen; offen: Spieler frei eintippen? Anzeige am Monitor?
- Anzeigesprache Englisch als Event-Einstellung.
- Konfetti als alternative Siegersheet-Variante; Flights im Welcome-Video.
- Dunkle Variante des LPD-Logos für helle Leinwand.

## Vor bzw. parallel zur Umsetzung durch Thomas
- [ ] Mit Sandy abstimmen (kein paralleles Arbeiten, Mittesten).
- [ ] Repo auf **privat** stellen (Empfehlung).
- [ ] Freigabe: v1 taggen, Branch `v2` anlegen, `CLAUDE.md` und `docs/` ins Repo.
- [ ] Dateien bereitstellen (nach `docs/assets/` bzw. `frontend/public/media/`): 2 Clips, 4 Siegersheet-Videos (Vorschau), Welcome-Video als Vorbild, LPD-Logo hell/dunkel, „Emotions for all“-Schriftzug, Barlow-Condensed-Schriftdateien, PDF-Muster, Render-Skript.
- [ ] Hardware: Netzwerk-Test-Set (siehe „Netzwerk-Testset-und-Testplan“), Mini-PC für Leinwand, Entscheidung 65" quer vs. 43" hochkant.
- [ ] Stick-Test: Videos auf Xiaomi-Stick + Fully Kiosk (Hochkant-Ausgabe, Autoplay ohne Ton, Dauerbetrieb, Temperatur, 4K vs. 1080p).
- [x] Geklärt 15.11.: Highscore-Animation auch auf dem Tablet (P2-17); Teams kommen später, Import nur mit Basis-Regeln (P1-22).
- [ ] Klären: Datenschutz Google Drive (Workspace mit AV-Vertrag vs. Google One).
- [ ] Clips/Siegersheets mit Barlow statt Ersatzschrift neu rendern, sobald die Schrift vorliegt.

---

## Entscheidungen 15.11.2026

Antworten von Thomas auf die Fragen aus der Bestandsaufnahme (`docs/v2-ist-stand.md`). Die IDs E-xx werden in `docs/v2-status.md` mitgeführt; das zuständige Paket steht in Klammern.

| ID | Thema | Entscheidung |
|---|---|---|
| E-01 | X01 und Teams (bereits im Code) | Bisher auf keinem Event genutzt. **Im Code lassen, in der Oberfläche ausblenden** (Teams-Reiter, X01-Auswahl, Team-Rangliste), z. B. hinter einem Schalter in den Einstellungen. In v2 nicht erweitern und nichts davon kaputt machen – beides wird später in eigenen Paketen neu abgestimmt. (P1) |
| E-02 | Tablet ändert Turnier-Einstellungen / legt Turniere an | **Am Tablet entfernen.** Einstellungen und neue Spieler nur in der Turnierleitung. (P2) |
| E-03 | Turniere pro Event | **Genau ein Turnier pro Event.** (P1) |
| E-04 | Board-Namen, Greenscreen, `?monitor=` | Vorerst **alles behalten**, nichts entfernen. Entscheidung später. |
| E-05 | Tablet-PIN 4719 | **Entfällt** mit P1-31 (Icon + Boardnummer). (P1c) |
| E-06 | P2-14: „Spiel beenden“ wird nie gedrückt | Das Spiel wird **automatisch beendet**, sobald am selben Board ein neues Spiel gestartet wird, **spätestens nach 5 Minuten**. In der Turnierleitung erscheint der Hinweis „Board X: automatisch beendet“. (P2) |
| E-07 | P2-31: Beginn der Haltezeit | Die Haltezeit beginnt mit **„Spiel beenden“** bzw. dem automatischen Beenden (E-06). (P2) |
| E-08 | P5-03/P5-04: Setzliste im Baum | Paarungen 1–8, 2–7, 3–6, 4–5 wie beschrieben, aber **im Baum so platziert wie bisher im Code**: 1 und 2 in verschiedenen Hälften, Reihenfolge 1–8, 4–5, 2–7, 3–6. Ziel: Beste treffen sich möglichst spät. (P5) |
| E-09 | P5-09: Gleichstand in Gruppen | **Shootout auch bei Gleichstand an der Weiterkommens-Grenze** in Gruppen. Kein Entscheiden von Hand mehr. (P5) |
| E-10 | P1-02: Datenordner | Fester Datenordner **`C:\LPD\daten`**. Bestehende Daten werden mit einem **Umzugsschritt** aus dem Docker-Volume übernommen (Ablauf vorher zeigen). (P1) |
| E-11 | P1-08: Backup-Stick | Der Stick bekommt auf allen Laptops den festen Laufwerksbuchstaben **`L:`**. Anleitung, wie man das in Windows einstellt, wird dokumentiert. (P1) |
| E-12 | P1-05/P1-07: Drive-Ordner | Die Software schreibt in den lokalen Drive-Ordner, Drive für Desktop lädt hoch, sobald online. Der **Pfad ist in den Einstellungen wählbar**, Standard: der übliche Google-Drive-Pfad **„Meine Ablage\LPD Events“**. (P1) |
| E-13 | Update-Knopf / Branch `main` | **`main` bleibt bis zur v2-Abnahme auf v1.** Event-Laptops ziehen weiter `main`. |
| E-14 | Videos | Ins Git unter **`frontend/public/media/`**, mit **Git LFS**. Das Repo wird privat gestellt (Thomas). (P1) |
| E-15 | Design-System | **Grundlage in Paket 1** (Farben, Schrift Barlow Condensed, CSS-Variablen); die einzelnen Ansichten werden im jeweiligen Paket umgestellt. Ziel ist der neue Look (Gold #f4c52d, Chrom, dunkel) statt Orange auf Braun. (P1 + jeweiliges Paket) |
| E-16 | Ablage `CLAUDE.md` | Im **Hauptordner** des Repos. |
| E-17 | Tablet-Fehler: Würfe verloren / doppelt | **Höchste Priorität in Paket 1.** Jeder Wurf bekommt eine **eindeutige Kennung** (Server erkennt Wiederholungen), das Tablet **rückt offline korrekt zum nächsten Spieler weiter**, abgelehnte Würfe werden **nie stillschweigend verworfen** (sichtbarer Hinweis). (P1) |
| E-18 | Neuverbinden und erster Abruf | Nach erfolgreichem Neuverbinden **holt jedes Gerät den aktuellen Stand neu**; der **erste Abruf beim Start wird wiederholt, bis er klappt**. (P1) |

Sicherung v1 (G-02): Tag `v1.0` und Branch `v1` auf Commit `9a6be3e`; gearbeitet wird auf Branch `v2`. Branch `v1` wird von Thomas auf GitHub geschützt.
