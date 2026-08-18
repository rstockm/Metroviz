import { DataModel } from './data-model.js';
import { LayoutEngine } from './layout-engine.js';
import { MetroRenderer } from './metro-renderer.js';

import { sortPaletteRainbow, METRO_PALETTE_BASE } from './color-utils.js';
import { dialogActions } from './dialog.js';
import { urlStateActions } from './url-state.js';
import { fileManagerActions } from './file-manager.js';
import { markdownExportActions } from './markdown-export.js';
import { editorActions } from './editor-actions.js';

// Initialize i18next asynchronously
const urlParams = new URLSearchParams(window.location.search);
const langParam = urlParams.get('lang');

const i18nPromise = i18next
    .use(i18nextHttpBackend)
    .use(i18nextBrowserLanguageDetector)
    .init({
        lng: langParam || undefined,
        fallbackLng: 'de',
        backend: {
            loadPath: 'locales/{{lng}}/{{ns}}.json'
        }
    }).then(() => {
        document.documentElement.lang = i18next.resolvedLanguage;
        if (window.Alpine && window.Alpine.store('i18n')) {
            window.Alpine.store('i18n').locale = i18next.resolvedLanguage;
            window.Alpine.store('i18n').loaded = true;
        }
    });

document.addEventListener('alpine:init', () => {
    Alpine.store('i18n', {
        locale: i18next.resolvedLanguage || 'de',
        loaded: false,
        t(key, opts) {
            const trigger = this.locale;
            const trigger2 = this.loaded;
            return i18next.t(key, opts);
        },
        async changeLanguage(lang) {
            await i18next.changeLanguage(lang);
            this.locale = i18next.resolvedLanguage;
            document.documentElement.lang = this.locale;
            window.dispatchEvent(new Event('language-changed'));
        }
    });
});

/**
 * Main Application Controller handling state, UI interactions, and visualization updates.
 */
class App {
    constructor() {
        this.dataModel = new DataModel();
        this.layoutEngine = new LayoutEngine();
        this.renderer = new MetroRenderer('#metroviz-container');
        
        this.initAlpine();
        this.setupEventListeners();
    }

    /**
     * Initializes Alpine.js, defining global data and watching for state changes.
     */
    initAlpine() {
        document.addEventListener('alpine:init', () => {
            const objKeys = new WeakMap();
            let nextObjKey = 1;

            Alpine.data('metrovizApp', () => ({
                editorVisible: false,
                globalView: 'map',
                activeTab: 'visual',
                rawJson: '',
                jsonError: '',
                savedFiles: [],
                currentFileName: '',
                importModalOpen: false,
                importUrl: '',
                importDropActive: false,
                dialogOpen: false,
                dialogMode: 'alert',
                dialogTitle: '',
                dialogMessage: '',
                dialogInput: '',
                _dialogResolve: null,
                /** 30 Metro map colors, sorted by rainbow (HSV hue) */
                metroPalette: sortPaletteRainbow(METRO_PALETTE_BASE),

                data: {
                    meta: { title: '', organization: '' },
                    timeline: { start: '', end: '', axis: 'quarters' },
                    events: [],
                    zones: [],
                    lines: []
                },

                // Spread modules
                ...dialogActions,
                ...urlStateActions,
                ...fileManagerActions,
                ...markdownExportActions,
                ...editorActions,

                /**
                 * Returns a stable render key for mutable editor objects.
                 * This keeps Alpine from recreating DOM nodes when editable IDs change.
                 */
                getObjKey(obj) {
                    if (!obj || typeof obj !== 'object') return String(obj);
                    if (!objKeys.has(obj)) objKeys.set(obj, `obj-${nextObjKey++}`);
                    return objKeys.get(obj);
                },

                async init() {
                    await i18nPromise;

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
                    // Intent: Persist UI state to URL so users can share links with exact visual states.
                    this.$watch('editorVisible', () => this.updateUrlParams());
                    this.$watch('globalView', () => this.updateUrlParams());
                    this.$watch('currentFileName', () => this.updateUrlParams());
                    
                    // Watch for any changes in the parsed data object (from visual editor)
                    // Intent: Ensure the raw JSON string and map visualization stay synchronized 
                    // whenever the visual editor modifies the underlying data object.
                    this.$watch('data', (value) => {
                        if (this.activeTab === 'visual') {
                            this.rawJson = JSON.stringify(value, null, 2);
                            this.renderMap(value);
                        }
                        this.updateUrlParams();
                    }, { deep: true });

                    // Watch for tab changes to trigger re-renders or formatting
                    // Intent: Keep JSON view strictly synchronized with memory data when switching tabs.
                    this.$watch('activeTab', (tab) => {
                        if (tab === 'json') {
                            this.rawJson = JSON.stringify(this.data, null, 2);
                        }
                    });

                    this.$watch('dialogOpen', (open) => {
                        if (!open) return;
                        this.$nextTick(() => {
                            if (this.dialogMode === 'prompt') {
                                const input = document.getElementById('dialog-prompt-input');
                                if (input) input.focus();
                            } else {
                                const btn = document.getElementById('dialog-ok-btn');
                                if (btn) btn.focus();
                            }
                        });
                    });

                    window.addEventListener('language-changed', () => {
                        this.updateUrlParams();
                        if (this.data && this.data.timeline) {
                            this.renderMap(this.data);
                        }
                    });
                },

                /**
                 * Parses the raw JSON string into the Alpine data state and triggers a re-render.
                 * Includes handling for legacy URL zone state encoding.
                 */
                updateFromJson() {
                    try {
                        if (!this.rawJson.trim()) return;
                        const parsed = JSON.parse(this.rawJson);
                        
                        // Security/Validation check: Ensure parsed data is actually a JSON object
                        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                            throw new Error(i18next.t('js.jsonRootMustBeObject'));
                        }
                        
                        if (!parsed.events) parsed.events = [];
                        
                        if (typeof this._urlZState === 'number' && parsed.zones) {
                            parsed.zones.forEach((zone, index) => {
                                if (index < 31) {
                                    zone.collapsed = (this._urlZState & (1 << index)) !== 0;
                                }
                            });
                            this._urlZState = null;
                        }

                        this.data = parsed; // This triggers the $watch above
                        this.jsonError = '';
                        this.renderMap(this.data);
                    } catch (error) {
                        this.jsonError = 'JSON Error: ' + error.message;
                    }
                },

                /**
                 * Re-calculates layout properties and renders the D3 SVG.
                 * @param {Object} jsonData - The internal state tree representing the roadmap.
                 */
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
                }
            }));
        });
    }

    /**
     * Sets up global event listeners, like drag-and-drop for JSON file uploads.
     */
    setupEventListeners() {
        // Drag and drop support
        const container = document.getElementById('metroviz-container');
        if (!container) return;

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
                const file = e.dataTransfer.files[0];
                
                // Security check: Limit file size to prevent DoS via large files
                if (file.size > 5 * 1024 * 1024) { // 5 MB
                    alert(i18next.t('js.importFileTooLarge'));
                    return;
                }
                
                const reader = new FileReader();
                reader.onerror = (err) => console.error('FileReader error:', err);
                reader.onload = (event) => {
                    // Need to update Alpine state instead of just DOM
                    const editor = document.getElementById('json-editor');
                    if (editor) {
                        editor.value = event.target.result;
                        // Dispatch input event so Alpine catches it
                        editor.dispatchEvent(new Event('input'));
                    }
                };
                reader.readAsText(file);
            }
        });
    }
}

// Start app when DOM is ready
// No need to wait for DOMContentLoaded here, Alpine handles initialization timing
window.app = new App();
