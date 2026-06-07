import { escapeHtml, sanitizeHtml, parseDate, downloadBlob, sanitizeFilename } from './utils.js';

/**
 * Provides actions to generate and export roadmap data as Markdown.
 */
export const markdownExportActions = {
    /**
     * Triggers the download of the current roadmap data as a .md file.
     */
    exportMD() {
        const mdStr = this.generateMarkdown();
        if (!mdStr) return;
        const filename = sanitizeFilename(this.currentFileName) + '.md';
        downloadBlob(mdStr, 'text/markdown;charset=utf-8;', filename);
    },

    /**
     * Traverses the internal state (zones, lines, stations) and compiles it into a structured Markdown string.
     * 
     * @returns {string} The generated Markdown content.
     */
    generateMarkdown() {
        if (!this.data) return '';
        
        let md = `# ${this.data.meta?.title || this.$store.i18n.t('md.roadmap')}\n`;
        if (this.data.meta?.organization) {
            md += `**${this.$store.i18n.t('md.organization')}:** ${this.data.meta.organization}  \n`;
        }
        if (this.data.meta?.author) {
            md += `**${this.$store.i18n.t('md.author')}:** ${this.data.meta.author}  \n`;
        }
        if (this.data.timeline?.start || this.data.timeline?.end) {
            md += `**${this.$store.i18n.t('md.timeline')}:** ${this.data.timeline.start || '?'} - ${this.data.timeline.end || '?'}  \n`;
        }
        md += '\n';

        if (this.data.events && this.data.events.length > 0) {
            md += `## ${this.$store.i18n.t('md.events')}\n`;
            this.data.events.forEach(event => {
                md += `* **${event.date}:** ${event.label}\n`;
            });
            md += '\n';
        }

        // Create a lookup for station labels to resolve transfers and relationships efficiently
        const stationLookup = new Map();
        const lineLookup = new Map();
        (this.data.lines || []).forEach(line => {
            lineLookup.set(line.id, line.label);
            (line.stations || []).forEach(station => {
                stationLookup.set(station.id, { label: station.label, lineId: line.id });
            });
        });

        (this.data.zones || []).forEach(zone => {
            md += `## ${this.$store.i18n.t('md.zone')}: ${zone.label}\n\n`;
            
            const zoneLines = (this.data.lines || []).filter(l => l.zone === zone.id);
            if (zoneLines.length === 0) {
                md += `*${this.$store.i18n.t('md.noLines')}*\n\n`;
            }
            
            zoneLines.forEach(line => {
                md += `### ${this.$store.i18n.t('editor.addLine').replace('+ ', '')}: ${line.label || this.$store.i18n.t('editor.newLine')}\n`;
                
                if (!line.stations || line.stations.length === 0) {
                    md += `*${this.$store.i18n.t('md.noStations')}*\n\n`;
                    return;
                }

                line.stations.forEach((station, index) => {
                    let typeLabel = {
                        'start': this.$store.i18n.t('editor.typeStart'),
                        'milestone': this.$store.i18n.t('editor.typeMilestone'),
                        'transfer': this.$store.i18n.t('editor.typeTransfer'),
                        'terminus': this.$store.i18n.t('editor.typeTerminus'),
                        'existing': this.$store.i18n.t('editor.typeExisting')
                    }[station.type] || station.type;

                    if (station.isStop) {
                        typeLabel += ', ' + this.$store.i18n.t('editor.isStop');
                    }

                    let durationText = '';
                    // Calculate and format the duration to the next station to provide a timeline overview
                    if (index < line.stations.length - 1) {
                        const nextStation = line.stations[index + 1];
                        const currentDateObj = parseDate(station.date, 'null');
                        const nextDateObj = parseDate(nextStation.date, 'null');
                        
                        if (currentDateObj && nextDateObj) {
                            const diffTime = nextDateObj - currentDateObj;
                            const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
                            durationText = ` (${this.$store.i18n.t('js.durationTo', { target: escapeHtml(nextStation.label), weeks: diffWeeks })})`;
                        }
                    }

                    md += `* **${station.date || '?'}:** ${station.label} (${typeLabel})${durationText}\n`;
                    
                    if (station.description && station.description.trim() !== '') {
                        // Indent description correctly to align with the markdown list item structure
                        const indentedDesc = station.description.split('\n').map(line => `  > ${line}`).join('\n');
                        md += `${indentedDesc}\n`;
                    }
                    
                    if (station.transferTo) {
                        const target = stationLookup.get(station.transferTo);
                        if (target) {
                            const targetLine = lineLookup.get(target.lineId);
                            md += `  * ↳ *Transfer: ${target.label} (${targetLine})*\n`;
                        }
                    }

                    if (Array.isArray(station.relations)) {
                        station.relations.forEach((rel) => {
                            if (!rel || !rel.target) return;
                            // Prevent bidirectional relations from being printed twice by only logging the source -> target direction
                            if (rel.kind === 'synchronizedWith' && station.id >= rel.target) return;
                            const tgt = stationLookup.get(rel.target);
                            if (!tgt) return;
                            const tgtLine = lineLookup.get(tgt.lineId);
                            const note = rel.label ? ` (${rel.label})` : '';
                            if (rel.kind === 'synchronizedWith') {
                                md += `  * ↳ *${this.$store.i18n.t('editor.relSynchronized')}: ${tgt.label} (${tgtLine})*${note}\n`;
                            } else {
                                md += `  * ↳ *${this.$store.i18n.t('editor.relDependsOn')}: ${tgt.label} (${tgtLine})*${note}\n`;
                            }
                        });
                    }
                });
                md += '\n';
            });
        });
        
        return md;
    },

    /**
     * Parses the generated Markdown into sanitized HTML for preview rendering.
     * 
     * @returns {string} The HTML representation of the markdown.
     */
    renderMarkdown() {
        const md = this.generateMarkdown();
        if (typeof marked !== 'undefined') {
            return sanitizeHtml(marked.parse(md));
        }
        // Fallback to raw text output if the marked library is not loaded
        return '<pre>' + escapeHtml(md) + '</pre>';
    }
};
