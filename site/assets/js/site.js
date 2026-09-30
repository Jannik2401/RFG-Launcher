/* ==========================================================================
   RFG Website – gemeinsames Verhalten
   Keine Abhängigkeiten. Nutzt version.json aus dem Repo, damit die
   Download-Kategorie immer automatisch den aktuellen Release zeigt.
   ========================================================================== */

(function () {
    'use strict';

    var REPO = 'Jannik2401/RFG-Launcher';
    // Reihenfolge wichtig: der Release-Workflow legt den Tag "latest" an und
    // schreibt version.json erst danach auf main. Deshalb zuerst main lesen -
    // dort steht immer die gerade veroeffentlichte Version.
    var RAW_MAIN = 'https://raw.githubusercontent.com/' + REPO + '/main/version.json';
    var RAW_TAG = 'https://raw.githubusercontent.com/' + REPO + '/latest/version.json';
    var API_RELEASE = 'https://api.github.com/repos/' + REPO + '/releases/latest';
    var FALLBACK_DOWNLOAD = 'https://github.com/' + REPO + '/releases/download/latest/RFGlauncher.exe';
    var META_CACHE_KEY = 'rfg.release.meta';
    var META_CACHE_MS = 30 * 60 * 1000;

    /* ---------------------------------------------------------- Utilities */

    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

    function formatBytes(bytes) {
        if (!bytes || bytes < 0) return null;
        var mb = bytes / (1024 * 1024);
        return mb >= 100 ? Math.round(mb) + ' MB' : mb.toFixed(1) + ' MB';
    }

    function formatDate(iso) {
        if (!iso) return null;
        var d = new Date(iso);
        if (isNaN(d)) return null;
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    /* --------------------------------------------------------- Navigation */

    function initNav() {
        var toggle = $('.nav-toggle');
        var nav = $('#site-nav');
        if (!toggle || !nav) return;

        toggle.addEventListener('click', function () {
            var open = nav.getAttribute('data-open') === 'true';
            nav.setAttribute('data-open', String(!open));
            toggle.setAttribute('aria-expanded', String(!open));
        });

        $$('#site-nav a').forEach(function (link) {
            link.addEventListener('click', function () {
                nav.setAttribute('data-open', 'false');
                toggle.setAttribute('aria-expanded', 'false');
            });
        });

        // Aktiven Menüpunkt markieren
        var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        $$('#site-nav a').forEach(function (link) {
            var target = (link.getAttribute('href') || '').split('/').pop().toLowerCase();
            if (target === here) link.setAttribute('aria-current', 'page');
        });
    }

    /* -------------------------------------------------------- Download-CTA */

    function applyDownloadUrl(url) {
        $$('[data-download]').forEach(function (el) {
            el.setAttribute('href', url);
        });
    }

    function setVersion(text) {
        $$('[data-version]').forEach(function (el) { el.textContent = text; });
    }

    function setMeta(pairs) {
        Object.keys(pairs).forEach(function (key) {
            var value = pairs[key];
            if (!value) return;
            $$('[data-meta="' + key + '"]').forEach(function (el) {
                el.textContent = value;
                el.hidden = false;
            });
        });
    }

    function setStatus(state, text) {
        $$('[data-status]').forEach(function (el) {
            if (text) el.textContent = text;
            if (state) el.setAttribute('data-state', state);
        });
    }

    /* Release-Metadaten (Größe/Datum) über die GitHub-API – best effort,
       mit Cache, damit das 60-Requests/Stunden-Limit nicht verbraucht wird. */
    function loadReleaseMeta() {
        var cached = null;
        try { cached = JSON.parse(localStorage.getItem(META_CACHE_KEY)); } catch (e) { /* ignore */ }

        if (cached && (Date.now() - cached.ts) < META_CACHE_MS) {
            renderMeta(cached.data);
            return;
        }

        fetch(API_RELEASE, { headers: { Accept: 'application/vnd.github+json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data) return;
                var payload = {
                    size: formatBytes(data.assets && data.assets[0] && data.assets[0].size),
                    date: formatDate(data.published_at),
                    name: data.name
                };
                try { localStorage.setItem(META_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: payload })); } catch (e) { /* ignore */ }
                renderMeta(payload);
            })
            .catch(function () { /* still fine – Download funktioniert ohne diese Angaben */ });
    }

    function renderMeta(payload) {
        if (!payload) return;
        setMeta({ size: payload.size, date: payload.date, release: payload.name });
    }

    function initVersion() {
        applyDownloadUrl(FALLBACK_DOWNLOAD);
        setStatus('loading', 'Version wird geladen …');

        var sources = [RAW_MAIN, RAW_TAG];

        (function attempt(i) {
            if (i >= sources.length) {
                setStatus('fallback', 'Immer aktuell');
                loadReleaseMeta();
                return;
            }
            fetch(sources[i], { cache: 'no-store' })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function (data) {
                    if (data && data.downloadUrl) applyDownloadUrl(data.downloadUrl);
                    if (data && data.version) setVersion(data.version);
                    setStatus('ready', 'Version ' + (data && data.version ? data.version : '') + ' · automatisch aktuell');
                    loadReleaseMeta();
                })
                .catch(function () { attempt(i + 1); });
        })(0);
    }

    /* ------------------------------------------------------------- Reveal */

    function initReveal() {
        var items = $$('.reveal');
        if (!items.length) return;

        if (!('IntersectionObserver' in window) ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            items.forEach(function (el) { el.classList.add('is-visible'); });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                io.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        items.forEach(function (el, i) {
            el.style.transitionDelay = Math.min(i % 6, 5) * 60 + 'ms';
            io.observe(el);
        });
    }

    /* --------------------------------------------------------------- Copy */

    function initCopy() {
        $$('[data-copy]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var value = btn.getAttribute('data-copy');
                var done = function () {
                    var old = btn.textContent;
                    btn.textContent = 'Kopiert!';
                    setTimeout(function () { btn.textContent = old; }, 1600);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(value).then(done).catch(function () {});
                }
            });
        });
    }

    /* --------------------------------------------------------------- Init */

    document.addEventListener('DOMContentLoaded', function () {
        initNav();
        initVersion();
        initReveal();
        initCopy();
        $$('[data-year]').forEach(function (el) {
            el.textContent = String(new Date().getFullYear());
        });
    });
})();
