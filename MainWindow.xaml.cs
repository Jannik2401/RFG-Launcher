using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using System.Windows;

// Falls noch nicht geschehen, hier anpassen an deinen Repository-Namen:
private const string GitHubOwner = "Jannik2401";
private const string GitHubRepo = "RFG-Launcher";
private readonly HttpClient Http = new();

private async Task DownloadAndInstallLatestAsync()
{
    try
    {
        UpdateButton.IsEnabled = false;
        
        // 1. Hole automatisch das neueste Release von GitHub, das eine game.zip enthält
        StatusText.Text = "Suche nach neuesten Updates...";
        var release = await GetLatestGameReleaseAsync();
        if (release == null)
        {
            MessageBox.Show("Kein Spiel-Release mit game.zip gefunden.", "Fehler", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        // 2. Suche nach der game.zip im Release
        var asset = release.Assets.FirstOrDefault(a => string.Equals(a.Name, "game.zip", StringComparison.OrdinalIgnoreCase));
        if (asset == null)
        {
            MessageBox.Show($"Die Datei 'game.zip' wurde im Release {release.TagName} nicht gefunden.", "Fehler", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        string tempZip = Path.Combine(Path.GetTempPath(), "RFG_game_update.zip");
        if (File.Exists(tempZip)) File.Delete(tempZip);

        // 3. Herunterladen der game.zip
        StatusText.Text = $"Lade {release.TagName} herunter...";
        await using (var responseStream = await Http.GetStreamAsync(asset.BrowserDownloadUrl))
        using (var fileStream = new FileStream(tempZip, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            await responseStream.CopyToAsync(fileStream);
        }

        // 4. Installieren / Entpacken der ZIP
        StatusText.Text = "Installiere Spieldateien...";
        InstallZip(tempZip); // Hier greift deine bestehende Entpackungs-Logik
        
        if (File.Exists(tempZip)) File.Delete(tempZip);

        // 5. Version lokal speichern
        File.WriteAllText(VersionFile, NormalizeVersion(release.TagName));
        StatusText.Text = "Erfolgreich installiert!";
        UpdateHomeInformation();
    }
    catch (Exception ex)
    {
        StatusText.Text = "Installation fehlgeschlagen.";
        MessageBox.Show("Fehler beim Update: " + ex.Message, "Fehler", MessageBoxButton.OK, MessageBoxImage.Error);
    }
    finally 
    { 
        UpdateButton.IsEnabled = true; 
    }
}

// Hilfsmethode: Fragt die GitHub-API ab und filtert nach Releases mit game.zip
private async Task<GitHubRelease?> GetLatestGameReleaseAsync()
{
    string url = $"https://api.github.com/repos/{GitHubOwner}/{GitHubRepo}/releases?per_page=10";
    
    // User-Agent ist bei GitHub API-Requests Pflicht
    if (!Http.DefaultRequestHeaders.Contains("User-Agent"))
    {
        Http.DefaultRequestHeaders.Add("User-Agent", "RFG-Launcher");
    }

    using HttpResponseMessage response = await Http.GetAsync(url);
    if (!response.IsSuccessStatusCode) return null;
    
    string json = await response.Content.ReadAsStringAsync();
    var releases = JsonSerializer.Deserialize<GitHubRelease[]>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
    
    // Filtert Drafts heraus und prüft, ob die game.zip als Asset vorhanden ist
    return releases?
        .Where(r => !r.Draft && r.Assets != null && r.Assets.Any(a => string.Equals(a.Name, "game.zip", StringComparison.OrdinalIgnoreCase)))
        .OrderByDescending(r => ParseVersion(r.TagName))
        .FirstOrDefault();
}

// Hilfsmethode zum Bereinigen/Parsen von Versionsnummern (z.B. "V3" zu "3.0.0")
private Version ParseVersion(string tag)
{
    string clean = new string(tag.Where(c => char.IsDigit(c) || c == '.').ToArray());
    if (Version.TryParse(clean, out var ver)) return ver;
    return new Version(0, 0, 0);
}

private string NormalizeVersion(string tag)
{
    return tag.TrimStart('v', 'V');
}

// Datenmodelle für die JSON-Antwort von GitHub
public class GitHubRelease
{
    [JsonPropertyName("tag_name")]
    public string TagName { get; set; } = string.Empty;

    [JsonPropertyName("draft")]
    public bool Draft { get; set; }

    [JsonPropertyName("assets")]
    public GitHubAsset[] Assets { get; set; } = Array.Empty<GitHubAsset>();
}

public class GitHubAsset
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("browser_download_url")]
    public string BrowserDownloadUrl { get; set; } = string.Empty;
}
