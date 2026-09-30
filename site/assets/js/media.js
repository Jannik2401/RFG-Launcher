/* ==========================================================================
   RFG Website – Medien-Galerie
   Lädt site/media/media.json und rendert Bilder und Videos.
   ========================================================================== */

(function () {
    'use strict';

    var MANIFEST = 'media/media.json';
    var BASE = 'media/';

    var IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif)$/i;
    var VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;

    var grid = document.getElementById('media-grid');
    if (!grid) return;

    var filters = Array.prototype.slice.call(document.querySelectorAll('.filter'));
    var lightbox = document.getElementById('lightbox');
    var lbContent = document.getElementById('lb-content');
    var lbTitle = document.getElementById('lb-title');
    var lbClose = document.getElementById('lb-close');
    var lbPrev = document.getElementById('lb-prev');
    var lbNext = document.getElementById('lb-next');

    var allItems = [];
    var visibleItems = [];
    var current = 0;
    var activeFilter = 'all';
    var lastFocused = null;

    /* ------------------------------------------------------------ Helfer */

    function humanSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function formatDate(value) {
        if (!value) return '';
        var d = new Date(value);
        if (isNaN(d)) return '';
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function titleFromFile(src) {
        var file = src.split('/').pop();
        var base = file.replace(/\.[^.]+$/, '');
        return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    var ICON_IMAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
    var ICON_VIDEO = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
    var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

    /* ------------------------------------------------------------ Rendern */

    function renderStats() {
        var images = allItems.filter(function (i) { return i.type === 'image'; }).length;
        var videos = allItems.filter(function (i) { return i.type === 'video'; }).length;
        setText('stat-images', String(images));
        setText('stat-videos', String(videos));
        setText('stat-total', String(images + videos));
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function emptyState(title, text) {
        return '<div class="empty">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' +
            '<h3>' + escapeHtml(title) + '</h3>' +
            '<p>' + text + '</p></div>';
    }

    function render() {
        visibleItems = allItems.filter(function (item) {
            return activeFilter === 'all' || item.type === activeFilter;
        });

        grid.innerHTML = '';

        if (!visibleItems.length) {
            if (allItems.length) {
                grid.innerHTML = emptyState('Nichts in dieser Kategorie',
                    'Für diesen Filter gibt es aktuell keine Medien.');
            } else {
                grid.innerHTML = emptyState('Noch keine Medien',
                    'Lege Bilder in <code>site/media/images/</code> und Videos in ' +
                    '<code>site/media/videos/</code>, führe danach <code>tools\\media-sync.ps1</code> ' +
                    'aus und committe – dann erscheinen sie hier automatisch.');
            }
            return;
        }

        visibleItems.forEach(function (item, index) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'media-item';
            btn.setAttribute('data-index', String(index));

            // Vorschau bzw. Poster verwenden, damit die Galerie nicht die
            // vollstaendigen Originaldateien laedt.
            var thumbSrc = item.type === 'video'
                ? (item.poster ? BASE + item.poster : '')
                : (item.preview ? BASE + item.preview : (item.src ? BASE + item.src : ''));

            var badge = item.type === 'video'
                ? '<span class="media-item__badge">' + ICON_VIDEO + 'Video</span>'
                : '<span class="media-item__badge">' + ICON_IMAGE + 'Bild</span>';

            var thumb = thumbSrc
                ? '<img src="' + escapeHtml(thumbSrc) + '" alt="" loading="lazy" decoding="async">'
                : '';

            var play = item.type === 'video'
                ? '<span class="media-item__play"><span>' + ICON_PLAY + '</span></span>'
                : '';

            var meta = [];
            if (item.date) meta.push(formatDate(item.date));
            if (item.size) meta.push(humanSize(item.size));

            btn.innerHTML =
                '<span class="media-item__thumb">' + thumb + badge + play + '</span>' +
                '<span class="media-item__cap">' +
                '<span class="media-item__title">' + escapeHtml(item.title) + '</span>' +
                (meta.length ? '<span class="media-item__meta">' + escapeHtml(meta.join(' · ')) + '</span>' : '') +
                '</span>';

            btn.addEventListener('click', function () { openLightbox(index); });
            grid.appendChild(btn);
        });
    }

    /* ---------------------------------------------------------- Lightbox */

    function openLightbox(index) {
        current = index;
        lastFocused = document.activeElement;
        paintLightbox();
        lightbox.setAttribute('data-open', 'true');
        document.body.style.overflow = 'hidden';
        lbClose.focus();
    }

    function closeLightbox() {
        lightbox.setAttribute('data-open', 'false');
        document.body.style.overflow = '';
        lbContent.innerHTML = '';
        if (lastFocused) lastFocused.focus();
    }

    function paintLightbox() {
        var item = visibleItems[current];
        if (!item) return;

        lbTitle.textContent = item.title;

        if (item.type === 'video') {
            lbContent.innerHTML = '<video controls autoplay playsinline preload="metadata"' +
                (item.poster ? ' poster="' + escapeHtml(BASE + item.poster) + '"' : '') +
                ' src="' + escapeHtml(BASE + item.src) + '"></video>';
        } else {
            lbContent.innerHTML = '<img src="' + escapeHtml(BASE + item.src) + '" alt="' + escapeHtml(item.title) + '">';
        }

        var single = visibleItems.length < 2;
        lbPrev.hidden = single;
        lbNext.hidden = single;
    }

    function step(delta) {
        if (visibleItems.length < 2) return;
        current = (current + delta + visibleItems.length) % visibleItems.length;
        paintLightbox();
    }

    /* -------------------------------------------------------------- Init */

    function bind() {
        filters.forEach(function (btn) {
            btn.addEventListener('click', function () {
                activeFilter = btn.getAttribute('data-filter');
                filters.forEach(function (other) {
                    other.setAttribute('aria-pressed', String(other === btn));
                });
                render();
            });
        });

        lbClose.addEventListener('click', closeLightbox);
        lbPrev.addEventListener('click', function () { step(-1); });
        lbNext.addEventListener('click', function () { step(1); });

        lightbox.addEventListener('click', function (event) {
            if (event.target === lightbox) closeLightbox();
        });

        document.addEventListener('keydown', function (event) {
            if (lightbox.getAttribute('data-open') !== 'true') return;
            if (event.key === 'Escape') closeLightbox();
            else if (event.key === 'ArrowLeft') step(-1);
            else if (event.key === 'ArrowRight') step(1);
        });
    }

    function normalize(entries, forcedType) {
        return (entries || []).map(function (entry) {
            var src = entry.src || entry.file || '';
            var type = forcedType || (VIDEO_EXT.test(src) ? 'video' : 'image');
            return {
                src: src,
                type: type,
                title: entry.title || titleFromFile(src),
                date: entry.date || '',
                size: entry.size || 0,
                poster: entry.poster || '',
                preview: entry.preview || ''
            };
        }).filter(function (entry) { return entry.src; });
    }

    function load() {
        fetch(MANIFEST, { cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                allItems = normalize(data.images, 'image').concat(normalize(data.videos, 'video'));
                renderStats();
                render();
            })
            .catch(function () {
                renderStats();
                grid.innerHTML = emptyState('Galerie nicht verfügbar',
                    'Die Medienliste konnte nicht geladen werden. Bilde <code>' + MANIFEST +
                    '</code> mit <code>tools\\media-sync.ps1</code>, um die Galerie zu befüllen.');
            });
    }

    document.addEventListener('DOMContentLoaded', function () {
        bind();
        load();
    });
})();
