import { DataModel } from './data-model.js';
import { LayoutEngine } from './layout-engine.js';
import { MetroRenderer } from './metro-renderer.js';

class App {
    constructor() {
        this.dataModel = new DataModel();
        this.layoutEngine = new LayoutEngine();
        this.renderer = new MetroRenderer('#metroviz-container');
        
        this.initAlpine();
        this.setupEventListeners();
    }

    initAlpine() {
        document.addEventListener('alpine:init', () => {
            Alpine.data('metrovizApp', () => ({
                editorVisible: false,
                globalView: 'map',
                activeTab: 'visual',
                rawJson: '',
                jsonError: '',
                savedFiles: [],
                currentFileName: '',
                data: {
                    meta: { title: '', organization: '' },
                    timeline: { start: '', end: '' },
                    events: [],
                    zones: [],
                    lines: []
                },

                async init() {
                    this.loadIndex();
                    this.parseUrlParams();

                    let loaded = false;
                    if (this._urlHadData) {
                        this.updateFromJson();
                        loaded = true;
                    }
                    if (!loaded && this._urlSource) {
                        loaded = await this.loadFromRemoteSource(this._urlSource);
                    }
                    if (!loaded) {
                        if (this.currentFileName && this.savedFiles.includes(this.currentFileName)) {
                            this.loadFile(this.currentFileName);
                        } else if (this.savedFiles.length > 0) {
                            this.currentFileName = this.savedFiles[0];
                            this.loadFile(this.currentFileName);
                        } else {
                            await this.loadInitialData();
                        }
                    }

                    // Set initial URL state correctly if it was defaulted
                    this.updateUrlParams();

                    // Watch states to update URL dynamically
                    this.$watch('editorVisible', () => this.updateUrlParams());
                    this.$watch('globalView', () => this.updateUrlParams());
                    this.$watch('currentFileName', () => this.updateUrlParams());
                    
                    // Watch for any changes in the parsed data object (from visual editor)
                    this.$watch('data', (value) => {
                        if (this.activeTab === 'visual') {
                            this.rawJson = JSON.stringify(value, null, 2);
                            this.renderMap(value);
                        }
                    }, { deep: true });

                    // Watch for tab changes to trigger re-renders or formatting
                    this.$watch('activeTab', (tab) => {
                        if (tab === 'json') {
                            this.rawJson = JSON.stringify(this.data, null, 2);
                        }
                    });
                },

                loadIndex() {
                    try {
                        const index = localStorage.getItem('metroviz_index');
                        if (index) {
                            this.savedFiles = JSON.parse(index);
                        }
                    } catch(e) {}
                },

                parseUrlParams() {
                    const params = new URLSearchParams(window.location.search);

                    this._urlHadData = false;
                    this._urlSource = null;

                    if (params.has('editor')) {
                        this.editorVisible = params.get('editor') === '1' || params.get('editor') === 'true';
                    }

                    if (params.has('view')) {
                        const v = params.get('view');
                        if (v === 'map' || v === 'markdown') {
                            this.globalView = v;
                        }
                    }

                    if (params.has('file')) {
                        const f = params.get('file');
                        if (this.savedFiles.includes(f)) {
                            this.currentFileName = f;
                        }
                    }

                    if (params.has('data') && typeof window.LZString !== 'undefined') {
                        const decompressed = window.LZString.decompressFromEncodedURIComponent(params.get('data'));
                        if (decompressed) {
                            this.rawJson = decompressed;
                            this.currentFileName = '';
                            this._urlHadData = true;
                        }
                    }

                    const sourceParam = params.get('source');
                    if (sourceParam && sourceParam.trim()) {
                        this._urlSource = sourceParam.trim();
                    }
                },

                updateUrlParams() {
                    const url = new URL(window.location);
                    url.searchParams.delete('data');
                    url.searchParams.delete('source');
                    url.searchParams.set('editor', this.editorVisible ? '1' : '0');
                    url.searchParams.set('view', this.globalView);
                    
                    if (this.currentFileName) {
                        url.searchParams.set('file', this.currentFileName);
                    } else {
                        url.searchParams.delete('file');
                    }
                    
                    window.history.replaceState({}, '', url);
                },

                generateShareLink() {
                    if (typeof window.LZString === 'undefined') {
                        alert('Kompression nicht verfügbar.');
                        return;
                    }
                    if (!this.rawJson || !this.rawJson.trim()) {
                        alert('Keine JSON-Daten vorhanden.');
                        return;
                    }
                    const compressed = window.LZString.compressToEncodedURIComponent(this.rawJson);
                    const shareUrl = window.location.origin + window.location.pathname + '?data=' + compressed;
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        alert('Link kopiert');
                    }).catch(() => {
                        alert('Kopieren fehlgeschlagen');
                    });
                },

                async loadFromRemoteSource(url) {
                    this.jsonError = '';
                    try {
                        const response = await fetch(url);
                        if (!response.ok) {
                            this.jsonError = 'Remote-Laden fehlgeschlagen (HTTP ' + response.status + ').';
                            return false;
                        }
                        this.rawJson = await response.text();
                        this.currentFileName = '';
                        this.updateFromJson();
                        return true;
                    } catch (e) {
                        this.jsonError = 'Remote-Laden fehlgeschlagen: ' + e.message;
                        return false;
                    }
                },

                saveIndex() {
                    localStorage.setItem('metroviz_index', JSON.stringify(this.savedFiles));
                },

                loadFile(name) {
                    if (!name) return;
                    try {
                        const dataStr = localStorage.getItem('metroviz_file_' + name);
                        if (dataStr) {
                            this.rawJson = dataStr;
                            this.updateFromJson();
                            this.currentFileName = name;
                        }
                    } catch(e) {
                        alert("Fehler beim Laden: " + e.message);
                    }
                },

                saveFile() {
                    if (!this.currentFileName) {
                        return this.saveAsNew();
                    }
                    this.rawJson = JSON.stringify(this.data, null, 2);
                    localStorage.setItem('metroviz_file_' + this.currentFileName, this.rawJson);
                    alert(`"${this.currentFileName}" erfolgreich gespeichert.`);
                },

                saveAsNew() {
                    const name = prompt("Bitte einen Namen für die neue Roadmap eingeben:", "Meine Roadmap");
                    if (!name) return;
                    if (this.savedFiles.includes(name)) {
                        if (!confirm("Eine Datei mit diesem Namen existiert bereits. Überschreiben?")) return;
                    } else {
                        this.savedFiles.push(name);
                        this.saveIndex();
                    }
                    this.currentFileName = name;
                    this.saveFile();
                },

                createNew() {
                    this.currentFileName = '';
                    this.editorVisible = true;
                    this.data = {
                        meta: { title: 'Neue Roadmap', organization: '' },
                        timeline: { start: '2020-Q1', end: '2025-Q4' },
                        events: [],
                        zones: [],
                        lines: []
                    };
                    this.rawJson = JSON.stringify(this.data, null, 2);
                    this.renderMap(this.data);
                },

                handleFileUpload(event) {
                    const file = event.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        this.rawJson = e.target.result;
                        this.updateFromJson();
                        this.currentFileName = ''; 
                    };
                    reader.readAsText(file);
                    event.target.value = ''; // reset input
                },

                exportSVG() {
                    const svgElement = window.app.renderer.svgElement;
                    if (!svgElement) return;

                    const serializer = new XMLSerializer();
                    let source = serializer.serializeToString(svgElement);
                    
                    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
                        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
                    }
                    if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
                        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
                    }

                    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

                    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
                    
                    const downloadLink = document.createElement("a");
                    downloadLink.href = url;
                    const filename = this.currentFileName ? `${this.currentFileName}.svg` : "metroviz-roadmap.svg";
                    downloadLink.download = filename;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);
                },

