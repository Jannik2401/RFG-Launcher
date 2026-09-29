const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Alle Laufzeitdaten (Accounts, News, Reports) liegen hier. Mit RFG_DATA_DIR
// kann der Pfad fuer Tests/Deployments umgelegt werden.
const DATA_DIR = process.env.RFG_DATA_DIR || __dirname;

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const GAME_INFO_FILE = path.join(DATA_DIR, 'game_info.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

// Notepad/Editor schreiben gerne ein BOM an den Anfang. Ohne das hier
// scheitert JSON.parse und alle Accounts wuerden wie nicht existent wirken.
function parseJsonFile(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    try {
        const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
        const parsed = JSON.parse(raw);
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
        console.error(`Warnung: ${path.basename(file)} nicht lesbar (${e.message})`);
        return fallback;
    }
}

function readUsers() {
    const users = parseJsonFile(USERS_FILE, []);
    return Array.isArray(users) ? users : [];
}

function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function readNews() {
    const news = parseJsonFile(NEWS_FILE, []);
    return Array.isArray(news) ? news : [];
}

function writeNews(newsList) {
    fs.writeFileSync(NEWS_FILE, JSON.stringify(newsList, null, 2), 'utf8');
}

function readGameInfo() {
    const info = parseJsonFile(GAME_INFO_FILE, null);
    return info && typeof info === 'object' ? info : { version: '1.0.0', downloadUrl: '' };
}

function writeGameInfo(info) {
    fs.writeFileSync(GAME_INFO_FILE, JSON.stringify(info, null, 2), 'utf8');
}

function readReports() {
    const reports = parseJsonFile(REPORTS_FILE, []);
    return Array.isArray(reports) ? reports : [];
}

function writeReports(reports) {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf8');
}

function hashPassword(password, salt) {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
}

// Legt den Admin-Account an, falls users.json noch keinen hat.
// Das Startpasswort kommt bewusst aus der Umgebung und NICHT aus dem Quelltext,
// damit es nicht im oeffentlichen Repository und in jedem Backup mitfliegt.
function ensureDefaultAdmin() {
    let users = readUsers();

    if (!users.some(u => u.username.toLowerCase() === 'admin')) {
        const initialPassword = String(process.env.ADMIN_PASSWORD || '').trim();
        if (!initialPassword) {
            console.error('');
            console.error('  Es wurde kein Admin-Konto gefunden und ADMIN_PASSWORD ist nicht gesetzt.');
            console.error('  Bitte vor dem ersten Start setzen, z.B.:');
            console.error('    Linux/macOS:  ADMIN_PASSWORD="dein-passwort" node server.js');
            console.error('    Windows:      $env:ADMIN_PASSWORD="dein-passwort"; node server.js');
            console.error('');
            process.exit(1);
        }

        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(initialPassword, salt);
        users.push({
            username: 'admin',
            displayName: 'admin',
            salt: salt,
            passwordHash: passwordHash,
            role: 'admin',
            hasBetaAccess: false,
            mustChangePassword: true,
            isLocked: false,
            createdAt: new Date().toISOString()
        });
        writeUsers(users);
        console.log('Admin-Account "admin" angelegt. Bitte das Passwort beim ersten Login aendern.');
    } else {
        let updated = false;
        users.forEach(u => {
            if (!u.displayName) {
                u.displayName = u.username;
                updated = true;
            }
        });
        if (updated) writeUsers(users);
    }
}
ensureDefaultAdmin();

// ==========================================
// HILFSFUNKTIONEN FÜR REPORTS + MULTIPLAYER-SPERREN
// ==========================================

const MAX_REPORTS = 200;
const MAX_REPORT_REASON = 500;
const REPORT_RATE_LIMIT_COUNT = 5;
const REPORT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const reportRateMap = new Map();

function sanitizeName(value, maxLength) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/[\r\n\t]/g, ' ')
        .trim()
        .slice(0, maxLength);
}

/**
 * Das Spiel meldet den Anzeigenamen, deshalb wird zuerst nach displayName
 * gesucht und erst danach nach dem Benutzernamen.
 */
function findUserByName(users, name) {
    const needle = String(name || '').trim().toLowerCase();
    if (!needle) return null;
    return users.find(u => String(u.displayName || '').toLowerCase() === needle)
        || users.find(u => String(u.username || '').toLowerCase() === needle);
}

function isRateLimited(key) {
    const now = Date.now();
    const entry = reportRateMap.get(key);
    if (!entry || now - entry.start > REPORT_RATE_LIMIT_WINDOW_MS) {
        reportRateMap.set(key, { start: now, count: 1 });
        if (reportRateMap.size > 5000) reportRateMap.clear();
        return false;
    }
    entry.count += 1;
    return entry.count > REPORT_RATE_LIMIT_COUNT;
}

