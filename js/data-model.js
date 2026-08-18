import { parseDate } from './utils.js';

/**
 * Handles fetching, validation, and normalization of Metro map data.
 */
export class DataModel {
    constructor() {}

    async loadFromUrl(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return this.validateAndNormalize(data);
    }

    /**
     * Validates raw JSON data and normalizes dates into sortable Date objects.
     * @param {Object} data - The raw JSON configuration for the metro map.
     * @returns {Object} A normalized data object with parsed dates and sorted arrays.
     */
    validateAndNormalize(data) {
        // Minimal validation
        // Intent: Fail early if core structure is missing to prevent complex errors downstream.
        if (!data.timeline || !data.zones || !data.lines) {
            throw new Error('Invalid data format: missing required fields');
        }

        if (!Array.isArray(data.zones)) throw new Error('Invalid data format: zones must be an array');
        if (!Array.isArray(data.lines)) throw new Error('Invalid data format: lines must be an array');
        if (data.events && !Array.isArray(data.events)) throw new Error('Invalid data format: events must be an array');

        const validStationTypes = ['start', 'milestone', 'transfer', 'terminus', 'existing', 'normal', 'interchange', 'terminal'];

        const normalizedData = {
            meta: data.meta || {},
            timeline: {
                start: parseDate(data.timeline.start, 'throw'),
                end: parseDate(data.timeline.end, 'throw'),
                axis: data.timeline.axis === 'weeks' ? 'weeks' : 'quarters'
            },
            events: (data.events || []).map(e => ({
                ...e,
                dateObj: parseDate(e.date, 'throw')
            })).sort((a, b) => a.dateObj - b.dateObj),
            zones: data.zones.map(z => ({ ...z })),
            lines: data.lines.map(line => {
                const normalizedLine = { ...line };
                normalizedLine.stations = (line.stations || []).map(station => {
                    if (station.type && !validStationTypes.includes(station.type)) {
                        throw new Error(`Invalid station type: ${station.type}`);
                    }
                    return {
                        ...station,
                        dateObj: parseDate(station.date, 'throw'),
                        lineId: line.id
                    };
                }).sort((a, b) => a.dateObj - b.dateObj);
                return normalizedLine;
            })
        };

        return normalizedData;
    }
}