                exportJSON() {
                    if (!this.rawJson) return;
                    const blob = new Blob([this.rawJson], { type: 'application/json;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const downloadLink = document.createElement("a");
                    downloadLink.href = url;
                    const filename = this.currentFileName ? `${this.currentFileName}.json` : "metroviz-roadmap.json";
                    downloadLink.download = filename;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);
                    URL.revokeObjectURL(url);
                },

                exportMD() {
                    const mdStr = this.generateMarkdown();
                    if (!mdStr) return;
                    const blob = new Blob([mdStr], { type: 'text/markdown;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const downloadLink = document.createElement("a");
                    downloadLink.href = url;
                    const filename = this.currentFileName ? `${this.currentFileName}.md` : "metroviz-roadmap.md";
                    downloadLink.download = filename;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);
                    URL.revokeObjectURL(url);
                },

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

                updateFromJson() {
                    try {
                        if (!this.rawJson.trim()) return;
                        const parsed = JSON.parse(this.rawJson);
                        if (!parsed.events) parsed.events = [];
                        this.data = parsed; // This triggers the $watch above
                        this.jsonError = '';
                        this.renderMap(this.data);
                    } catch (error) {
                        this.jsonError = 'JSON Fehler: ' + error.message;
                    }
                },

                renderMap(jsonData) {
                    try {
                        // We need to pass a clone to the layout engine to avoid mutation issues
                        const clone = JSON.parse(JSON.stringify(jsonData));
                        const normalizedData = window.app.dataModel.validateAndNormalize(clone);
                        const layout = window.app.layoutEngine.calculate(normalizedData);
                        window.app.renderer.render(layout);
                    } catch (e) {
                        console.error("Render error:", e);
                    }
                },

                // Helper Methods for Visual Editor
                generateId(prefix) {
                    return prefix + '-' + Math.random().toString(36).substr(2, 6);
                },

                addEvent() {
                    if (!this.data.events) this.data.events = [];
                    this.data.events.push({
                        id: this.generateId('event'),
                        label: 'Neues Event',
                        date: this.data.timeline.start || '2025-Q1'
                    });
                },

                removeEvent(index) {
                    this.data.events.splice(index, 1);
                },

                addZone() {
                    this.data.zones.push({
                        id: this.generateId('zone'),
                        label: 'Neue Zone',
                        color: '#cccccc'
                    });
                },

                removeZone(index) {
                    this.data.zones.splice(index, 1);
                },

                moveZoneUp(index) {
                    if (index > 0) {
                        const temp = this.data.zones[index];
                        this.data.zones[index] = this.data.zones[index - 1];
                        this.data.zones[index - 1] = temp;
                    }
                },

                moveZoneDown(index) {
                    if (index < this.data.zones.length - 1) {
                        const temp = this.data.zones[index];
                        this.data.zones[index] = this.data.zones[index + 1];
                        this.data.zones[index + 1] = temp;
                    }
                },

                addLine() {
                    const zoneId = this.data.zones.length > 0 ? this.data.zones[0].id : '';
                    this.data.lines.push({
                        id: this.generateId('line'),
                        label: 'Neue Linie',
                        color: '#0078D4',
                        zone: zoneId,
                        stations: []
                    });
                },

                removeLine(index) {
                    this.data.lines.splice(index, 1);
                },

                moveLineUp(index) {
                    const line = this.data.lines[index];
                    let prevIndex = -1;
                    for (let i = index - 1; i >= 0; i--) {
                        if (this.data.lines[i].zone === line.zone) {
                            prevIndex = i;
                            break;
                        }
                    }
                    if (prevIndex !== -1) {
                        const temp = this.data.lines[index];
                        this.data.lines[index] = this.data.lines[prevIndex];
                        this.data.lines[prevIndex] = temp;
                    }
                },

                moveLineDown(index) {
                    const line = this.data.lines[index];
                    let nextIndex = -1;
                    for (let i = index + 1; i < this.data.lines.length; i++) {
                        if (this.data.lines[i].zone === line.zone) {
                            nextIndex = i;
                            break;
                        }
                    }
                    if (nextIndex !== -1) {
                        const temp = this.data.lines[index];
                        this.data.lines[index] = this.data.lines[nextIndex];
                        this.data.lines[nextIndex] = temp;
                    }
                },

                canMoveLineUp(index) {
                    const line = this.data.lines[index];
                    for (let i = index - 1; i >= 0; i--) {
                        if (this.data.lines[i].zone === line.zone) return true;
                    }
                    return false;
                },

                canMoveLineDown(index) {
                    const line = this.data.lines[index];
                    for (let i = index + 1; i < this.data.lines.length; i++) {
                        if (this.data.lines[i].zone === line.zone) return true;
                    }
                    return false;
                },

                addStation(line) {
                    if (!line.stations) line.stations = [];
                    line.stations.push({
                        id: this.generateId('station'),
                        label: 'Neue Station',
                        date: this.data.timeline.start || '2025-Q1',
                        type: 'milestone'
                    });
                },

                removeStation(line, index) {
                    line.stations.splice(index, 1);
                },

                resortAndClean() {
                    const parseDate = (dateStr) => {
                        if (!dateStr) return new Date();
                        if (dateStr.includes('-Q')) {
                            const [year, q] = dateStr.split('-Q');
                            const month = (parseInt(q) - 1) * 3;
                            return new Date(year, month, 1);
                        }
                        return new Date(dateStr);
                    };

                    // Sort events
                    if (this.data.events) {
                        this.data.events.sort((a, b) => parseDate(a.date) - parseDate(b.date));
                    }

                    // Build a set of all valid station IDs
                    const validStationIds = new Set();
                    this.data.lines.forEach(line => {
                        if (line.stations) {
                            line.stations.forEach(s => validStationIds.add(s.id));
                        }
                    });

                    // Clean and sort stations
                    this.data.lines.forEach(line => {
                        if (line.stations) {
                            // Sort by date
                            line.stations.sort((a, b) => parseDate(a.date) - parseDate(b.date));
                            
                            // Clean up transfer references
                            line.stations.forEach(station => {
                                // If not a transfer/terminus, it shouldn't have transferTo
                                if (!['transfer', 'terminus'].includes(station.type)) {
                                    delete station.transferTo;
                                }
                                // If it has a transferTo but the target doesn't exist anymore, remove it
                                if (station.transferTo && !validStationIds.has(station.transferTo)) {
                                    delete station.transferTo;
                                }
                                
                                // Clean up transferFrom (legacy/alternative property)
                                if (!['transfer', 'start'].includes(station.type)) {
                                    delete station.transferFrom;
                                }
                                if (station.transferFrom && !validStationIds.has(station.transferFrom)) {
                                    delete station.transferFrom;
                                }
                            });
                        }
                    });
                },

                focusStation(stationId) {
                    this.editorVisible = true;
                    this.activeTab = 'visual'; 
                    
                    let targetLineIndex = -1;
                    let targetZoneIndex = -1;
                    
                    for (let z = 0; z < this.data.zones.length; z++) {
                        const zoneLines = this.data.lines.filter(l => l.zone === this.data.zones[z].id);
                        for (let l = 0; l < this.data.lines.length; l++) {
                            if (this.data.lines[l].stations && this.data.lines[l].stations.some(s => s.id === stationId)) {
                                targetLineIndex = l;
                                targetZoneIndex = this.data.zones.findIndex(zone => zone.id === this.data.lines[l].zone);
                                break;
                            }
                        }
                        if (targetLineIndex !== -1) break;
                    }

                    if (targetZoneIndex !== -1) this.data.zones[targetZoneIndex].collapsed = false;
                    
                    this.$nextTick(() => { 
                        const el = document.getElementById('editor-station-' + stationId); 
                        if(el) { 
                            const lineCard = el.closest('.line-card');
                            if (lineCard) {
                                // Need to dispatch a custom event to the specific line card because of isolated x-data
                                lineCard.dispatchEvent(new CustomEvent('expand-line'));
                            }
                            
                            setTimeout(() => {
                                el.scrollIntoView({behavior: 'smooth', block: 'center'}); 
                                el.style.transition = 'background-color 0.5s'; 
                                const oldBg = el.style.backgroundColor; 
                                el.style.backgroundColor = '#444'; 
                                setTimeout(() => el.style.backgroundColor = oldBg, 1000);
                            }, 50);
                        } 
                    });
                },

                getAllStations(excludeId) {
                    const all = [];
                    this.data.lines.forEach(line => {
                        (line.stations || []).forEach(station => {
                            if (station.id !== excludeId) {
                                all.push({
                                    id: station.id,
                                    label: station.label,
                                    lineLabel: line.label
                                });
                            }
                        });
                    });
                    return all;
                },

                generateMarkdown() {
                    if (!this.data) return '';
                    
                    let md = `# ${this.data.meta?.title || 'Roadmap'}\n`;
                    if (this.data.meta?.organization) {
                        md += `**Organisation:** ${this.data.meta.organization}  \n`;
                    }
                    if (this.data.timeline?.start || this.data.timeline?.end) {
                        md += `**Zeitraum:** ${this.data.timeline.start || '?'} - ${this.data.timeline.end || '?'}  \n`;
                    }
                    md += '\n';

                    if (this.data.events && this.data.events.length > 0) {
                        md += `## Events & Deadlines\n`;
                        this.data.events.forEach(event => {
                            md += `* **${event.date}:** ${event.label}\n`;
                        });
                        md += '\n';
                    }

                    // Create a lookup for station labels to resolve transfers
                    const stationLookup = new Map();
                    const lineLookup = new Map();
                    (this.data.lines || []).forEach(line => {
                        lineLookup.set(line.id, line.label);
                        (line.stations || []).forEach(station => {
                            stationLookup.set(station.id, { label: station.label, lineId: line.id });
                        });
                    });

                    (this.data.zones || []).forEach(zone => {
                        md += `## Themenbereich: ${zone.label}\n\n`;
                        
                        const zoneLines = (this.data.lines || []).filter(l => l.zone === zone.id);
                        if (zoneLines.length === 0) {
                            md += `*Keine Arbeitspakete in diesem Bereich*\n\n`;
                        }
                        
                        zoneLines.forEach(line => {
                            md += `### Arbeitspaket: ${line.label || 'Unbenannt'}\n`;
                            
                            if (!line.stations || line.stations.length === 0) {
                                md += `*Keine Meilensteine*\n\n`;
                                return;
                            }

                            line.stations.forEach((station, index) => {
                                let typeLabel = {
                                    'start': 'Start',
                                    'milestone': 'Meilenstein',
                                    'transfer': 'Wechsel',
                                    'terminus': 'Abschluss',
                                    'existing': 'Bestehend'
                                }[station.type] || station.type;

                                if (station.isStop) {
                                    typeLabel += ', Haltestelle';
                                }

                                // Convert date to object for duration calculation if needed
                                const parseDate = (dateStr) => {
                                    if (!dateStr) return null;
                                    if (dateStr.includes('-Q')) {
                                        const [year, q] = dateStr.split('-Q');
                                        const month = (parseInt(q) - 1) * 3;
                                        return new Date(year, month, 1);
                                    }
                                    return new Date(dateStr);
                                };

                                let durationText = '';
                                if (index < line.stations.length - 1) {
                                    const nextStation = line.stations[index + 1];
                                    const currentDateObj = parseDate(station.date);
                                    const nextDateObj = parseDate(nextStation.date);
                                    
                                    if (currentDateObj && nextDateObj) {
                                        const diffTime = nextDateObj - currentDateObj;
                                        const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
                                        durationText = ` (Dauer bis ${nextStation.label}: ca. ${diffWeeks} Wochen)`;
                                    }
                                }

                                md += `* **${station.date || '?'}:** ${station.label} (${typeLabel})${durationText}\n`;
                                
                                if (station.description && station.description.trim() !== '') {
                                    // Indent description correctly for markdown list
                                    const indentedDesc = station.description.split('\n').map(line => `  > ${line}`).join('\n');
                                    md += `${indentedDesc}\n`;
                                }
                                
                                if (station.transferTo) {
                                    const target = stationLookup.get(station.transferTo);
                                    if (target) {
                                        const targetLine = lineLookup.get(target.lineId);
                                        md += `  * ↳ *Übergabe an: ${target.label} (Arbeitspaket: ${targetLine})*\n`;
                                    }
                                }
                            });
                            md += '\n';
                        });
                    });
                    
                    return md;
                },

                renderMarkdown() {
                    const md = this.generateMarkdown();
                    if (typeof marked !== 'undefined') {
                        return marked.parse(md);
                    }
                    return '<pre>' + md + '</pre>';
                }
            }));
        });
    }

    setupEventListeners() {
        // Drag and drop support
        const container = document.getElementById('metroviz-container');
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.style.opacity = '0.5';
        });

        container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.style.opacity = '1';
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.style.opacity = '1';
            
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    // Need to update Alpine state instead of just DOM
                    const editor = document.getElementById('json-editor');
                    editor.value = event.target.result;
                    // Dispatch input event so Alpine catches it
                    editor.dispatchEvent(new Event('input'));
                };
                reader.readAsText(e.dataTransfer.files[0]);
            }
        });
    }
}

// Start app when DOM is ready
// No need to wait for DOMContentLoaded here, Alpine handles initialization timing
window.app = new App();