function getMultiplayerBan(user) {
    if (!user || !user.mpBannedUntil) return { banned: false, until: null };
    const until = new Date(user.mpBannedUntil);
    if (isNaN(until.getTime()) || until.getTime() <= Date.now()) {
        return { banned: false, until: null };
    }
    return { banned: true, until: until.toISOString() };
}

async function forwardReportToDiscord(content) {
    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content, allowed_mentions: { parse: [] } })
        });
    } catch (e) {
        console.error('Discord-Weiterleitung fehlgeschlagen:', e.message);
    }
}

if (!fs.existsSync(NEWS_FILE)) {
    writeNews([]);
}

if (!fs.existsSync(GAME_INFO_FILE)) {
    writeGameInfo({ version: '1.0.0', downloadUrl: '' });
}

if (!fs.existsSync(REPORTS_FILE)) {
    writeReports([]);
}

function requireAdmin(req, res, next) {
    const adminUser = req.headers['x-admin-user'];
    const adminPass = req.headers['x-admin-pass'];

    if (!adminUser || !adminPass) {
        return res.status(403).json({ success: false, message: 'Fehlende Admin-Berechtigungsheader.' });
    }

    const users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === adminUser.toLowerCase());

    if (!user || user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Keine Administrator-Rolle.' });
    }

    const hashedPassword = hashPassword(adminPass, user.salt);
    if (user.passwordHash !== hashedPassword) {
        return res.status(403).json({ success: false, message: 'Ungültiges Admin-Passwort in den Headern.' });
    }

    req.adminUser = user;
    next();
}

app.get('/', (req, res) => {
    res.json({ success: true, message: 'RFG Account Server läuft!' });
});

// News Endpunkte
app.get('/api/news/all', (req, res) => {
    try {
        res.json(readNews());
    } catch {
        res.json([]);
    }
});

app.get('/api/news/latest', (req, res) => {
    try {
        const news = readNews();
        res.json(news.length > 0 ? news[0] : null);
    } catch {
        res.json(null);
    }
});

