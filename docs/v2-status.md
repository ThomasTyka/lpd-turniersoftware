# Status v2 – Pflichtenheft-Punkte

Stand 15.11.2026 · Wird nach jedem Arbeitsschritt aktualisiert (CLAUDE.md, Regel 5).

**Status:** `offen` · `in Arbeit` · `erledigt` · `abweichend` (+ Begründung) · `Regel` (gilt dauerhaft, kein Bauauftrag)
**Bestand v1:** was der Code auf Tag `v1.0` dazu schon mitbringt (Details: `docs/v2-ist-stand.md`).

## 0. Grundregeln

| ID | Status | Bestand v1 / Bemerkung |
|---|---|---|
| G-01 | Regel | – |
| G-02 | in Arbeit | Branches `v1` und `v2` auf GitHub (Commit `9a6be3e`). Tag `v1.0` steht noch aus (legt Thomas auf GitHub an); Schutz für `v1` richtet Thomas ein. |
| G-03 | Regel | Abstimmung durch Thomas |
| G-04 | offen | Kein CDN, Lottie lokal; Barlow Condensed fehlt (Systemschrift/Bahnschrift). |
| G-05 | offen | Erfüllt bis auf Tablet-Warteschlange (E-17). |
| G-06 | offen | Jeder Wurf sofort in SQLite; Daten im Docker-Volume statt festem Ordner (E-10). |
| G-07 | Regel | Reiter vorhanden: Dashboard, Event, Boards, Spieler, Teams, Leinwand, Geräte, Turniere, Branding. |
| G-08 | offen | Texte deutsch; K.O.-Rundennamen bisher deutsch. |
| G-09 | offen | GameMode Highscore/X01 und Teams bereits vorhanden → ausblenden (E-01). |

## 1. Design-System

| ID | Status | Bestand v1 / Bemerkung |
|---|---|---|
| D-01 | offen | Heute Orange #ffad00 auf Braun #3a1f00. Grundlage in P1 (E-15). |
| D-02 | offen | Keine Barlow Condensed, kein einheitlicher Neigungswinkel. |
| D-03 | offen | Aktiver Spieler heute grüner Balken/helle Hinterlegung. |
| D-04 | offen | Kundenlogo heute direkt auf Kundenfarbe. |
| D-05 | offen | Hauptbuttons in Kundenfarbe. |
| D-06 | offen | Kontrastprüfung `ensureReadableText` vorhanden (hellt/dunkelt Text ab). |
| D-07 | offen | Kein Sound vorhanden. |

## Paket 1 – Fundament

| ID | Status | Bestand v1 / Bemerkung |
|---|---|---|
| P1-01 | in Arbeit | `docs/v2-ist-stand.md` erstellt; wartet auf „gelesen“ von Thomas. |
| P1-02 | offen | `restart: unless-stopped` ja; benanntes Volume statt `C:\LPD\daten` (E-10); Autostart nicht dokumentiert. |
| P1-03 | offen | Port 8080 im Code; Doku nennt 5289/5173; Firewall/feste IP nicht dokumentiert. |
| P1-04 | offen | Nur ein aktives Event, andere werden ohne Rückfrage deaktiviert; Status „Archiviert“ vorhanden. |
| P1-05 | offen | – (E-12) |
| P1-06 | offen | – |
| P1-07 | offen | – (E-12) |
| P1-08 | offen | – (E-11, Laufwerk `L:`) |
| P1-09 | offen | Neuverbinden nur ≈ 45 s; Boardnummer bleibt (Geräte-ID lokal gespeichert). E-18. |
| P1-10 | offen | Warteschlange vorhanden, aber Würfe gehen verloren / können doppelt zählen. **E-17, höchste Priorität.** |
| P1-11 | offen | „Kein aktives Event – wartet…“ für `?tablet=current` / `?boardmonitor=current`, Abfrage alle 10 s. |
| P1-12 | offen | Live nur auf der Leinwand (`brandingUpdated`); Monitor/Tablet nur beim Start. |
| P1-13 | offen | Logos/Lottie lokal; Barlow, Videos, Vorladen fehlen. |

## Paket 1b – Event vorbereiten & Import

