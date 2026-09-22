using System;
using System.IO;
using System.Net.Http;
using System.Diagnostics;
using System.Windows;
using System.Threading.Tasks;

namespace BetaLauncher;

public partial class UpdateWindow : Window
{
    private readonly string downloadUrl;
    private readonly string currentExePath;

    public UpdateWindow(string downloadUrl, string currentExePath)
    {
        InitializeComponent();
        this.downloadUrl = downloadUrl;
        this.currentExePath = currentExePath;

        Loaded += UpdateWindow_Loaded;
    }

    private async void UpdateWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await PerformUpdateAsync();
    }

    private async Task PerformUpdateAsync()
    {
        try
        {
            StatusText.Text = "Lade Launcher-Update herunter...";

            string tempExePath = Path.Combine(Path.GetTempPath(), "BetaLauncher_New.exe");
            if (File.Exists(tempExePath)) File.Delete(tempExePath);

            using (HttpClient client = new())
            {
                using var response = await client.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead);
                response.EnsureSuccessStatusCode();

                long? totalBytes = response.Content.Headers.ContentLength;

                await using Stream input = await response.Content.ReadAsStreamAsync();
                await using FileStream output = new(tempExePath, FileMode.Create, FileAccess.Write, FileShare.None);

                byte[] buffer = new byte[81920];
                long totalRead = 0;
                int bytesRead;

                while ((bytesRead = await input.ReadAsync(buffer, 0, buffer.Length)) > 0)
                {
                    await output.WriteAsync(buffer, 0, bytesRead);
                    totalRead += bytesRead;

                    if (totalBytes.HasValue && totalBytes.Value > 0)
                    {
                        double percentage = (double)totalRead / totalBytes.Value * 100.0;
                        
                        // UI-Elemente im Dispatcher-Thread aktualisieren
                        Dispatcher.Invoke(() =>
                        {
                            ProgressBar.Value = Math.Min(100, percentage);
                            PercentageText.Text = $"{Math.Round(percentage)}%";
                        });
                    }
                }
            }

            StatusText.Text = "Installiere Update...";
            ProgressBar.Value = 100;
            PercentageText.Text = "100%";
            await Task.Delay(500);

            string batchPath = Path.Combine(Path.GetTempPath(), "update_launcher.bat");
            string batchContent = $@"
@echo off
timeout /t 2 /nobreak > nul
move /y ""{tempExePath}"" ""{currentExePath}""
start """" ""{currentExePath}""
del ""%~f0""
";

            File.WriteAllText(batchPath, batchContent);

            Process.Start(new ProcessStartInfo
            {
                FileName = batchPath,
                CreateNoWindow = true,
                UseShellExecute = false
            });

            Application.Current.Shutdown();
        }
        catch (Exception ex)
        {
            MessageBox.Show("Fehler beim Update des Launchers: " + ex.Message, "Update-Fehler", MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
        }
    }
}
