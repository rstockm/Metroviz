/**
 * Responsible for calculating the X and Y coordinates of zones, lines, and stations 
 * based on their temporal (date) and spatial (zone/transfer) relationships.
 */
export class LayoutEngine {
    constructor() {
        this.config = {
            width: 1200,
            height: 800,
            margins: { top: 110, right: 40, bottom: 40, left: 200 }, // Left margin for zone labels
            zonePadding: 20,
            lineSpacing: 50
        };
    }

    /**
     * Calculates the full layout required for the Metro renderer.
     * @param {Object} data - The normalized timeline, events, zones, and lines.
     * @returns {Object} Layout configuration containing computed scales, zones, lines, and station coordinates.
     */
    calculate(data) {
        const { width, margins } = this.config;
        
        // 1. Calculate Time scale (X axis)
        const xScale = d3.scaleTime()
            .domain([data.timeline.start, data.timeline.end])
            .range([margins.left, width - margins.right]);

        // 2. Assign lines to zones
        const zoneLines = new Map();
        data.zones.forEach(z => zoneLines.set(z.id, []));
        
        data.lines.forEach(line => {
            if (zoneLines.has(line.zone)) {
                zoneLines.get(line.zone).push(line);
            }
        });

        // 3. Calculate Zones (Y axis) dynamically based on number of lines
        let currentY = margins.top;
        const paddingTop = 70; // More space at the top so label has room
        const paddingBottom = 40; // Space at the bottom
        
        const zones = data.zones.map((zone, i) => {
            const zLines = zoneLines.get(zone.id) || [];
            const numLines = Math.max(1, zLines.length); // At least 1 for empty zones
            
            const isCollapsed = zone.collapsed === true;
            
            const linesHeight = (numLines - 1) * this.config.lineSpacing;
            const zoneHeight = isCollapsed ? 50 : paddingTop + linesHeight + paddingBottom;
            const y = currentY;
            
            currentY += zoneHeight;

            return {
                ...zone,
                y: y,
                height: zoneHeight,
                centerY: isCollapsed ? y + 25 : y + paddingTop + (linesHeight / 2),
                collapsed: isCollapsed
            };
        });

        // Dynamically set the total height required
        const calculatedHeight = currentY + margins.bottom;
        const dynamicConfig = { ...this.config, height: calculatedHeight };

        // Map for quick zone lookup
        const zoneMap = new Map(zones.map(z => [z.id, z]));

        // 4. Calculate coordinates for events
        const events = (data.events || []).map(event => ({
            ...event,
            x: xScale(event.dateObj)
        }));

        // Build map of all stations to resolve transfer connections globally
        const allStationsMap = new Map();
        const transferFromMap = new Map();
        data.lines.forEach(l => {
            (l.stations || []).forEach(s => {
                allStationsMap.set(s.id, s);
                if (s.transferTo) {
                    transferFromMap.set(s.transferTo, s.id);
                }
            });
        });

        // 5. Calculate coordinates for lines and stations
        const lines = data.lines.map(line => {
            const zLines = zoneLines.get(line.zone);
            const lineIndex = zLines ? zLines.indexOf(line) : 0;
            const z = zoneMap.get(line.zone) || { collapsed: false, centerY: currentY };
            
            // Calculate base Y position relative to zone center
            const totalLines = zLines ? zLines.length : 1;
            const isLastInZone = lineIndex === totalLines - 1;
            const baseYOffset = z.collapsed ? 0 : (lineIndex - (totalLines - 1) / 2) * dynamicConfig.lineSpacing;
            const baseY = z.centerY + baseYOffset;

            // Sort stations by date
            const sortedStations = [...line.stations].sort((a, b) => a.dateObj - b.dateObj);

            // Calculate station positions with alternating vertical offset
            // Intent: Alternate vertical placement for intermediate stations on long lines 
            // to avoid label overlapping, unless overridden by transfer connections.
            const isLongLine = sortedStations.length > 2;
            let prevStationY = baseY;

            const stations = sortedStations.map((station, i) => {
                let stationY = baseY;
                
                // Determine direction for lane change based on transfer if applicable
                let transferDirection = 0; // 0 means no forced direction
                
                let transferTargetId = station.transferTo;
                let transferSourceId = transferFromMap.get(station.id);
                if (!transferSourceId && station.transferFrom) {
                    transferSourceId = station.transferFrom; // fallback for old data
                }

                if (transferTargetId) {
                    const targetStation = allStationsMap.get(transferTargetId);
                    if (targetStation) {
                         const targetLine = data.lines.find(l => (l.stations || []).some(s => s.id === targetStation.id));
                         if (targetLine) {
                             const targetZLines = zoneLines.get(targetLine.zone);
                             const targetZ = zoneMap.get(targetLine.zone);
                             if (targetZLines && targetZ) {
                                 const tLineIndex = targetZLines.indexOf(targetLine);
                                 const tBaseYOffset = targetZ.collapsed ? 0 : (tLineIndex - (targetZLines.length - 1) / 2) * dynamicConfig.lineSpacing;
                                 const targetApproxY = targetZ.centerY + tBaseYOffset;
                                 
                                 // If target is below us, we bend down (positive Y). If target is above us, we bend up (negative Y)
                                 transferDirection = targetApproxY > baseY ? 1 : -1;
                             }
                         }
                    }
                } else if (transferSourceId) {
                    const sourceStation = allStationsMap.get(transferSourceId);
                    if (sourceStation) {
                         const sourceLine = data.lines.find(l => (l.stations || []).some(s => s.id === sourceStation.id));
                         if (sourceLine) {
                             const sourceZLines = zoneLines.get(sourceLine.zone);
                             const sourceZ = zoneMap.get(sourceLine.zone);
                             if (sourceZLines && sourceZ) {
                                 const sLineIndex = sourceZLines.indexOf(sourceLine);
                                 const sBaseYOffset = sourceZ.collapsed ? 0 : (sLineIndex - (sourceZLines.length - 1) / 2) * dynamicConfig.lineSpacing;
                                 const sourceApproxY = sourceZ.centerY + sBaseYOffset;
                                 
                                 // If source was below us, we bend down towards it. If source was above, we bend up.
                                 transferDirection = sourceApproxY > baseY ? 1 : -1;
                             }
                         }
                    }
                }

                // If line has more than 2 stations, alternate the Y position for intermediate stations
                if (isLongLine && i > 0 && i < sortedStations.length - 1) {
                    // Alternate between base line (0) and a slight offset (-1, meaning up)
                    // instead of swinging wildly from +1 to -1
                    let direction = i % 2 === 0 ? 0 : -1;
                    
                    // Override alternating direction if this station is part of a transfer
                    if (transferDirection !== 0) {
                        direction = transferDirection;
                    }

                    stationY = baseY + (direction * dynamicConfig.lineSpacing * 0.35);
                } else if (transferDirection !== 0) {
                    // Even for first/last stations, bend them towards the transfer to make it look connected
                    stationY = baseY + (transferDirection * dynamicConfig.lineSpacing * 0.35);
                }

                // Avoid the final bend: the last station always inherits the Y-position of the penultimate station
                if (i === sortedStations.length - 1 && i > 0) {
                    stationY = prevStationY;
                }

                prevStationY = stationY;

                return {
                    ...station,
                    x: xScale(station.dateObj),
                    y: stationY,
                    baseY: baseY
                };
            });

            return {
                ...line,
                y: baseY,
                isLastInZone: isLastInZone,
                lineIndex: lineIndex,
                hidden: z.collapsed,
                stations: stations
            };
        });

        return {
            config: dynamicConfig,
            meta: data.meta,
            timeline: { axis: data.timeline.axis === 'weeks' ? 'weeks' : 'quarters' },
            xScale: xScale,
            zones: zones,
            lines: lines,
            events: events
        };
    }
}