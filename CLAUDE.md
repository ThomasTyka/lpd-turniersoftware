# CLAUDE.md – Turniersoftware Let's Play Darts (Entwurf für das Repo, Stand 15.11.2026)

> Diese Datei liegt nach Freigabe als `CLAUDE.md` im Repo-Hauptordner. Claude Code liest sie bei jedem Start.

## Projekt
Turniersoftware für Dart-Events von Let's Play Darts: Turnierleitung (Laptop), Tablets an den Boards (Eingabe), Board-Monitore (22" hochkant, Xiaomi TV Stick + Fully Kiosk), Leinwand (TV/Mini-PC). Läuft per Docker auf einem Windows-Laptop, **komplett offline** im eigenen Event-Netz (Laptop fest auf 192.168.0.10:8080).

## Verbindliche Unterlagen
- `docs/v2-pflichtenheft.md` – **maßgeblich** für alles, was in v2 gebaut wird (IDs P1-01 …).
- `docs/v2-status.md` – Status jedes Pflichtenheft-Punkts (offen / erledigt / abweichend + Begründung). Nach jedem Arbeitsschritt aktualisieren.
- `docs/v2-ist-stand.md` – Bestandsaufnahme (in Paket 1 erstellen).
- `docs/assets/` – freigegebene Videos, Logos, PDF-Muster, Render-Skripte.

## Arbeitsregeln (nicht verhandelbar)
1. **Erst zeigen, dann committen.** Vor jeder Änderung Plan bzw. Diff zeigen. Committen, pushen oder ausliefern nur nach ausdrücklicher Freigabe durch Thomas – auch bei kleinen Änderungen.
2. Nur auf Branch **`v2`** arbeiten. `v1` (Tag/Branch) nie verändern.
3. **Paketweise** arbeiten (Reihenfolge im Pflichtenheft). Kein Vorgreifen auf spätere Pakete, keine „Nebenbei“-Features.
4. Unklar? **Fragen statt raten.** Abweichungen vom Pflichtenheft nur nach Rücksprache; Entscheidung im Pflichtenheft nachtragen.
5. Am Ende jedes Pakets: jeden Punkt des Pakets gegen den Code prüfen, `docs/v2-status.md` aktualisieren, Abnahme-Checkliste für Thomas ausgeben.
6. **Offline:** keine CDN-Links, keine Online-Schriften, keine externen Dienste zur Laufzeit. Barlow Condensed, Videos und Logos lokal.
7. Spielstand nur auf dem Server; jede Eingabe sofort dauerhaft speichern; Clients verbinden sich ohne Zeitlimit neu.
8. Spielart (Highscore/501) und Teams im Datenmodell vorsehen, in v2 aber nicht bauen.
9. Bestehende Reiter/Funktionen der Turnierleitung nicht entfernen, ohne zu fragen.
10. Antworten und Texte in der Oberfläche auf **Deutsch**; Rundennamen der K.O.-Phase englisch (Round of 16, Quarter-Final, Semi-Final, 3rd Place, Final).

## Design-Kurzfassung
Dunkel, Chrom-Titel, Gold #f4c52d für „jetzt dran/wichtig“, LPD-Streifen Grün #0b5a1e · Gold #f4ad00 · Rot #d0103a, Barlow Condensed, 8° Neigung. Hauptbuttons gold mit dunkler Schrift (keine grünen Buttons). Kundenlogo immer auf heller Fläche. Details: Pflichtenheft Abschnitt 1.

## Geräte
- Tablets: Lenovo Tab M10 3rd Gen (TB328FU), 10,1", 1920 × 1200, hochkant, Layout-Basis 800 × 1280, ca. 40 Stück, Fully Kiosk.
- Board-Monitore: 22" hochkant 1080 × 1920, Xiaomi TV Stick 4K Gen 2 (Wi-Fi 6), Fully Kiosk, Startadresse `http://192.168.0.10:8080/?boardmonitor=current`.
- Leinwand: 1920 × 1080 (geplant 65"-TV quer in einer Boardanlage, Mini-PC per HDMI).
