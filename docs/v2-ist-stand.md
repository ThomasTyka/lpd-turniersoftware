# Ist-Stand Turniersoftware LPD (v1) – Bestandsaufnahme für v2

Stand 15.11.2026 · Pflichtenheft-Punkt **P1-01** · Grundlage: Commit `9a6be3e` (= Tag `v1.0`, Branch `v1`).
Nur gelesen, nichts geändert. Software nicht gebaut/getestet (in der Analyse-Umgebung war kein .NET installiert).

Entscheidungen zu den offenen Fragen: siehe `docs/v2-pflichtenheft.md`, Abschnitt „Entscheidungen 15.11.2026“ (E-01 … E-18).

---

## 1. Architektur

| Teil | Ist-Stand |
|---|---|
| Backend | .NET 10, ASP.NET Minimal-API, drei Projekte: `LetsPlayDarts.Api` (Endpunkte, SignalR, Login), `LetsPlayDarts.Domain` (Entitäten, Regeln), `LetsPlayDarts.Infrastructure` (EF Core + SQLite, 16 Migrationen, laufen beim Start automatisch). |
| Login | Turnierleitung mit Benutzer + Passwort-Hash (PBKDF2) aus `docker/.env`, danach JWT (12 h). Tablets, Board-Monitore und Leinwand ohne Login. |
| Frontend | React 19 + TypeScript + Vite, kein Router. Die Ansicht ergibt sich aus der URL (`frontend/src/main.tsx`). |
| Ein Prozess | Das Backend liefert das gebaute Frontend (`frontend/dist`) selbst aus – API, Live-Verbindung und Oberfläche über denselben Port. |
| Tests | 14 Cypress-Oberflächentests (`frontend/cypress/e2e`), keine Backend-Unit-Tests. |

### Aufrufe (URL-Parameter)

| URL | Ansicht | Datei |
|---|---|---|
| `/` | Turnierleitung (Login, Eventliste, Event-Reiter) | `App.tsx`, `EventDetailView.tsx` |
| `?tablet=<eventId>` / `?tablet=current` | Tablet (Kopplung → Eingabe) | `DevicePairing.tsx`, `TabletScoreEntry.tsx` |
| `?boardmonitor=<eventId>` / `?boardmonitor=current` (+ `&rotate=cw/ccw`) | Board-Monitor | `DevicePairing.tsx`, `LiveGameView.tsx` |
| `?leinwand=<eventId>` | Leinwand (Szenen „Boards“, „Rangliste“, 180-Einblendung) | `LeinwandView.tsx` |
| `?bracket=<eventId>` | K.O.-Baum | `BracketLeinwandView.tsx` |
| `?siegerehrung=<eventId>` | Siegerpodest | `SiegerehrungView.tsx` |
| `?greenscreen=<boardId>` | Chroma-Key-Einblendung für Stream | `LiveGameView.tsx` |
| `?monitor=<gameId>` | Einzelnes Spiel live | `LiveGameView.tsx` |

### Reiter der Turnierleitung
Dashboard (Kennzahlen, Board-Übersicht, Leinwand-Vorschau, Greenscreen, Vorrunden-Rangliste) · Event · Boards · Spieler · Teams · Leinwand · Geräte · Turniere (Vorrunde, Gruppenrunden, K.O.) · Branding.

## 2. Datenmodell und Datenhaltung

