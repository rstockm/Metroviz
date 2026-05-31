import { downloadBlob, sanitizeSvg, sanitizeFilename } from './utils.js';

export const fileManagerActions = {
/**
     * Loads the index of saved files from localStorage.
     */
    loadIndex() {
        try {
            const index = localStorage.getItem('metroviz_index');
            if (index) {
                this.savedFiles = JSON.parse(index);
            }
        } catch(e) { console.warn('loadIndex failed:', e); }
    },

/**
     * Saves the current index of files to localStorage.
     */
    saveIndex() {
        try {
            localStorage.setItem('metroviz_index', JSON.stringify(this.savedFiles));
        } catch (e) {
            console.error('Failed to save index:', e);
        }
    },

/**
     * Loads a specific file by name from localStorage.
     * @param {string} name - The name of the file to load.
     */
    async loadFile(name) {
        if (!name) return;
        try {
            const dataStr = localStorage.getItem('metroviz_file_' + name);
            if (dataStr) {
                this.rawJson = dataStr;
                this.updateFromJson();
                this.currentFileName = name;
            }
        } catch (e) {
            await this.dialogAlert(i18next.t('js.loadFileError') + e.message, i18next.t('js.errorTitle'));
        }
    },

/**
     * Saves the current data to localStorage under the current file name.
     * Prompts for a new name if no file is currently selected.
     */
    async saveFile() {
        if (!this.currentFileName) {
            return await this.saveAsNew();
        }
        this.rawJson = JSON.stringify(this.data, null, 2);
        try {
            localStorage.setItem('metroviz_file_' + this.currentFileName, this.rawJson);
            await this.dialogAlert(i18next.t('js.savedSuccess').replace('{{name}}', this.currentFileName), i18next.t('js.savedTitle'));
        } catch (e) {
            console.error('Failed to save file:', e);
            await this.dialogAlert(i18next.t('js.saveError') + e.message, i18next.t('js.errorTitle'));
        }
    },

/**
     * Prompts the user for a new name and saves the current data as a new file.
     */
    async saveAsNew() {
        const name = await this.dialogPrompt(
            i18next.t('js.promptNewName'),
            i18next.t('js.defaultNewName'),
            i18next.t('js.defaultNewTitle')
        );
        if (name === null) return;
        const trimmed = (name || '').trim();
        if (!trimmed) return;
        if (this.savedFiles.includes(trimmed)) {
            const ok = await this.dialogConfirm(
                i18next.t('js.confirmOverwrite'),
                i18next.t('js.overwriteTitle')
            );
            if (!ok) return;
        } else {
            this.savedFiles.push(trimmed);
            this.saveIndex();
        }
        this.currentFileName = trimmed;
        await this.saveFile();
    },

/**
     * Creates a new, empty roadmap with default data.
     */
    createNew() {
        const year = new Date().getFullYear();
        this.currentFileName = '';
        this.editorVisible = true;
        this.data = {
            meta: { title: i18next.t('js.defaultNewTitle'), organization: '' },
            timeline: { start: `${year}-Q1`, end: `${year + 1}-Q3` },
            events: [],
            zones: [],
            lines: []
        };
        this.rawJson = JSON.stringify(this.data, null, 2);
        this.renderMap(this.data);
    },

/**
     * Handles importing JSON data from a selected or dropped file.
     * Includes a 5MB size limit security check.
     * @param {File} file - The file object to read.
     */
    importJsonFromFile(file) {
        if (!file) return;
        
        // Security check: Limit upload size to prevent DoS via excessively large files
        if (file.size > 5 * 1024 * 1024) { // 5 MB
            if (this.dialogAlert) {
                this.dialogAlert(i18next.t('js.importFileTooLarge'), i18next.t('js.errorTitle'));
            } else {
                alert(i18next.t('js.importFileTooLarge'));
            }
            return;
        }
        
        const reader = new FileReader();
        reader.onerror = (err) => console.error('FileReader error:', err);
        reader.onload = (e) => {
            this.rawJson = e.target.result;
            this.updateFromJson();
            this.currentFileName = '';
            this.importModalOpen = false;
        };
        reader.readAsText(file);
    },

/**
     * Handles the file input change event for importing.
     * @param {Event} event - The DOM change event.
     */
    handleImportFileInput(event) {
        const file = event.target.files[0];
        if (file) this.importJsonFromFile(file);
        event.target.value = '';
    },

/**
     * Handles the drag-and-drop event for importing JSON files.
     * @param {DragEvent} event - The DOM drop event.
     */
    importDropHandler(event) {
        event.preventDefault();
        this.importDropActive = false;
        const file = event.dataTransfer.files[0];
        if (file) this.importJsonFromFile(file);
    },

/**
     * Triggers an import from the provided URL.
     */
    async importFromUrl() {
        const url = this.importUrl.trim();
        if (!url) return;
        const ok = await this.loadFromRemoteSource(url);
        if (ok) {
            this.importModalOpen = false;
            this.importUrl = '';
        }
    },

/**
     * Loads the default example dataset (data/example.json).
     */
    async loadInitialData() {
        try {
            const response = await fetch('data/example.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.rawJson = await response.text();
            this.updateFromJson();
        } catch (error) {
            console.error('Failed to initialize MetroViz:', error);
        }
    },

/**
     * Attempts to load JSON data from a remote URL.
     * Prevents XSS, checks protocol, timeouts, and enforces size limits.
     * @param {string} url - The external JSON URL to fetch.
     * @returns {boolean} True if loading succeeded, false otherwise.
     */
    async loadFromRemoteSource(url) {
        this.jsonError = '';
        if (!url || typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('http://'))) {
            this.jsonError = i18next.t('js.remoteLoadFailedPrefix');
            return false;
        }
        if (url.length > 2000) {
            this.jsonError = i18next.t('js.remoteLoadFailedTooLong');
            return false;
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) {
                this.jsonError = i18next.t('js.remoteLoadFailedHttp').replace('{{status}}', response.status);
                return false;
            }
            
            // Security check: Limit payload size to prevent DoS via remote URLs
            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
                this.jsonError = i18next.t('js.remoteLoadFailedTooLarge');
                return false;
            }
            
            this.rawJson = await response.text();
            
            // Fallback check if content-length header was missing
            if (this.rawJson.length > 5 * 1024 * 1024) {
                this.jsonError = i18next.t('js.remoteLoadFailedContentTooLarge');
                this.rawJson = '';
                return false;
            }
            
            this.currentFileName = '';
            this.updateFromJson();
            return true;
        } catch (e) {
            this.jsonError = i18next.t('js.remoteLoadFailedOther') + (e.name === 'AbortError' ? i18next.t('js.remoteLoadFailedTimeout') : e.message);
            return false;
        }
    },

    /**
     * Serializes the current SVG element into a data URL.
     * 
     * @returns {string|null} The data URL of the SVG, or null if it fails.
     */
    _getSvgDataUrl() {
        const svgElement = window.app.renderer.svgElement;
        if (!svgElement) return null;

        try {
            const serializer = new XMLSerializer();
            let source = serializer.serializeToString(svgElement);
            
            // Workaround: Manually inject missing XML namespaces.
            // When serializing DOM nodes, default namespaces might be omitted by the browser,
            // which causes the resulting SVG file to be invalid when opened standalone.
            if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
                source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
                source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
            }

            source = sanitizeSvg(source);

            source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

            return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
        } catch (e) {
            console.error('Fehler beim SVG-Serialisieren:', e);
            return null;
        }
    },

    /**
     * Exports the current roadmap view as an SVG file.
     */
    _contentBounds(svg) {
        // Inhaltsgrenzen (alle Seiten) inkl. Transformationen der rotierten Labels.
        // Ausgeklammert: ueberbreite Zonen-Baender (.zone-band) und Vollflaechen-Hintergrund (width=100%).
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        svg.querySelectorAll('text, circle, line, path, polyline, polygon, rect').forEach((el) => {
            if (el.classList && el.classList.contains('zone-band')) return;
            if (el.getAttribute('width') === '100%') return;
            let bb;
            try { bb = el.getBBox(); } catch (e) { return; }
            if (!bb || (bb.width === 0 && bb.height === 0)) return;
            const m = el.getCTM();
            if (!m) return;
            for (const x of [bb.x, bb.x + bb.width]) {
                for (const y of [bb.y, bb.y + bb.height]) {
                    const px = m.a * x + m.c * y + m.e;
                    const py = m.b * x + m.d * y + m.f;
                    if (px < minX) minX = px;
                    if (px > maxX) maxX = px;
                    if (py < minY) minY = py;
                    if (py > maxY) maxY = py;
                }
            }
        });
        return isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
    },

    exportSVG() {
        const svgElement = window.app.renderer.svgElement;
        if (!svgElement) return;

        try {
            const vb = svgElement.viewBox.baseVal;
            const bounds = this._contentBounds(svgElement);
            const pad = 20;
            const cropX = bounds ? Math.floor(bounds.x - pad) : vb.x;
            const cropY = bounds ? Math.floor(bounds.y - pad) : vb.y;
            const cropW = bounds ? Math.ceil(bounds.width + pad * 2) : vb.width;
            const cropH = bounds ? Math.ceil(bounds.height + pad * 2) : vb.height;

            const serializer = new XMLSerializer();
            let source = serializer.serializeToString(svgElement);

            if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
                source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
                source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
            }

            source = source.replace(
                /viewBox="[^"]*"/,
                `viewBox="${cropX} ${cropY} ${cropW} ${cropH}"`
            );

            source = sanitizeSvg(source);
            source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

            const filename = sanitizeFilename(this.currentFileName) + '.svg';
            downloadBlob(source, 'image/svg+xml;charset=utf-8;', filename);
        } catch (e) {
            console.error('Fehler beim SVG-Export:', e);
        }
    },

    /**
     * Exports the current roadmap view as a high-resolution PNG file.
     */
    exportPNG() {
        const svgElement = window.app.renderer.svgElement;
        if (!svgElement) return;

        const vb = svgElement.viewBox.baseVal;
        const bounds = this._contentBounds(svgElement);
        const pad = 20;
        const cropX = bounds ? Math.floor(bounds.x - pad) : vb.x;
        const cropY = bounds ? Math.floor(bounds.y - pad) : vb.y;
        const cropW = bounds ? Math.ceil(bounds.width + pad * 2) : vb.width;
        const cropH = bounds ? Math.ceil(bounds.height + pad * 2) : vb.height;

        // Crop-viewBox direkt ins SVG schreiben (inkl. fester Pixelgroesse), damit das
        // gerasterte Bild exakt den Crop-Bereich enthaelt - auch Labels ausserhalb der Original-viewBox.
        let source;
        try {
            const serializer = new XMLSerializer();
            source = serializer.serializeToString(svgElement);
            if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
                source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
                source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
            }
            source = source.replace(/viewBox="[^"]*"/, `viewBox="${cropX} ${cropY} ${cropW} ${cropH}"`);
            source = source.replace(/(<svg\b[^>]*?)\swidth="[^"]*"/, '$1');
            source = source.replace(/(<svg\b[^>]*?)\sheight="[^"]*"/, '$1');
            source = source.replace(/<svg\b/, `<svg width="${cropW}" height="${cropH}"`);
            source = sanitizeSvg(source);
        } catch (e) {
            console.error('Fehler beim SVG-Serialisieren fuer PNG:', e);
            return;
        }
        const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 4; // High resolution
            canvas.width = cropW * scale;
            canvas.height = cropH * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob((blob) => {
                const filename = sanitizeFilename(this.currentFileName) + '.png';
                downloadBlob(blob, 'image/png', filename);
            }, 'image/png');
        };
        img.onerror = () => {
            console.error('Fehler beim Rendern des SVG fuer den PNG Export.');
            this.dialogAlert(i18next.t('js.pngExportError'), i18next.t('js.errorTitle'));
        };
        img.src = svgUrl;
    },

    /**
     * Exports the current roadmap view as a PDF file.
     * Requires jsPDF and svg2pdf libraries to be loaded globally.
     */
    async exportPDF() {
        const svgElement = window.app.renderer.svgElement;
        if (!svgElement) return;

        const vb = svgElement.viewBox.baseVal;
        const bounds = this._contentBounds(svgElement);
        const pad = 20;
        const cropX = bounds ? Math.floor(bounds.x - pad) : vb.x;
        const cropY = bounds ? Math.floor(bounds.y - pad) : vb.y;
        const cropW = bounds ? Math.ceil(bounds.width + pad * 2) : vb.width;
        const cropH = bounds ? Math.ceil(bounds.height + pad * 2) : vb.height;

        if (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF && window.svg2pdf) {
            const pdf = new window.jspdf.jsPDF({
                orientation: cropW > cropH ? 'landscape' : 'portrait',
                unit: 'pt',
                format: [cropW, cropH]
            });

            // PDF auf Klon mit Crop-viewBox rendern, damit die Live-Ansicht nicht flackert
            const clone = svgElement.cloneNode(true);
            clone.setAttribute('viewBox', `${cropX} ${cropY} ${cropW} ${cropH}`);
            clone.setAttribute('width', cropW);
            clone.setAttribute('height', cropH);
            clone.setAttribute('preserveAspectRatio', 'xMinYMin meet');
            clone.style.position = 'absolute';
            clone.style.left = '-99999px';
            clone.style.top = '0';
            document.body.appendChild(clone);

            try {
                await pdf.svg(clone, { x: 0, y: 0, width: cropW, height: cropH });
                const filename = sanitizeFilename(this.currentFileName) + '.pdf';
                pdf.save(filename);
            } catch (err) {
                console.error("Fehler beim SVG-to-PDF Export:", err);
                this.dialogAlert(i18next.t('js.pdfExportError') + err.message, i18next.t('js.errorTitle'));
            } finally {
                document.body.removeChild(clone);
            }
        } else {
            console.error("jsPDF- oder svg2pdf-Bibliothek konnte nicht gefunden werden.");
            this.dialogAlert(i18next.t('js.pdfExportErrorLibs'), i18next.t('js.errorTitle'));
        }
    },

/**
     * Exports the raw JSON representation of the current roadmap state.
     */
    exportJSON() {
        if (!this.rawJson) return;
        const filename = sanitizeFilename(this.currentFileName) + '.json';
        downloadBlob(this.rawJson, 'application/json;charset=utf-8;', filename);
    }
};
