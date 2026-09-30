# Website

Statische Website fuer **Realistic Funfair Games**, deployed ueber GitHub Pages.

Live: <https://jannik2401.github.io/RFG-Launcher/>

## Struktur

```
site/
  index.html          Start + Download
  team.html           Das Team
  kontakt.html        Kontakt
  media.html          Bilder & Videos
  assets/css/         style.css  (eine Datei, App-Branding)
  assets/js/
    site.js           Navigation, Live-Version, Reveal, Copy-Button
    media.js          Galerie, Filter, Lightbox
  assets/img/         Logo/Favicon (PNG + WebP)
  media/
    media.json        generierter Index (nicht von Hand aendern)
    images/           hier Bilder ablegen
    videos/           hier Videos ablegen
    .previews/        automatisch erzeugt
    .posters/         automatisch erzeugt
tools/
  media-sync.ps1      baut media.json + Vorschauen
```

Kein Build-Schritt, keine Abhaengigkeiten, kein Framework. HTML, CSS und
Vanilla-JS – jeder Browser kann sie rendern.

## Download automatisch aktuell halten

Die Download-Kategorie liest `version.json` aus dem Repo:

```
https://raw.githubusercontent.com/Jannik2401/RFG-Launcher/main/version.json
```

Der Release-Workflow (`.github/workflows/release_2.yml`) schreibt diese Datei
nach jedem Release. Die Website zeigt damit immer die gerade veroeffentlichte
Version und verlinkt auf

```
https://github.com/Jannik2401/RFG-Launcher/releases/download/latest/RFGlauncher.exe
```

**Fuer die Website ist nichts zu tun.** Sobald ein Release laeuft, steht die neue
Version auf der Seite. Erscheint sie nicht, pruefen, ob der Raw-URL wegen eines
CDN-Caches noch die alte Datei liefert – die Seite fragt mit `cache: 'no-store'`.

Groesse und Veroeffentlichungsdatum kommen zusaetzlich ueber die GitHub-API
(`releases/latest`). Das ist nur Zierde: schlaegt die Anfrage fehl oder ist das
API-Limit erreicht, bleibt der Download-Button trotzdem funktionsfaehig. Das
Ergebnis wird 30 Minuten in `localStorage` gepuffert.

## Medien hochladen

1. Datei ablegen:
   - Bilder nach `site/media/images/`
   - Videos nach `site/media/videos/`
2. Index neu bauen:

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\media-sync.ps1
   ```

3. Committen und pushen.

Das Skript macht Folgendes:

| Schritt | Verhalten |
|---|---|
| Bilder verkleinern | auf max. 2000 px Breite; PNG verlustfrei, JPG mit Qualitaet 88 |
| Vorschauen | max. 640 px WebP fuer die Galerie (`media/.previews/`) |
| Video-Poster | Frame bei 1 s als WebP (`media/.posters/`) |
| `media.json` | schreibt Pfad, Titel, Datum und Groesse |

Titel entstehen aus dem Dateinamen: `karussell-nachts.mp4` wird zu
„Karussell nachts". Damit das funktioniert, sind Dateinamen auf Deutsch und ohne
Leerzeichen benennen.

Optionen:

- `-NoOptimize` nur den Index schreiben, keine Bildbearbeitung
- `-Force` auch bereits optimierte Bilder erneut bearbeiten

`ffmpeg` wird nur fuer Video-Poster gebraucht. Fehlt es, laeuft das Skript
weiter – Videos bekommen dann kein Vorschaubild, werden aber trotzdem angezeigt.

## Deployment

`.github/workflows/pages.yml` published bei jedem Push auf `main`, der `site/`
aendert. Der Workflow laeuft ueber GitHub Actions, deshalb muss Pages einmalig
auf **GitHub Actions** gestellt werden:

**Settings → Pages → Build and deployment → Source: `GitHub Actions`**

Danach ist die Seite unter `https://jannik2401.github.io/RFG-Launcher/` erreichbar.
Der erste Lauf erscheint unter **Actions → Deploy Website to GitHub Pages**.

Der Release-Workflow ignoriert Aenderungen unter `site/`, `tools/` und `*.md`,
damit reine Website-Updates keinen 150-MB-Release ausloesen.

## Anpassen

**Team** – `site/team.html`. Jede Rolle ist ein `<article class="role">`, die
Mitglieder sind `<span class="chip">`. Farbe pro Rolle ueber `--role-color`,
Farbe pro Person ueber `--chip-color` / `--chip-color-2` (Gradient der Initialen).

**Kontakt** – `site/kontakt.html`. Discord, Instagram und TikTok sind
`<a class="contact-card">` mit `target="_blank"`, die E-Mail hat zusaetzlich
`data-copy="...""` fuer den Kopier-Button.

**Texte auf der Startseite** – `site/index.html`.

**Farben und Abstände** – die Variablen oben in `site/assets/css/style.css`.
Die Palette stammt aus dem `Theme.xaml` des Launchers (`#0A0F1B`, `#151E33`,
`#22D3EE`, `#818CF8`).
