using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace BetaLauncher
{
    public partial class MainWindow : Window
    {
        private const string GitHubOwner = "Jannik2401";
        private const string GitHubRepo = "RFG-Launcher";
        private readonly HttpClient Http = new();

        // Beispiel-Pfade (anpassen falls nötig)
        private string VersionFile => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "version.txt");

        public MainWindow()
        {
            InitializeComponent();
        }

        // =========================================================================
        // NEUE UPDATELOGIK (GitHub API - Dynamisch für V3, V4, etc.)
        // =========================================================================

        private async Task DownloadAndInstallLatestAsync()
        {
            try
            {
                UpdateButton.IsEnabled = false;
                
                StatusText.Text = "Suche nach neuesten Updates...";
                var release = await GetLatestGameReleaseAsync();
                if (release == null)
                {
                    MessageBox.Show("Kein Spiel-Release mit game.zip gefunden.", "Fehler", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                var asset = release.Assets.FirstOrDefault(a => string.Equals(a.Name, "game.zip", StringComparison.OrdinalIgnoreCase));
                if (asset == null)
                {
                    MessageBox.Show($"Die Datei 'game.zip' wurde im Release {release.TagName} nicht gefunden.", "Fehler", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                string tempZip = Path.Combine(Path.GetTempPath(), "RFG_game_update.zip");
                if (File.Exists(tempZip)) File.Delete(tempZip);

                StatusText.Text = $"Lade {release.TagName} herunter...";
                await using (var responseStream = await Http.GetStreamAsync(asset.BrowserDownloadUrl))
                using (var fileStream = new FileStream(tempZip, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    await responseStream.CopyToAsync(fileStream);
                }

                StatusText.Text = "Installiere Spieldateien...";
                // InstallZip(tempZip); // Hier deine Entpackungs-Logik einfügen
                
                if (File.Exists(tempZip)) File.Delete(tempZip);

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

        private async Task<GitHubRelease?> GetLatestGameReleaseAsync()
        {
            string url = $"https://api.github.com/repos/{GitHubOwner}/{GitHubRepo}/releases?per_page=10";
            
            if (!Http.DefaultRequestHeaders.Contains("User-Agent"))
            {
                Http.DefaultRequestHeaders.Add("User-Agent", "RFG-Launcher");
            }

            using HttpResponseMessage response = await Http.GetAsync(url);
            if (!response.IsSuccessStatusCode) return null;
            
            string json = await response.Content.ReadAsStringAsync();
            var releases = JsonSerializer.Deserialize<GitHubRelease[]>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            
            return releases?
                .Where(r => !r.Draft && r.Assets != null && r.Assets.Any(a => string.Equals(a.Name, "game.zip", StringComparison.OrdinalIgnoreCase)))
                .OrderByDescending(r => ParseVersion(r.TagName))
                .FirstOrDefault();
        }

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

        private void UpdateHomeInformation()
        {
            // Platzhalter für UI-Aktualisierung
        }


        // =========================================================================
        // UI EVENT HANDLER (Stubs zur Behebung der CS1061-Fehler)
        // =========================================================================

        private void HomeButton_Click(object sender, RoutedEventArgs e) { }
        private void UpdatesButton_Click(object sender, RoutedEventArgs e) { }
        private void AccountButton_Click(object sender, RoutedEventArgs e) { }
        private void AdminButton_Click(object sender, RoutedEventArgs e) { }
        private void PerformanceButton_Click(object sender, RoutedEventArgs e) { }
        private void CreditsButton_Click(object sender, RoutedEventArgs e) { }
        private void SettingsButton_Click(object sender, RoutedEventArgs e) { }
        private void CheckLauncherUpdateButton_Click(object sender, RoutedEventArgs e) { }
        private void ExitButton_Click(object sender, RoutedEventArgs e) { Application.Current.Shutdown(); }
        private void UserProfileCornerBox_Click(object sender, RoutedEventArgs e) { }

        private void StartButton_Click(object sender, RoutedEventArgs e) { }
        private void UpdateButton_Click(object sender, RoutedEventArgs e) 
        {
            _ = DownloadAndInstallLatestAsync();
        }

        private void AccountPasswordBox_PasswordChanged(object sender, RoutedEventArgs e) { }
        private void AccountPasswordVisibleTextBox_TextChanged(object sender, TextChangedEventArgs e) { }
        private void TogglePasswordVisibility_Click(object sender, RoutedEventArgs e) { }
        private void LoginAccountButton_Click(object sender, RoutedEventArgs e) { }
        private void SaveDisplayNameButton_Click(object sender, RoutedEventArgs e) { }
        private void GoToChangePassword_Click(object sender, RoutedEventArgs e) { }
        private void LogoutButton_Click(object sender, RoutedEventArgs e) { }
        private void SaveNewPasswordButton_Click(object sender, RoutedEventArgs e) { }

        private void AdminCreateUser_Click(object sender, RoutedEventArgs e) { }
        private void AdminToggleBeta_Click(object sender, RoutedEventArgs e) { }
        private void AdminResetPw_Click(object sender, RoutedEventArgs e) { }
        private void AdminToggleLock_Click(object sender, RoutedEventArgs e) { }
        private void AdminDeleteUser_Click(object sender, RoutedEventArgs e) { }

        private void DiscordButton_Click(object sender, RoutedEventArgs e) { }
        private void TwitchButton_Click(object sender, RoutedEventArgs e) { }
        private void InstagramButton_Click(object sender, RoutedEventArgs e) { }
        private void TikTokButton_Click(object sender, RoutedEventArgs e) { }

        private void InlinePwdBox_PasswordChanged(object sender, RoutedEventArgs e) { }
        private void InlineTxtVisiblePassword_TextChanged(object sender, TextChangedEventArgs e) { }
        private void InlineBtnTogglePwd_Click(object sender, RoutedEventArgs e) { }
        private void InlineCancelButton_Click(object sender, RoutedEventArgs e) { }
        private void InlineSaveButton_Click(object sender, RoutedEventArgs e) { }
    }

    // =========================================================================
    // DATENMODELLE FÜR GITHUB API
    // =========================================================================

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
}
