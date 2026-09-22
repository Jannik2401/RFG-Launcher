import sys
import os
import requests
import zipfile
import threading
import subprocess
import customtkinter as ctk
from packaging import version

# Modernes Design (Dunkel mit Kirmes/Neon-Blau/Rot-Akzenten)
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

# URL zu deiner version.json auf GitHub
VERSION_URL = "https://raw.githubusercontent.com/Jannik2401/RFG-Launcher/main/version.json"
CURRENT_LAUNCHER_VERSION = "1.0.0"  # Passe dies bei künftigen Launcher-Updates an!

class RFGLoader(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("RFG Launcher – Breakdance Simulation")
        self.geometry("850x550")
        self.resizable(False, False)

        # Variablen für Account-Status
        self.is_beta_tester = False
        self.version_data = {}

        self.create_login_frame()

    def clear_window(self):
        for widget in self.winfo_children():
            widget.destroy()

    # --- 1. LOGIN FENSTER (Waifly Account Anbindung) ---
    def create_login_frame(self):
        self.clear_window()

        # Titel & Branding
        title_lbl = ctk.CTkLabel(self, text="RFG LAUNCHER", font=ctk.CTkFont(size=32, weight="bold"))
        title_lbl.pack(pady=(40, 10))
        
        sub_lbl = ctk.CTkLabel(self, text="Bitte melde dich mit deinem Waifly-Account an", font=ctk.CTkFont(size=14))
        sub_lbl.pack(pady=(0, 20))

        # Eingabefelder
        self.username_entry = ctk.CTkEntry(self, placeholder_width=300, placeholder_text="Waifly Benutzername / E-Mail", width=300, height=40)
        self.username_entry.pack(pady=10)

        self.password_entry = ctk.CTkEntry(self, placeholder_width=300, placeholder_text="Passwort", show="*", width=300, height=40)
        self.password_entry.pack(pady=10)

        self.login_status = ctk.CTkLabel(self, text="", text_color="red")
        self.login_status.pack(pady=5)

        # Login Button
        login_btn = ctk.CTkButton(self, text="ANMELDEN", command=self.handle_login, width=300, height=40, font=ctk.CTkFont(size=15, weight="bold"))
        login_btn.pack(pady=20)

    def handle_login(self):
        username = self.username_entry.get().strip()
        password = self.password_entry.get().strip()

        if not username or not password:
            self.login_status.configure(text="Bitte alle Felder ausfüllen!")
            return

        self.login_status.configure(text="Verifiziere mit Waifly...", text_color="cyan")
        
        # Hier wird die Waifly API angebunden (Beispiel-Logik für Authentifizierung & Rollenprüfung)
        # Wenn du eine spezifische Waifly-API-URL hast, kannst du hier requests.post(...) einbauen.
        try:
            # Beispielhafte Validierung (Ersetze dies mit deiner echten Waifly API Abfrage)
            # api_response = requests.post("https://api.waifly.com/v1/login", json={"user": username, "pass": password})
            
            # Simulierter Erfolg für den Einstieg:
            if username: 
                # Test ob Beta-Tester (Beispiel: Wenn der Name 'beta' enthält oder über API-Rolle ermittelt wird)
                if "beta" in username.lower():
                    self.is_beta_tester = True
                
                self.create_main_dashboard()
            else:
                self.login_status.configure(text="Ungültige Anmeldedaten!", text_color="red")
        except Exception as e:
            self.login_status.configure(text=f"Verbindungsfehler: {str(e)}", text_color="red")

    # --- 2. HAUPTDASHBOARD (News, Updates, Starten) ---
    def create_main_dashboard(self):
        self.clear_window()

        # Linkes Menü / Dashboard Layout
        self.sidebar = ctk.CTkFrame(self, width=200, corner_radius=0)
        self.sidebar.pack(side="left", fill="y")

        logo_label = ctk.CTkLabel(self.sidebar, text="RFG DASHBOARD", font=ctk.CTkFont(size=18, weight="bold"))
        logo_label.pack(pady=30, padx=20)

        status_text = "Status: Beta-Tester 🚀" if self.is_beta_tester else "Status: Spieler"
        role_label = ctk.CTkLabel(self.sidebar, text=status_text, text_color="orange" if self.is_beta_tester else "gray")
        role_label.pack(pady=10, padx=20)

        # Hauptbereich rechts
        self.main_area = ctk.CTkFrame(self, fg_color="transparent")
        self.main_area.pack(side="right", fill="both", expand=True, padx=20, pady=20)

        # News Box
        news_title = ctk.CTkLabel(self.main_area, text="📢 Neueste Updates & News", font=ctk.CTkFont(size=16, weight="bold"))
        news_title.pack(anchor="w", pady=(0, 5))

        self.news_box = ctk.CTkTextbox(self.main_area, width=600, height=180)
        self.news_box.pack(pady=(0, 20))
        self.news_box.insert("0.1", "Lade News von GitHub...")
        self.news_box.configure(state="disabled")

        # Status & Progress
        self.status_label = ctk.CTkLabel(self.main_area, text="Prüfe auf Updates...", font=ctk.CTkFont(size=14))
        self.status_label.pack(anchor="w", pady=5)

        self.progressbar = ctk.CTkProgressBar(self.main_area, width=600)
        self.progressbar.set(0)
        self.progressbar.pack(anchor="w", pady=5)

        # Action Button (Spiel Starten / Download)
        self.action_btn = ctk.CTkButton(self.main_area, text="Warte...", state="disabled", command=self.check_and_launch_game, width=250, height=45, font=ctk.CTkFont(size=16, weight="bold"))
        self.action_btn.pack(anchor="w", pady=20)

        # Updates im Hintergrund starten
        threading.Thread(target=self.fetch_github_version, daemon=True).start()

    def fetch_github_version(self):
        try:
            res = requests.get(VERSION_URL)
            if res.status_code == 200:
                self.version_data = res.json()
                
                # News anzeigen falls vorhanden
                news_text = self.version_data.get("news", "Willkommen bei der Breakdance Simulation! Viel Spaß auf der Kirmes.")
                self.news_box.configure(state="normal")
                self.news_box.delete("0.1", "end")
                self.news_box.insert("0.1", news_text)
                self.news_box.configure(state="disabled")

                # Prüfen ob Launcher Update existiert
                online_launcher_ver = self.version_data.get("launcher_version", CURRENT_LAUNCHER_VERSION)
                if version.parse(online_launcher_ver) > version.parse(CURRENT_LAUNCHER_VERSION):
                    self.status_label.configure(text="Launcher-Update verfügbar! Wird aktualisiert...")
                    self.update_launcher()
                    return

                self.status_label.configure(text="Launcher ist auf dem neuesten Stand.")
                self.action_btn.configure(text="SPIEL STARTEN", state="normal")
            else:
                self.status_label.configure(text="Konnte Versionsdaten nicht laden.")
                self.action_btn.configure(text="SPIEL STARTEN (Offline)", state="normal")
        except Exception as e:
            self.status_label.configure(text=f"Netzwerkfehler: {str(e)}")
            self.action_btn.configure(text="SPIEL STARTEN (Offline)", state="normal")

    def check_and_launch_game(self):
        game_exe = os.path.join("game", "Kirmes.exe")
        
        # Prüfen ob Spiel installiert ist
        if not os.path.exists(game_exe):
            self.status_label.configure(text="Spiel nicht gefunden. Lade Spieldateien herunter...")
            threading.Thread(target=self.download_game_files, daemon=True).start()
        else:
            # Eventuell Online-Versionsprüfung des Spiels durchführen
            self.status_label.configure(text="Starte Kirmes.exe...")
            try:
                os.startfile(game_exe)
                self.destroy()
            except Exception as e:
                self.status_label.configure(text=f"Fehler beim Starten: {str(e)}")

    def download_game_files(self):
        self.action_btn.configure(state="disabled")
        
        # URL je nach Rolle auswählen (Beta-Tester bekommen die Beta-Version)
        if self.is_beta_tester:
            download_url = self.version_data.get("beta_url")
            self.status_label.configure(text="Lade Beta-Version herunter...")
        else:
            download_url = self.version_data.get("game_url")
            self.status_label.configure(text="Lade Spiel-Release herunter...")

        if not download_url:
            self.status_label.configure(text="Download-Link in version.json nicht gefunden!")
            self.action_btn.configure(state="normal")
            return

        try:
            response = requests.get(download_url, stream=True)
            total_size = int(response.headers.get('content-length', 0))
            block_size = 1024
            downloaded = 0

            os.makedirs("game", exist_ok=True)
            zip_path = "game.zip"

            with open(zip_path, "wb") as f:
                for data in response.iter_content(block_size):
                    downloaded += len(data)
                    f.write(data)
                    if total_size > 0:
                        progress = downloaded / total_size
                        self.progressbar.set(progress)

            self.status_label.configure(text="Entpacke Spieldateien...")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall("game")

            os.remove(zip_path)
            self.progressbar.set(1.0)
            self.status_label.configure(text="Download und Installation erfolgreich!")
            self.action_btn.configure(text="SPIEL STARTEN", state="normal")

        except Exception as e:
            self.status_label.configure(text=f"Fehler beim Download: {str(e)}")
            self.action_btn.configure(state="normal")

    def update_launcher(self):
        # Launcher Update Logik via Batch-Hilfsskript
        launcher_url = self.version_data.get("launcher_url")
        if not launcher_url:
            return

        try:
            self.status_label.configure(text="Lade Launcher-Update herunter...")
            r = requests.get(launcher_url)
            with open("new_launcher.exe", "wb") as f:
                f.write(r.content)

            # Batch-Datei schreiben, die die alte Exe ersetzt und neu startet
            with open("updater.bat", "w") as bat:
                bat.write("@echo off\n")
                bat.write("timeout /t 2 /nobreak > nul\n")
                bat.write("move /y new_launcher.exe RFG-Launcher.exe\n")
                bat.write("start RFG-Launcher.exe\n")
                bat.write("del updater.bat\n")

            os.startfile("updater.bat")
            sys.exit()
        except Exception as e:
            self.status_label.configure(text=f"Launcher-Update fehlgeschlagen: {str(e)}")
            self.action_btn.configure(text="SPIEL STARTEN", state="normal", command=self.check_and_launch_game)

if __name__ == "__main__":
    app = RFGLoader()
    app.mainloop()