| ID | Status | Bestand v1 / Bemerkung |
|---|---|---|
| P1-20 | offen | Name, Kunde, Datum, Ort, Logo, zwei Farben mit Vorschlag aus dem Logo; Notiz fehlt. |
| P1-21 | offen | Runden frei, „beste X“, im Turnier änderbar; Finalplätze, Haltezeit, Sound, Board-Monitore ja/nein, Leinwand-Startwerte fehlen. Spielart-Auswahl X01 ausblenden (E-01). |
| P1-22 | offen | CSV nur Komma, feste Spalten, Zähler ohne Gründe; kein Excel/Semikolon/Spaltenzuordnung/Teams. |
| P1-23 | offen | Boards aus geplanter Anzahl, änderbar; Kopplung pro Event. Board-Namen bleiben (E-04). |

## Paket 1c – Aufbau vor Ort & Geräte

| ID | Status | Bestand v1 / Bemerkung |
|---|---|---|
| P1-30 | offen | „Warte auf Zuweisung“ mit 4-stelligem Code + Zuweisung vorhanden; Drehung nur per `?rotate=`. |
| P1-31 | offen | Heute PIN 4719 + Zuweisung/QR; PIN entfällt (E-05). Übernahme serverseitig vorhanden. |
| P1-32 | offen | Online/offline-Liste; Verbindungsqualität und Protokoll fehlen. |
| P1-33 | offen | Übernahme möglich, Stand kommt vom Server. |

## Paket 2 – Spielbetrieb Tablet + Board-Monitor

| ID | Status | Bestand v1 / Bemerkung |
|---|---|---|
| P2-01 | offen | Eine Tablet-Ansicht vorhanden (anderes Layout). |
| P2-02 | offen | Nur LPD-Logo am Tablet. |
| P2-03 | offen | Ziffernfeld mit anderem Layout (inkl. „Rest“). |
| P2-04 | offen | – |
| P2-05 | offen | Pokal-Overlay überdeckt heute die Eingabe. |
| P2-06 | offen | Suche ja; beschäftigte Spieler ausgeblendet statt ausgegraut; Pfeil-Listen; Modus/Runden am Tablet → entfernen (E-02). |
| P2-07 | offen | „Spiel wiederholen“ mischt, startet aber sofort. |
| P2-08 | offen | Hochzählen 0,7 s vorhanden. |
| P2-09 | offen | Korrektur pro Spieler/Wurf, kein chronologischer Verlauf. |
| P2-10 | offen | Eingabe 0 möglich. |
| P2-11 | offen | Abbruch über Menü löscht das Spiel, Monitor → Ruhebild. |
| P2-12 | offen | Nur Pokal-Overlay. |
| P2-13 | offen | Heute „Neues Spiel / Spiel wiederholen / Startmenü“. |
| P2-14 | offen | Spiel zählt sofort mit letztem Wurf; Tablet kann beendete Spiele ändern. Automatisches Beenden: E-06. |
| P2-15 | offen | Kein Limit vorhanden (erfüllt, Prüfung bei Paketabschluss). |
| P2-16 | offen | – |
| P2-17 | offen | – |
| P2-20 | offen | Konfetti (`useThrowConfetti`), `useCountUp`, `useGameFinishedTrophy` vorhanden. |
| P2-21 | offen | – |
| P2-22 | offen | Nur 180-Einblendung auf der Leinwand. |
| P2-30 | offen | Großer aktiver Spieler + Liste in Wurfreihenfolge (andere Optik). |
| P2-31 | offen | Ruhebild Logo + QR; Haltezeit ab „Spiel beenden“ (E-07). |

## Paket 3 – Turnierleitung während des Events

| ID | Status | Bestand v1 / Bemerkung |
|---|---|---|
| P3-01 | offen | Rangliste/Leinwand aktualisieren bei Spielende automatisch (+ 15 s Abfrage). |
| P3-02 | offen | Dashboard mit Kennzahlen und Board-Übersicht. |
| P3-03 | offen | Keine Handy-Benachrichtigungen (erfüllt, Prüfung bei Paketabschluss). |
| P3-04 | offen | Turnierleitung kann korrigieren; Tablet derzeit auch. |
| P3-10 | offen | – |
| P3-11 | offen | – |
| P3-12 | offen | – |

## Paket 4 – Leinwand und Welcome

| ID | Status | Bestand v1 / Bemerkung |
|---|---|---|
| P4-01 | offen | Leinwand dunkel; kein Hell-Modus, keine Finallinie. |
| P4-02 | offen | Einspaltige Rangliste mit Spiel-Spalten. |
| P4-03 | offen | Seitenweises Blättern, Pause, Tempo per Tastatur. |
| P4-04 | offen | Zeilen-Animation bei Platzwechsel; kein Spotlight. |
| P4-05 | offen | – |
| P4-30 | offen | – |
| P4-31 | offen | – |