// Spiel-Versions- und GitHub-Download-Link-Endpunkt
app.get('/api/game/version', (req, res) => {
    try {
        const info = readGameInfo();
        res.json({ success: true, version: info.version, downloadUrl: info.downloadUrl });
    } catch {
        res.json({ success: true, version: '1.0.0', downloadUrl: '' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    let users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return res.json({ success: false, message: 'Benutzer nicht gefunden.' });
    if (user.isLocked) return res.json({ success: false, message: 'Account ist gesperrt.' });

    const hashedPassword = hashPassword(password, user.salt);
    if (user.passwordHash !== hashedPassword) return res.json({ success: false, message: 'Falsches Passwort.' });

    if (!user.displayName) {
        user.displayName = user.username;
        writeUsers(users);
    }

    res.json({
        success: true,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        hasBetaAccess: user.hasBetaAccess,
        mustChangePassword: user.mustChangePassword
    });
});

app.post('/api/user-status', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Benutzername fehlt.' });

    let users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return res.json({ success: false, message: 'Benutzer nicht gefunden.' });
    if (user.isLocked) return res.json({ success: false, message: 'Account ist gesperrt.' });

    res.json({
        success: true,
        username: user.username,
        displayName: user.displayName || user.username,
        role: user.role,
        hasBetaAccess: user.hasBetaAccess,
        mustChangePassword: user.mustChangePassword
    });
});

app.post('/api/update-display-name', (req, res) => {
    const { username, newDisplayName } = req.body;
    let users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden.' });

    const trimmedName = String(newDisplayName || '').trim();
    if (trimmedName.length < 2 || trimmedName.length > 20) {
        return res.json({ success: false, message: 'Anzeigename muss zwischen 2 und 20 Zeichen lang sein.' });
    }

    // Anzeigenamen sind die Identitaet im Spiel und in Reports, daher muss der Name eindeutig bleiben.
    const clash = users.find(u =>
        u.username.toLowerCase() !== user.username.toLowerCase() &&
        String(u.displayName || '').toLowerCase() === trimmedName.toLowerCase());

    if (clash) {
        return res.json({ success: false, message: `Der Anzeigename "${trimmedName}" ist bereits vergeben.` });
    }

    user.displayName = trimmedName;
    writeUsers(users);
    res.json({ success: true, message: 'Anzeigename aktualisiert.', displayName: user.displayName });
});

app.post('/api/change-first-password', (req, res) => {
    const { username, currentPassword, newPassword } = req.body;
    let users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden.' });

    const hashedPassword = hashPassword(currentPassword, user.salt);
    if (user.passwordHash !== hashedPassword) {
        return res.json({ success: false, message: 'Aktuelles Passwort ist falsch.' });
    }

    user.salt = crypto.randomBytes(16).toString('hex');
    user.passwordHash = hashPassword(newPassword, user.salt);
    user.mustChangePassword = false;

    writeUsers(users);
    res.json({ success: true, message: 'Passwort erfolgreich geändert.' });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = readUsers();
    res.json({
        success: true,
        users: users.map(u => {
            const ban = getMultiplayerBan(u);
            return {
                username: u.username,
                displayName: u.displayName || u.username,
                role: u.role,
                hasBetaAccess: u.hasBetaAccess,
                isLocked: u.isLocked,
                mpBannedUntil: ban.until,
                multiplayerBanned: ban.banned
            };
        })
    });
});

app.post('/api/admin/create-user', requireAdmin, (req, res) => {
    const { username, tempPassword, role } = req.body;
    let users = readUsers();
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) return res.json({ success: false, message: 'Benutzername erforderlich.' });

    if (users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
        return res.json({ success: false, message: 'Benutzer existiert bereits.' });
    }

    if (users.some(u => String(u.displayName || '').toLowerCase() === cleanUsername.toLowerCase())) {
        return res.json({ success: false, message: `Der Anzeigename "${cleanUsername}" ist bereits vergeben.` });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(tempPassword, salt);

    users.push({
        username: cleanUsername,
        displayName: cleanUsername,
        salt: salt,
        passwordHash: passwordHash,
        role: role === 'admin' ? 'admin' : 'user',
        hasBetaAccess: false,
        mustChangePassword: true,
        isLocked: false,
        mpBannedUntil: null,
        createdAt: new Date().toISOString()
    });

    writeUsers(users);
    res.json({ success: true, message: 'Benutzer erstellt!' });
});

app.post('/api/admin/reset-password', requireAdmin, (req, res) => {
    const { username, newTempPassword } = req.body;
    let users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden.' });

    user.salt = crypto.randomBytes(16).toString('hex');
    user.passwordHash = hashPassword(newTempPassword, user.salt);
    user.mustChangePassword = true;

    writeUsers(users);
    res.json({ success: true, message: 'Passwort zurückgesetzt.' });
});

app.post('/api/admin/toggle-beta', requireAdmin, (req, res) => {
    const { username } = req.body;
    let users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden.' });

    user.hasBetaAccess = !user.hasBetaAccess;
    writeUsers(users);
    res.json({ success: true, message: 'Beta-Zugang aktualisiert.' });
});

app.post('/api/admin/toggle-lock', requireAdmin, (req, res) => {
    const { username } = req.body;
    let users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden.' });

    user.isLocked = !user.isLocked;
    writeUsers(users);
    res.json({ success: true, message: 'Sperrstatus aktualisiert.' });
});

app.post('/api/admin/set-lock', requireAdmin, (req, res) => {
    const { username, locked } = req.body;
    if (!username) return res.json({ success: false, message: 'Benutzername erforderlich.' });

    let users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden.' });

    // Ohne Angabe wird gesperrt, damit ein Report niemals versehentlich entsperrt.
    user.isLocked = locked === undefined || locked === null ? true : !!locked;
    writeUsers(users);

    res.json({
        success: true,
        isLocked: user.isLocked,
        message: user.isLocked ? 'Benutzer gesperrt.' : 'Sperre aufgehoben.'
    });
});

app.post('/api/admin/delete-user', requireAdmin, (req, res) => {
    const { username } = req.body;
    let users = readUsers();
    const index = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());

    if (index === -1) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden.' });

    users.splice(index, 1);
    writeUsers(users);
    res.json({ success: true, message: 'Benutzer gelöscht.' });
});

app.post('/api/admin/publish-news', requireAdmin, (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) return res.json({ success: false, message: 'Titel und Inhalt erforderlich.' });

    try {
        let newsList = readNews();
        newsList.unshift({
            id: Date.now().toString(),
            title: title.trim(),
            content: content.trim(),
            date: new Date().toLocaleDateString('de-DE') + ' ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        });

        if (newsList.length > 3) newsList = newsList.slice(0, 3);
        writeNews(newsList);

        res.json({ success: true, message: 'News veröffentlicht!' });
    } catch (e) {
        res.json({ success: false, message: 'Fehler: ' + e.message });
    }
});

// Admin-Endpunkt: Spiel-Version & direkten GitHub-Release-Link hinterlegen
app.post('/api/admin/update-game-release', requireAdmin, (req, res) => {
    const { version, downloadUrl } = req.body;
    if (!version || !downloadUrl) {
        return res.json({ success: false, message: 'Version und Download-Link erforderlich.' });
    }

    try {
        writeGameInfo({ version: version.trim(), downloadUrl: downloadUrl.trim() });
        res.json({ success: true, message: 'Spiel-Release erfolgreich aktualisiert!' });
    } catch (e) {
        res.json({ success: false, message: 'Fehler beim Speichern: ' + e.message });
    }
});

// ==========================================
// REPORTS (kommen aus dem Spiel, wenn ein Spieler jemanden reportet)
// ==========================================

app.post('/api/reports', async (req, res) => {
    const reporterName = sanitizeName(req.body.reporterName, 24);
    const targetName = sanitizeName(req.body.targetName, 24);
    const reason = sanitizeName(req.body.reason, MAX_REPORT_REASON);

    if (!reporterName || !targetName || !reason) {
        return res.status(400).json({ success: false, message: 'Reporter, gemeldeter Spieler und Grund sind erforderlich.' });
    }
    if (reporterName.toLowerCase() === targetName.toLowerCase()) {
        return res.status(400).json({ success: false, message: 'Ungültiger Report.' });
    }
    if (isRateLimited(reporterName.toLowerCase())) {
        return res.status(429).json({ success: false, message: 'Zu viele Reports. Bitte später erneut versuchen.' });
    }

    const users = readUsers();
    const target = findUserByName(users, targetName);

    const report = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        reporterName: reporterName,
        targetName: target ? (target.displayName || target.username) : targetName,
        targetUsername: target ? target.username : null,
        reason: reason,
        createdAt: new Date().toISOString(),
        status: 'open',
        resolvedAt: null,
        resolvedBy: null
    };

    try {
        const reports = readReports();
        reports.unshift(report);
        writeReports(reports.slice(0, MAX_REPORTS));
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Report konnte nicht gespeichert werden.' });
    }

    forwardReportToDiscord(
        '**Spielerreport**\n' +
        'Reporter: ' + reporterName + '\n' +
        'Gemeldeter Spieler: ' + report.targetName + '\n' +
        'Grund: ' + reason
    );

    res.json({ success: true, message: 'Report gespeichert.', matchedAccount: !!target });
});

app.get('/api/admin/reports', requireAdmin, (req, res) => {
    const reports = readReports();
    res.json({
        success: true,
        open: reports.filter(r => r.status === 'open').length,
        reports: reports
    });
});

app.post('/api/admin/reports/resolve', requireAdmin, (req, res) => {
    const { id } = req.body;
    const reports = readReports();
    const report = reports.find(r => r.id === id);
    if (!report) return res.status(404).json({ success: false, message: 'Report nicht gefunden.' });

    report.status = 'resolved';
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = req.adminUser.username;
    writeReports(reports);

    res.json({ success: true, message: 'Report als erledigt markiert.' });
});

app.post('/api/admin/mp-ban', requireAdmin, (req, res) => {
    const { username, minutes } = req.body;
    const duration = Number(minutes);
    if (!username || !Number.isFinite(duration) || duration < 1 || duration > 525600) {
        return res.status(400).json({ success: false, message: 'Ungültige Dauer (1 Minute bis 1 Jahr).' });
    }

    let users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden.' });

    user.mpBannedUntil = new Date(Date.now() + duration * 60000).toISOString();
    writeUsers(users);

    res.json({
        success: true,
        mpBannedUntil: user.mpBannedUntil,
        message: 'Multiplayer gesperrt bis ' + new Date(user.mpBannedUntil).toLocaleString('de-DE') + '.'
    });
});

app.post('/api/admin/mp-ban-clear', requireAdmin, (req, res) => {
    const { username } = req.body;
    let users = readUsers();
    const user = users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden.' });

    user.mpBannedUntil = null;
    writeUsers(users);

    res.json({ success: true, message: 'Multiplayer-Sperre aufgehoben.' });
});

// Vom Spiel beim Betreten/Hosten einer Lobby aufgerufen.
app.post('/api/ban-status', (req, res) => {
    const playerName = sanitizeName(req.body.playerName, 24);
    if (!playerName) return res.status(400).json({ success: false, message: 'Spielername fehlt.' });

    const user = findUserByName(readUsers(), playerName);
    if (!user) {
        return res.json({
            success: true,
            found: false,
            accountLocked: false,
            multiplayerBanned: false,
            until: null
        });
    }

    const ban = getMultiplayerBan(user);
    res.json({
        success: true,
        found: true,
        displayName: user.displayName || user.username,
        accountLocked: !!user.isLocked,
        multiplayerBanned: ban.banned,
        until: ban.until
    });
});

const PORT = process.env.PORT || 25433;
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});