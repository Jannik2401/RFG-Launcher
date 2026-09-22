const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 25433;
const HOST = "0.0.0.0";

const USERS_FILE = path.join(__dirname, "users.json");

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        const defaultSalt = crypto.randomBytes(16).toString("hex");
        const defaultAdmin = [{
            username: "admin",
            salt: defaultSalt,
            passwordHash: hashPassword("admin123", defaultSalt),
            role: "admin",
            mustChangePassword: false,
            isLocked: false,
            createdAt: new Date().toISOString()
        }];
        fs.writeFileSync(USERS_FILE, JSON.stringify(defaultAdmin, null, 2), "utf8");
        return defaultAdmin;
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function sendJson(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
}

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password, user) {
    const passwordHash = hashPassword(password, user.salt);
    const storedHash = Buffer.from(user.passwordHash, "hex");
    const calculatedHash = Buffer.from(passwordHash, "hex");
    return storedHash.length === calculatedHash.length && crypto.timingSafeEqual(storedHash, calculatedHash);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", chunk => {
            body += chunk;
            if (body.length > 20000) {
                reject(new Error("Request too large"));
                req.destroy();
            }
        });
        req.on("end", () => {
            try { resolve(JSON.parse(body)); } 
            catch { reject(new Error("Invalid JSON")); }
        });
        req.on("error", reject);
    });
}

function verifyAdmin(req, users) {
    const adminUser = req.headers["x-admin-user"];
    const adminPass = req.headers["x-admin-pass"];
    if (!adminUser || !adminPass) return false;

    const admin = users.find(u => u.username.toLowerCase() === String(adminUser).toLowerCase() && u.role === "admin");
    if (!admin || admin.isLocked) return false;

    return verifyPassword(String(adminPass), admin);
}