## Paket 5 – K.O.-Runden / Finale

| ID | Status | Bestand v1 / Bemerkung |
|---|---|---|
| P5-01 | offen | Teilnehmerzahl, Best of (ungerade), Gruppen mit „Weiter pro Gruppe“; Platz 3 immer. |
| P5-02 | offen | Durchgänge fehlen. |
| P5-03 | offen | Setzliste und Gruppen-Streifen vorhanden; Platzierung im Baum bleibt (E-08). |
| P5-04 | offen | Baum entsteht rundenweise; Ersetzen per Nachrücker-Liste vorhanden, Tauschen fehlt. |
| P5-05 | offen | Board pro Paarung manuell. |
| P5-06 | offen | Rundennamen deutsch, nur Zweierpotenzen. |
| P5-07 | offen | – |
| P5-08 | offen | – |
| P5-09 | offen | Gleichstand per Hand; künftig Shootout auch in Gruppen (E-09). |
| P5-10 | offen | – |
| P5-11 | offen | Fixierte Szene; Baum/Podest als eigene URLs. |
| P5-12 | offen | Szene „Boards“ mit Kacheln. |
| P5-13 | offen | – |

## Paket 6 – Siegerehrung und Abschluss

| ID | Status | Bestand v1 / Bemerkung |
|---|---|---|
| P6-01 | offen | Einfaches Podest (`?siegerehrung=`). |
| P6-02 | offen | – |
| P6-03 | offen | Heute nur Sieger des Spiels um Platz 3. |
| P6-04 | offen | – |
| P6-05 | offen | – |
| P6-10 | offen | – |
| P6-11 | offen | – |
| P6-12 | offen | – |
| P6-13 | offen | – |
| P6-14 | offen | Keine Uhrzeit pro Aufnahme gespeichert. |

## Entscheidungen 15.11.2026 (E-xx)

| ID | Paket | Status | Bemerkung |
|---|---|---|---|
| E-01 | P1 | offen | X01/Teams ausblenden per Schalter |
| E-02 | P2 | offen | Einstellungen/Turnier anlegen am Tablet entfernen |
| E-03 | P1 | offen | Genau ein Turnier pro Event |
| E-04 | – | Regel | Board-Namen, Greenscreen, `?monitor=` behalten |
| E-05 | P1c | offen | PIN entfällt |
| E-06 | P2 | offen | Automatisch beenden (neues Spiel / 5 min) + Hinweis |
| E-07 | P2 | offen | Haltezeit ab Beenden |
| E-08 | P5 | Regel | Platzierung im Baum wie bisher |
| E-09 | P5 | offen | Shootout auch in Gruppen |
| E-10 | P1 | offen | `C:\LPD\daten` + Umzugsschritt (vorher zeigen) |
| E-11 | P1 | offen | Backup auf `L:` + Windows-Anleitung |
| E-12 | P1 | offen | Drive-Pfad wählbar, Standard „Meine Ablage\LPD Events“ |
| E-13 | – | Regel | `main` bleibt bis zur Abnahme v1 |
| E-14 | P1 | offen | Videos per Git LFS unter `frontend/public/media/` |
| E-15 | P1 | offen | Design-Grundlage (Farben, Barlow, Variablen) |
| E-16 | – | erledigt | `CLAUDE.md` im Hauptordner (mit erstem Doku-Commit) |
| E-17 | P1 | offen | **Höchste Priorität:** Wurf-Kennung, offline weiterrücken, nichts stillschweigend verwerfen |
| E-18 | P1 | offen | Nach Neuverbinden neu laden; ersten Abruf wiederholen |

## Fehler aus der Bestandsaufnahme (F-xx)

| ID | Paket | Status | Fehler |
|---|---|---|---|
| F-01 | P5 | offen | Endet ein K.O.-Spiel durch eine Eingabe am Tablet, wird der K.O.-Baum nicht weitergeschaltet (Tablet-Endpunkt `turns` ruft die K.O.-/Gruppen-Auswertung nicht auf, nur die Eingabe über die Turnierleitung). |
| F-02 | P2 | offen | Prüfung „Spieler spielt schon an einem anderen Board“ (`players/busy`, `FindPlayerAlreadyInProgressAsync`) berücksichtigt laufende Spiele aller Events statt nur des aktiven Events. |
