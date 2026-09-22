SERVER-STRUKTUR

Lege auf deinem Webserver z.B. diese Dateien ab:

/kirmes/
    manifest.json
    kirmes-0.1.0.zip

Die ZIP muss den Inhalt des Spielordners enthalten, z.B.:

kirmes-0.1.0.zip
    kirmes.exe
    Data/
    ...
    weitere Spieldateien

Wenn du eine neue Beta veröffentlichst:
1. Neue ZIP hochladen, z.B. kirmes-0.1.1.zip
2. manifest.json auf Version 0.1.1 ändern
3. GameZipUrl auf die neue ZIP ändern

Die Tester öffnen danach den Launcher und klicken auf UPDATE.