const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-User, X-Admin-Pass");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === "GET" && req.url === "/") {
        sendJson(res, 200, { success: true, message: "RFG Account Server läuft!" });
        return;
    }

    // LOGIN (User & Admin)
    if (req.method === "POST" && req.url === "/api/login") {
        try {
            const data = await readBody(req);
            const username = String(data.username || "").trim();
            const password = String(data.password || "");

            const users = loadUsers();
            const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

            if (!user || !verifyPassword(password, user)) {
                sendJson(res, 401, { success: false, message: "Benutzername oder Passwort falsch." });
                return;
            }

            if (user.isLocked) {
                sendJson(res, 403, { success: false, message: "Konto ist gesperrt." });
                return;
            }

            sendJson(res, 200, {
                success: true,
                username: user.username,
                role: user.role || "user",
                mustChangePassword: !!user.mustChangePassword,
                message: "Login erfolgreich."
            });
        } catch {
            sendJson(res, 400, { success: false, message: "Ungültige Anfrage." });
        }
        return;
    }

    // ERSTMALIGES PASSWORT ÄNDERN
    if (req.method === "POST" && req.url === "/api/change-first-password") {
        try {
            const data = await readBody(req);
            const username = String(data.username || "").trim();
            const currentPassword = String(data.currentPassword || "");
            const newPassword = String(data.newPassword || "");

            if (newPassword.length < 8) {
                sendJson(res, 400, { success: false, message: "Neues Passwort muss mindestens 8 Zeichen haben." });
                return;
            }

            const users = loadUsers();
            const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

            if (!user || !verifyPassword(currentPassword, user)) {
                sendJson(res, 401, { success: false, message: "Zugangsdaten ungültig." });
                return;
            }

            const newSalt = crypto.randomBytes(16).toString("hex");
            user.salt = newSalt;
            user.passwordHash = hashPassword(newPassword, newSalt);
            user.mustChangePassword = false;

            saveUsers(users);
            sendJson(res, 200, { success: true, message: "Passwort erfolgreich aktualisiert." });
        } catch {
            sendJson(res, 400, { success: false, message: "Fehler beim Ändern des Passworts." });
        }
        return;
    }

    // ==========================================
    // ADMIN ENDPUNKTE (Erfordert Admin-Headers)
    // ==========================================

    if (req.url.startsWith("/api/admin/")) {
        const users = loadUsers();

        if (!verifyAdmin(req, users)) {
            sendJson(res, 403, { success: false, message: "Keine Admin-Berechtigung." });
            return;
        }

        // Admin: Liste aller User
        if (req.method === "GET" && req.url === "/api/admin/users") {
            const list = users.map(u => ({
                username: u.username,
                role: u.role || "user",
                mustChangePassword: !!u.mustChangePassword,
                isLocked: !!u.isLocked,
                createdAt: u.createdAt
            }));
            sendJson(res, 200, { success: true, users: list });
            return;
        }

        // Admin: User / Admin erstellen (mit temp Passwort)
        if (req.method === "POST" && req.url === "/api/admin/create-user") {
            try {
                const data = await readBody(req);
                const username = String(data.username || "").trim();
                const tempPassword = String(data.tempPassword || "");
                const role = data.role === "admin" ? "admin" : "user";

                if (username.length < 3 || tempPassword.length < 4) {
                    sendJson(res, 400, { success: false, message: "Ungültige Eingaben." });
                    return;
                }

                if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
                    sendJson(res, 409, { success: false, message: "Benutzer existiert bereits." });
                    return;
                }

                const salt = crypto.randomBytes(16).toString("hex");
                users.push({
                    username,
                    salt,
                    passwordHash: hashPassword(tempPassword, salt),
                    role,
                    mustChangePassword: true,
                    isLocked: false,
                    createdAt: new Date().toISOString()
                });

                saveUsers(users);
                sendJson(res, 201, { success: true, message: `Account '${username}' erstellt.` });
            } catch {
                sendJson(res, 400, { success: false, message: "Fehler beim Erstellen." });
            }
            return;
        }

        // Admin: Passwort zurücksetzen
        if (req.method === "POST" && req.url === "/api/admin/reset-password") {
            try {
                const data = await readBody(req);
                const username = String(data.username || "").trim();
                const newTempPassword = String(data.newTempPassword || "");

                const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
                if (!user) {
                    sendJson(res, 404, { success: false, message: "Benutzer nicht gefunden." });
                    return;
                }

                const salt = crypto.randomBytes(16).toString("hex");
                user.salt = salt;
                user.passwordHash = hashPassword(newTempPassword, salt);
                user.mustChangePassword = true;

                saveUsers(users);
                sendJson(res, 200, { success: true, message: `Passwort für '${username}' zurückgesetzt.` });
            } catch {
                sendJson(res, 400, { success: false, message: "Fehler beim Zurücksetzen." });
            }
            return;
        }

        // Admin: User sperren / entsperren
        if (req.method === "POST" && req.url === "/api/admin/toggle-lock") {
            try {
                const data = await readBody(req);
                const username = String(data.username || "").trim();

                const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
                if (!user) {
                    sendJson(res, 404, { success: false, message: "Benutzer nicht gefunden." });
                    return;
                }

                user.isLocked = !user.isLocked;
                saveUsers(users);

                sendJson(res, 200, { success: true, isLocked: user.isLocked, message: `Status geändert.` });
            } catch {
                sendJson(res, 400, { success: false, message: "Fehler beim Ändern des Status." });
            }
            return;
        }

        // Admin: User löschen
        if (req.method === "POST" && req.url === "/api/admin/delete-user") {
            try {
                const data = await readBody(req);
                const username = String(data.username || "").trim();

                const index = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
                if (index === -1) {
                    sendJson(res, 404, { success: false, message: "Benutzer nicht gefunden." });
                    return;
                }

                users.splice(index, 1);
                saveUsers(users);

                sendJson(res, 200, { success: true, message: `Benutzer '${username}' gelöscht.` });
            } catch {
                sendJson(res, 400, { success: false, message: "Fehler beim Löschen." });
            }
            return;
        }
    }

    sendJson(res, 404, { success: false, message: "API-Endpunkt nicht gefunden." });
});

server.listen(PORT, HOST, () => {
    console.log(`RFG Account Server läuft auf Port ${PORT}`);
});