- **Event** → Spieler, Boards, Teams, Turniere. Status: Entwurf („Inaktiv“) / Aktiv / Archiviert.
- **Turnier** → Spieleinstellungen Vorrunde und Finale (Modus Highscore oder X01, Runden bzw. Startwert), „beste X Spiele“, Status, freies Phasen-Etikett. Mehrere Turniere pro Event möglich (laut E-03 künftig genau eins).
- **Spiel** → Board, Modus, Runden, Status (`InProgress` / `Finished`), Startzeit, optional K.O.-Paarung oder Gruppenrunde, manueller Sieger bei Gleichstand. Pro Spieler ein **Eintrag** mit Wurfreihenfolge und der **Liste der Aufnahme-Summen** (als JSON-Spalte).
- **K.O.-Paarung**, **Gruppenrunde**, **Team**, **Gerät** (Tablet/Monitor ↔ Board, pro Event), **Leinwand-Einstellungen** (Szenen, Takt, fixierte Szene).
- Speicherung: eine **SQLite-Datei** `/data/darts.db`, Logos unter `/data/uploads/logos`. Beides im **benannten Docker-Volume `darts-data`** (kein fester Windows-Ordner).
- Jede Änderung wird per `SaveChangesAsync` gespeichert, **bevor** sie live verteilt wird.
- Nur im Arbeitsspeicher (nach Neustart weg): Online-Status der Geräte, Liste „Warte auf Zuweisung“.
- **Lücken für v2:**
  - Pro Aufnahme gibt es **keine Uhrzeit** (nur Spielstart) – nötig für P6-14.
  - Spiel kennt nur „läuft“ / „beendet“: **mit dem letzten Wurf zählt es sofort** in der Rangliste – der Schritt „Spiel beenden“ (P2-14) fehlt.
  - Keine eindeutige Kennung pro Wurf (siehe 5.).

## 3. SignalR (Live-Verbindung)

- Ein Hub `/hubs/game`, ohne Login, nur lesend für Clients. Gruppen: pro Spiel, Board, Turnier, Leinwand(-Event).
- Meldungen: `gameStarted`, `gameUpdated`, `gameCancelled` (nur ans Board), `knockoutUpdated`, `groupsUpdated`, `leinwandSettingsUpdated`, `brandingUpdated` (**nur an die Leinwand-Gruppe**).
- Geräte melden sich mit `RegisterDevice(clientDeviceId)` online; Trennung → offline.
- Alle Clients nutzen `withAutomaticReconnect()` mit Standardwerten: Versuche nach 0, 2, 10, 30 s, danach **endgültig getrennt** (≈ 45 s). Kein Neustart der Verbindung, kein Neuladen.
- Nach erfolgreichem Neuverbinden treten die Geräte den Gruppen wieder bei, **holen den Spielstand aber nicht neu** (Board-Monitor, Leinwand, Turnierleitung). Der erste Abruf beim Start wird bei Fehler **nicht wiederholt**.

## 4. Docker und Betrieb

- `docker-compose.yml`: ein Dienst `app`, Port **8080:8080**, `restart: unless-stopped`, Volume `darts-data:/data`, Ordner `./update-ipc` für den Update-Mechanismus.
- `docker/Dockerfile`: mehrstufig (Node 22 baut Frontend, .NET SDK 10 baut Backend, Laufzeit `aspnet:10.0`).
- Zugangsdaten in `docker/.env` (nicht im Git); `Server__LanAddress` muss von Hand gesetzt werden (für QR-Codes).
- **Update:** Knopf in der Turnierleitung → Datei in `update-ipc` → `scripts/update-watcher.ps1` auf dem Windows-Rechner macht `git pull` von **`main`** und `docker compose build/up`. Braucht Internet.
- **Doku veraltet/fehlt:** `docker/README.md` nennt Port 5289 (Datei UTF-16-codiert, ebenso `database/README.md`, `scripts/README.md`, `docs/ArchitectureDecisions.md`); `scripts/start-*.bat` nennen 5173; `docs/update-watcher.md` (im Skript erwähnt) existiert nicht; Haupt-`README.md` ist leer. Autostart von Docker Desktop und Windows-Firewall nicht dokumentiert.
- `Program.cs` ruft `UseHttpsRedirection` auf, obwohl nur HTTP läuft (harmlos, nur Warnung).

## 5. Prüffragen aus P1-01

| Frage | Antwort |
|---|---|
| Liegt der Spielstand nur auf dem Server? | **Ja.** Geräte speichern lokal nur Geräte-ID, Tablet-PIN und die Offline-Warteschlange (`localStorage`). |
| Wird jede Eingabe sofort gespeichert? | **Ja**, jeder Wurf sofort in SQLite. Einschränkung: keine Uhrzeit pro Wurf. |
| Verbinden Clients automatisch neu? | **Nur ca. 45 s**, danach dauerhaft getrennt. Kein Neuladen des Stands nach Neuverbinden, kein Wiederholen des ersten Abrufs. |
| Gibt es einen Zwischenspeicher am Tablet? | **Ja, aber fehlerhaft** (`TabletScoreEntry.tsx`, Warteschlange in `localStorage`, Anzeige „X Würfe werden nachgereicht…“). |

