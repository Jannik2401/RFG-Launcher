# Kirmes Beta Launcher

Kleiner Windows-WPF-Launcher für `kirmes.exe`.

## Voraussetzungen

- Windows
- .NET 8 SDK

## 1. Server konfigurieren

Öffne:

`MainWindow.xaml.cs`

und ändere:

`ManifestUrl`

auf die URL deiner `manifest.json`.

Beispiel:

`https://deine-domain.de/kirmes/manifest.json`

## 2. Update-Datei

Die `manifest.json` sieht so aus:

```json
{
  "Version": "0.1.0",
  "GameZipUrl": "https://deine-domain.de/kirmes/kirmes-0.1.0.zip"
}
```

Die ZIP muss `kirmes.exe` und alle benötigten Spieldateien enthalten.

## 3. Launcher bauen lassen

Im Projektordner:

```powershell
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```

Die fertige Datei liegt danach ungefähr hier:

`bin/Release/net8.0-windows/win-x64/publish/BetaLauncher.exe`

Diese EXE kannst du deinen Betatestern geben.

## 4. Neue Beta

Bei jeder neuen Version:

- neue ZIP auf den Server
- Version in `manifest.json` erhöhen
- URL in `manifest.json` ändern

Die Tester müssen nur noch den Launcher öffnen und **UPDATE** drücken.

## Hinweis

Dieser einfache Launcher ersetzt die Spieldateien direkt. Vor einem Update sollte das Spiel geschlossen sein.


## GitHub Actions: fertige EXE bauen

Das Repository enthält `.github/workflows/build-launcher.yml`.
Nach dem Upload auf GitHub baut GitHub automatisch eine Windows-x64-EXE.

In GitHub:
1. `Actions` öffnen.
2. `Build BetaLauncher` auswählen.
3. Den erfolgreichen Lauf öffnen.
4. Unter `Artifacts` `BetaLauncher-Windows-x64` herunterladen.
5. Darin liegt `BetaLauncher.exe`.

Die EXE ist self-contained; die Tester brauchen dafür kein .NET zu installieren.