**Fehler in der Tablet-Warteschlange (E-17, höchste Priorität):**
1. **Würfe gehen verloren:** Offline rückt das Tablet nicht zum nächsten Spieler weiter. Der zweite Offline-Wurf wird wieder dem ersten Spieler zugeordnet; beim Nachsenden lehnt der Server ihn ab („nicht dran“) und das Tablet **verwirft ihn ohne Hinweis**.
2. **Würfe können doppelt zählen:** Kam der Wurf beim Server an, aber die Antwort nicht zurück, wird er erneut gesendet. Ohne eindeutige Kennung erkennt der Server die Wiederholung nicht.

## 6. Bereits (teilweise) vorhanden – Bezug zum Pflichtenheft

Details pro ID in `docs/v2-status.md`. Kurzüberblick:

- **Fundament:** Offline ohne CDN (Lottie lokal), aber ohne Barlow Condensed. Port 8080, Neustart-Regel. Genau ein aktives Event (ohne Rückfrage). Hinweis „Kein aktives Event – wartet…“ für `?…=current`. Branding live nur auf der Leinwand.
- **Event/Import:** Name, Kunde, Datum, Ort, Logo, zwei Farben mit Farbvorschlag aus dem Logo. Runden frei, „beste X“, im Turnier änderbar. CSV-Import nur Komma/feste Spalten, ohne Gründe für übersprungene Zeilen.
- **Geräte:** Monitor meldet sich mit 4-stelligem Code, Zuweisung aus der Turnierleitung. Tablet über PIN 4719 + Zuweisung/QR. Übernahme eines belegten Boards serverseitig möglich. Geräteliste online/offline.
- **Spielbetrieb:** Tablet mit Ziffernfeld (anderes Layout), Suche, Spieler-Korrektur pro Wurf, „Spiel wiederholen“ (startet sofort), Abbruch über Menü. Monitor mit großem aktivem Spieler + Liste, Hochzählen, Konfetti ab 100, Pokal. Kein Spiel-Limit.
- **Turnierleitung:** Rangliste aktualisiert sich bei Spielende automatisch. Dashboard mit Kennzahlen und Board-Kacheln.
- **Leinwand:** Szenen-Rotation, fixierte Szene, Rangliste seitenweise mit Pause/Tastatur, 180-Einblendung.
- **K.O.:** Setzliste (1/2 in verschiedenen Hälften), Best of (ungerade), Gruppenrunden mit Streifen-Verteilung, Nachrücker, Boardwahl, Spiel um Platz 3 (immer). Rundennamen deutsch, Baum entsteht rundenweise, Gleichstand per Hand.
- **Siegerehrung:** einfaches Podest als eigene URL.

## 7. Weitere Auffälligkeiten

- Ohne Login möglich: Turnier anlegen, Vorrunden-Einstellungen ändern, Spiel anlegen (gedacht fürs Tablet). Laut E-02 werden die ersten beiden am Tablet entfernt.
- Das Tablet kann über `turns/edit` auch **bereits beendete Spiele** ändern (Konflikt mit P2-14/P3-04).
- **Fehler F-01 (Paket 5):** `GameEndpoints` (Turnierleitung) prüft bei Spielende K.O./Gruppe; der Tablet-Endpunkt `turns` tut das **nicht** (nur `resolve-tie`). Ein K.O.-Spiel, das am Tablet endet, schaltet den Baum daher nicht weiter.
- **Fehler F-02 (Paket 2):** `players/busy` und `FindPlayerAlreadyInProgressAsync` prüfen laufende Spiele **aller** Events, nicht nur des aktiven.
- Board-Monitor und Tablet laden Logo/Farben nur beim Start (P1-12).
- `update-watcher.ps1` zieht fest `main` (passt zu E-13).
