/**
 * Orthogonal path (only horizontal/vertical segments) between two stations.
 * 
 * @param {number} sx - Source X coordinate
 * @param {number} sy - Source Y coordinate
 * @param {number} tx - Target X coordinate
 * @param {number} ty - Target Y coordinate
 * @returns {string} SVG path string
 */
function buildOrthogonalRelationPath(sx, sy, tx, ty) {
    const off = 14;
    const dx = tx - sx;
    const dy = ty - sy;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return '';

    if (Math.abs(dx) >= Math.abs(dy)) {
        const sgn = dx === 0 ? Math.sign(dy || 1) : Math.sign(dx);
        const x0 = sx + sgn * off;
        const y0 = sy;
        const x1 = tx - sgn * off;
        const y1 = ty;
        if (Math.abs(y1 - y0) < 1) {
            return `M${x0},${y0}L${x1},${y1}`;
        }
        const xMid = (x0 + x1) / 2;
        return `M${x0},${y0}L${xMid},${y0}L${xMid},${y1}L${x1},${y1}`;
    }
    const sgn = dy === 0 ? Math.sign(dx || 1) : Math.sign(dy);
    const x0 = sx;
    const y0 = sy + sgn * off;
    const x1 = tx;
    const y1 = ty - sgn * off;
    if (Math.abs(x1 - x0) < 1) {
        return `M${x0},${y0}L${x1},${y1}`;
    }
    const yMid = (y0 + y1) / 2;
    return `M${x0},${y0}L${x0},${yMid}L${x1},${yMid}L${x1},${y1}`;
}

import { escapeHtml, sanitizeHtml } from './utils.js';

export function getTintedColor(lineColor, zoneBg) {
    return d3.interpolate(lineColor, zoneBg || '#ffffff')(0.7);
}

/**
 * Renders the metro map visualization using D3.js.
 * Manages the SVG structure, scales, layers, and visual components.
 */
export class MetroRenderer {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        this.tooltip = d3.select('#tooltip');
        this._selectedRelationKey = null;
    }

    /**
     * Generates a routing path for a metro line.
     * Introduces sloped segments to transition between stations on different Y coordinates.
     * 
     * @param {Array} stations - Array of station objects in the line
     * @returns {Array} Array of path points with x, y, and lineId
     */
    generateMetroPath(stations) {
        let path = [];
        for (let i = 0; i < stations.length; i++) {
            const curr = stations[i];
            const point = { x: curr.x, y: curr.y, lineId: curr.lineId };
            
            if (i === 0) {
                path.push(point);
                continue;
            }
            const prev = stations[i - 1];
            
            if (curr.y === prev.y) {
                path.push(point);
            } else {
                // Calculate diagonal transitions between different Y-levels.
                // A straight segment is required before entering a station for aesthetic flow.
                const dx = curr.x - prev.x;
                const dy = curr.y - prev.y;
                const absDy = Math.abs(dy);
                
                const slopeWidth = absDy; 
                
                const straightBeforeStation = 15; 
                const requiredSpace = slopeWidth + straightBeforeStation;
                
                if (Math.abs(dx) > requiredSpace) {
                    const direction = Math.sign(dx);
                    const slopeStartX = curr.x - (requiredSpace * direction);
                    path.push({x: slopeStartX, y: prev.y, lineId: curr.lineId});
                    
                    const slopeEndX = curr.x - (straightBeforeStation * direction);
                    path.push({x: slopeEndX, y: curr.y, lineId: curr.lineId});
                    
                    path.push(point);
                } else if (Math.abs(dx) > slopeWidth) {
                    const slopeStartX = curr.x - (slopeWidth * Math.sign(dx));
                    path.push({x: slopeStartX, y: prev.y, lineId: curr.lineId});
                    path.push(point);
                } else {
                    path.push(point);
                }
            }
        }
        return path;
    }

    /**
     * Main rendering method.
     * Constructs the SVG structure, evaluates element bounding boxes for collision detection,
     * and delegates rendering to specific layer methods.
     * 
     * @param {Object} layout - Layout data containing config, scales, zones, lines, and events
     */
    render(layout) {
        const { config, xScale, zones, lines } = layout;

        this.container.innerHTML = '';

        const svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${config.width} ${config.height}`)
            .attr('preserveAspectRatio', 'xMinYMin meet')
            .attr('xmlns', 'http://www.w3.org/2000/svg')
            .style('background-color', '#ffffff');

        svg.append('rect')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('fill', '#ffffff');

        const zoomGroup = svg.append('g').attr('class', 'zoom-group');

        svg.append('defs')
            .append('marker')
            .attr('id', 'metro-relation-arrow')
            .attr('viewBox', '0 -4 8 8')
            .attr('refX', 8)
            .attr('refY', 0)
            .attr('markerWidth', 5)
            .attr('markerHeight', 5)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-3L8,0L0,3')
            .attr('fill', '#5a6a7a');

        const getPaleColor = (hexColor) => {
            const color = d3.color(hexColor || '#eeeeee');
            if (!color) return '#ffffff';
            const r = Math.round(color.r * 0.1 + 255 * 0.9);
            const g = Math.round(color.g * 0.1 + 255 * 0.9);
            const b = Math.round(color.b * 0.1 + 255 * 0.9);
            return d3.rgb(r, g, b).formatHex();
        };

        const zoneColors = new Map();
        zones.forEach(z => zoneColors.set(z.id, getPaleColor(z.color)));

        if (layout.meta) {
            const metaGroup = zoomGroup.append('g').attr('class', 'meta-info');
            if (layout.meta.title) {
                metaGroup.append('text')
                    .attr('x', 0)
                    .attr('y', 40)
                    .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                    .attr('font-size', '24px')
                    .attr('font-weight', 'bold')
                    .attr('fill', '#333')
                    .text(layout.meta.title);
            }
            if (layout.meta.organization) {
                metaGroup.append('text')
                    .attr('x', 0)
                    .attr('y', 65)
                    .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                    .attr('font-size', '14px')
                    .attr('fill', '#666')
                    .text(layout.meta.organization);
            }
            if (layout.meta.author) {
                metaGroup.append('text')
                    .attr('x', 0)
                    .attr('y', 85)
                    .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                    .attr('font-size', '12px')
                    .attr('fill', '#888')
                    .text('Ersteller: ' + layout.meta.author);
            }
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const standText = `Stand: ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
            metaGroup.append('text')
                .attr('x', 0)
                .attr('y', 105)
                .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                .attr('font-size', '12px')
                .attr('fill', '#888')
                .text(standText);
        }

        // SVG layers are ordered explicitly to control Z-index (Painter's Algorithm).
        // Background elements are drawn first, followed by structural elements (lines),
        // and finally foreground elements (stations, labels) to prevent occlusion.
        const layers = {
            zones: zoomGroup.append('g').attr('class', 'zones'),
            gridQuarters: zoomGroup.append('g').attr('class', 'axis axis-grid-quarters'),
            gridYears: zoomGroup.append('g').attr('class', 'axis axis-grid-years'),
            today: zoomGroup.append('g').attr('class', 'today-line'),
            events: zoomGroup.append('g').attr('class', 'events-lines'),
            lineIndicators: zoomGroup.append('g').attr('class', 'line-indicators'),
            relations: zoomGroup.append('g').attr('class', 'metro-relations'),
            lines: zoomGroup.append('g').attr('class', 'lines'),
            terminus: zoomGroup.append('g').attr('class', 'terminus-indicators'),
            transferBg: zoomGroup.append('g').attr('class', 'transfer-bg'),
            transferFg: zoomGroup.append('g').attr('class', 'transfer-fg'),
            normalStations: zoomGroup.append('g').attr('class', 'normal-stations'),
            labels: zoomGroup.append('g').attr('class', 'labels'),
            globalLabels: zoomGroup.append('g').attr('class', 'global-labels')
        };

        const visibleLines = lines.filter(l => !l.hidden);

        const transferLinks = [];
        const allStations = new Map();
        lines.forEach(l => l.stations.forEach(s => allStations.set(s.id, { ...s, color: l.color, hidden: l.hidden })));

        allStations.forEach(s => {
            if (s.transferTo && allStations.has(s.transferTo)) {
                const target = allStations.get(s.transferTo);
                if (!s.hidden || !target.hidden) {
                    transferLinks.push({ source: s, target: target });
                }
            }
        });

        const relationEdges = [];
        const syncSeen = new Set();
        allStations.forEach(s => {
            if (!s.relations) return;
            s.relations.forEach(rel => {
                if (!rel || !rel.target || !allStations.has(rel.target)) return;
                const target = allStations.get(rel.target);
                if (s.hidden || target.hidden) return;
                const kind = rel.kind === 'synchronizedWith' ? 'synchronizedWith' : 'dependsOn';
                if (kind === 'synchronizedWith') {
                    const a = s.id < rel.target ? s.id : rel.target;
                    const b = s.id < rel.target ? rel.target : s.id;
                    const sk = `sync:${a}:${b}`;
                    if (syncSeen.has(sk)) return;
                    syncSeen.add(sk);
                    relationEdges.push({ source: s, target, kind, label: rel.label || '', key: sk });
                } else {
                    relationEdges.push({ source: s, target, kind, label: rel.label || '', key: `dep:${s.id}->${rel.target}` });
                }
            });
        });

        // Maintain a spatial registry of occupied bounding boxes to detect and resolve overlaps,
        // primarily used for station label placement.
        const occupiedBoxes = [];
        const addBox = (xMin, xMax, yMin, yMax) => {
            occupiedBoxes.push({xMin, xMax, yMin, yMax});
        };
        const checkCollision = (box) => {
            const pad = 2;
            for (let b of occupiedBoxes) {
                if (box.xMin - pad < b.xMax && box.xMax + pad > b.xMin && 
                    box.yMin - pad < b.yMax && box.yMax + pad > b.yMin) {
                    return true;
                }
            }
            return false;
        };

        const routedPaths = new Map();
        visibleLines.forEach(line => {
            const routedPath = this.generateMetroPath(line.stations);
            routedPaths.set(line.id, routedPath);
            for (let i = 0; i < routedPath.length - 1; i++) {
                const p1 = routedPath[i];
                const p2 = routedPath[i+1];
                addBox(
                    Math.min(p1.x, p2.x) - 4,
                    Math.max(p1.x, p2.x) + 4,
                    Math.min(p1.y, p2.y) - 4,
                    Math.max(p1.y, p2.y) + 4
                );
            }
        });

        transferLinks.forEach(link => {
            addBox(
                Math.min(link.source.x, link.target.x) - 10,
                Math.max(link.source.x, link.target.x) + 10,
                Math.min(link.source.y, link.target.y) - 10,
                Math.max(link.source.y, link.target.y) + 10
            );
        });

        visibleLines.forEach(line => {
            line.stations.forEach(station => {
                const isTransfer = station.type === 'transfer' || station.transferTo || station.transferFrom;
                const r = isTransfer ? 10 : 7;
                addBox(station.x - r, station.x + r, station.y - r, station.y + r);
            });
        });

        this.renderZones(layers.zones, zones, config);
        this.renderGrid(layers.gridQuarters, layers.gridYears, xScale, config);
        this.renderToday(layers.today, layout, config, xScale);
        this.renderEvents(layers.events, layout.events, config);
        this.renderLines(layers.lineIndicators, layers.lines, layers.terminus, visibleLines, zoneColors, routedPaths);
        this.renderTransfers(layers.transferBg, layers.transferFg, transferLinks);
        this.renderRelations(layers.relations, zoomGroup, relationEdges);
        this.renderStations(layers.transferBg, layers.transferFg, layers.normalStations, layers.labels, visibleLines, zoneColors, allStations, addBox, checkCollision);
        this.renderLabels(layers.globalLabels, layout, visibleLines, zones, zoneColors, config);
        this.setupZoom(svg, zoomGroup);

        svg.on('click', (event) => {
            if (event.target.tagName === 'svg' || event.target.tagName === 'rect') {
                this.clearHighlight();
            }
        });

        this.svgElement = svg.node();
    }

    renderZones(group, zones, config) {
        zones.forEach(zone => {
            group.append('rect')
                .attr('x', 0)
                .attr('y', zone.y)
                .attr('width', Math.max(config.width * 2, 3000))
                .attr('height', zone.height)
                .attr('fill', zone.color || '#eee')
                .attr('class', 'zone-band')
                .attr('opacity', '0.1');
        });
    }

    renderGrid(quartersGroup, yearsGroup, xScale, config) {
        const xAxisQuarters = d3.axisTop(xScale)
            .ticks(d3.timeMonth.every(3))
            .tickFormat(d => {
                if (d.getMonth() === 0) return "";
                const quarter = Math.floor(d.getMonth() / 3) + 1;
                return `Q${quarter}`;
            });

        quartersGroup
            .attr('transform', `translate(0, ${config.margins.top})`)
            .call(xAxisQuarters.tickSize(-config.height + config.margins.top + config.margins.bottom))
            .selectAll("line")
            .attr("stroke", "#e0e0e0")
            .attr("stroke-width", 1);
            
        quartersGroup.selectAll("path").attr("stroke", "none");
        quartersGroup.selectAll("text")
    .attr("fill", "#999")
    .attr("font-family", 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
    .attr("font-size", "7px")
    .attr("dy", "-18px");

        const xAxisYears = d3.axisTop(xScale)
            .ticks(d3.timeYear.every(1))
            .tickFormat(d3.timeFormat("%Y"));

        yearsGroup
            .attr('transform', `translate(0, ${config.margins.top})`)
            .call(xAxisYears.tickSize(-config.height + config.margins.top + config.margins.bottom))
            .selectAll("line")
            .attr("stroke", "#cccccc")
            .attr("stroke-width", 1.5);

        yearsGroup.selectAll("path").attr("stroke", "none");
        yearsGroup.selectAll("text")
    .attr("fill", "#555")
    .attr("font-family", 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
    .attr("font-size", "15px")
    .attr("font-weight", "bold")
    .attr("dy", "-18px");
    }

    renderToday(group, layout, config, xScale) {
        const today = new Date();
        const domain = xScale.domain();
        if (today >= domain[0] && today <= domain[1]) {
            const x = xScale(today);
            const bottomY = config.height - config.margins.bottom;
            
            group.append('line')
                .attr('x1', x)
                .attr('y1', config.margins.top)
                .attr('x2', x)
                .attr('y2', bottomY)
                .attr('stroke', '#4caf50')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5')
                .attr('opacity', '0.8');

            const labelText = typeof i18next !== 'undefined' ? i18next.t('js.today') : 'Heute';

            group.append('text')
                .attr('x', x)
                .attr('y', config.margins.top - 3)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .attr('fill', '#4caf50')
                .text(labelText);
        }
    }

    renderEvents(group, events, config) {
        const bottomY = config.height - config.margins.bottom;
        (events || []).forEach(event => {
            group.append('line')
                .attr('x1', event.x)
                .attr('y1', config.margins.top)
                .attr('x2', event.x)
                .attr('y2', bottomY)
                .attr('stroke', '#d32f2f')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5')
                .attr('opacity', '0.7');
        });
    }

    renderLines(indicatorsGroup, linesGroup, terminusGroup, visibleLines, zoneColors, routedPaths) {
        const lineGenerator = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveLinear);

        visibleLines.forEach(line => {
            indicatorsGroup.append('line')
                .attr('x1', 20)
                .attr('y1', line.y)
                .attr('x2', 40)
                .attr('y2', line.y)
                .attr('stroke', line.color)
                .attr('stroke-width', 6)
                .attr('stroke-linecap', 'round');

            const routedPath = routedPaths.get(line.id);
            const segments = [];
            let currentSegment = [];
            let currentStationIndex = 0;
            
            for (let i = 0; i < routedPath.length; i++) {
                const pt = routedPath[i];
                currentSegment.push(pt);
                
                const nextStation = line.stations[currentStationIndex];
                if (nextStation && pt.x === nextStation.x && pt.y === nextStation.y) {
                    if (currentSegment.length > 1) {
                        segments.push({
                            path: currentSegment,
                            tint: currentStationIndex > 0 ? line.stations[currentStationIndex-1].tint : false
                        });
                    }
                    currentSegment = [pt];
                    currentStationIndex++;
                }
            }
            if (currentSegment.length > 1) {
                 segments.push({
                     path: currentSegment,
                     tint: currentStationIndex > 0 && currentStationIndex <= line.stations.length ? line.stations[currentStationIndex-1].tint : false
                 });
            }

            segments.forEach((seg) => {
                let strokeColor = line.color;
                if (seg.tint) {
                    strokeColor = getTintedColor(line.color, zoneColors.get(line.zone));
                }

                linesGroup.append('path')
                    .datum(seg.path)
                    .attr('d', lineGenerator)
                    .attr('class', 'metro-line line-' + line.id)
                    .attr('data-line-id', line.id)
                    .attr('stroke', strokeColor)
                    .attr('stroke-width', 8)
                    .attr('fill', 'none')
                    .attr('stroke-linecap', 'round')
                    .attr('stroke-linejoin', 'round')
                    .style('cursor', 'pointer')
                    .on('click', () => this.highlightLine(line.id));
            });

            line.stations.forEach(station => {
                if (station.type === 'terminus') {
                    terminusGroup.append('line')
                        .attr('x1', station.x)
                        .attr('y1', station.y - 12)
                        .attr('x2', station.x)
                        .attr('y2', station.y + 12)
                        .attr('stroke', line.color)
                        .attr('stroke-width', 4)
                        .attr('stroke-linecap', 'round')
                        .attr('class', 'terminus-line line-' + line.id);
                }
            });
        });
    }

    renderTransfers(bgGroup, fgGroup, transferLinks) {
        transferLinks.forEach(link => {
            bgGroup.append('line')
                .attr('x1', link.source.x)
                .attr('y1', link.source.y)
                .attr('x2', link.target.x)
                .attr('y2', link.target.y)
                .attr('stroke', '#000')
                .attr('stroke-width', 18)
                .attr('stroke-linecap', 'round');
            
            fgGroup.append('line')
                .attr('x1', link.source.x)
                .attr('y1', link.source.y)
                .attr('x2', link.target.x)
                .attr('y2', link.target.y)
                .attr('stroke', '#fff')
                .attr('stroke-width', 12)
                .attr('stroke-linecap', 'round');
        });
    }

    /**
     * Renders orthogonal paths for dependencies and synchronized relationships between stations.
     * 
     * @param {d3.Selection} relationsGroup - Group for rendering relation paths
     * @param {d3.Selection} zoomGroup - Main zoomable group
     * @param {Array} relationEdges - Edges representing relations
     */
    renderRelations(relationsGroup, zoomGroup, relationEdges) {
        const renderer = this;

        relationEdges.forEach((edge) => {
            const dPath = buildOrthogonalRelationPath(edge.source.x, edge.source.y, edge.target.x, edge.target.y);
            if (!dPath) return;

            const visPath = relationsGroup.append('path')
                .attr('d', dPath)
                .attr('class', 'metro-relation-path')
                .attr('data-relation-key', edge.key)
                .attr('fill', 'none')
                .attr('stroke', edge.kind === 'synchronizedWith' ? '#8e7a9e' : '#6b7a8f')
                .attr('stroke-width', edge.kind === 'synchronizedWith' ? 2.5 : 2.8)
                .attr('stroke-dasharray', edge.kind === 'synchronizedWith' ? '2 5' : '4 4')
                .attr('stroke-linecap', 'square')
                .attr('stroke-linejoin', 'miter');

            if (edge.kind === 'dependsOn') {
                visPath.attr('marker-end', 'url(#metro-relation-arrow)');
            }

            if (renderer._selectedRelationKey === edge.key) {
                visPath.classed('relation-path-selected', true);
            }

            const kindDe = edge.kind === 'synchronizedWith' ? i18next.t('editor.relSynchronized') : i18next.t('editor.relDependsOn');
            const safeNote = edge.label
                ? String(edge.label)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                : '';
            const noteHtml = safeNote ? `<br/><span class="tooltip-note">${safeNote}</span>` : '';

            relationsGroup.append('path')
                .attr('d', dPath)
                .attr('class', 'metro-relation-hit')
                .attr('data-relation-key', edge.key)
                .attr('fill', 'none')
                .attr('stroke', 'transparent')
                .attr('stroke-width', 16)
                .style('cursor', 'pointer')
                .on('mouseover', (event) => {
                    event.stopPropagation();
                    if (renderer._selectedRelationKey) return;
                    visPath.classed('metro-relation-hover', true);
                    renderer.tooltip.classed('hidden', false)
                        .html(i18next.t('js.relationTooltip', { kind: kindDe, source: escapeHtml(edge.source.label), target: escapeHtml(edge.target.label) }) + noteHtml)
                        .style('left', (event.pageX + 15) + 'px')
                        .style('top', (event.pageY - 15) + 'px');
                })
                .on('mousemove', (event) => {
                    if (!renderer._selectedRelationKey) {
                        renderer.tooltip.style('left', (event.pageX + 15) + 'px').style('top', (event.pageY - 15) + 'px');
                    }
                })
                .on('mouseout', () => {
                    if (!renderer._selectedRelationKey) {
                        visPath.classed('metro-relation-hover', false);
                        renderer.tooltip.classed('hidden', true);
                    }
                })
                .on('click', (event) => {
                    event.stopPropagation();
                    renderer._selectedRelationKey = edge.key;
                    d3.selectAll('.metro-relation-path').classed('relation-path-selected', false);
                    visPath.classed('relation-path-selected', true);
                    zoomGroup.selectAll('.relation-selection-ring').remove();
                    const ringG = zoomGroup.append('g').attr('class', 'relation-selection-ring');
                    [edge.source, edge.target].forEach((st) => {
                        ringG.append('circle')
                            .attr('cx', st.x)
                            .attr('cy', st.y)
                            .attr('r', 11)
                            .attr('fill', 'none')
                            .attr('stroke', '#ff9800')
                            .attr('stroke-width', 2)
                            .style('pointer-events', 'none');
                    });
                    renderer.tooltip.classed('hidden', false)
                        .html(i18next.t('js.relationTooltipSelected', { kind: kindDe, source: escapeHtml(edge.source.label), target: escapeHtml(edge.target.label) }) + noteHtml)
                        .style('left', (event.pageX + 15) + 'px')
                        .style('top', (event.pageY - 15) + 'px');
                });
        });
    }

    /**
     * Renders stations and their labels.
     * Applies collision detection to decide whether a label should be placed above or below the station
     * to avoid overlapping with lines, other stations, or transfer links.
     * 
     * @param {d3.Selection} transferBgGroup - Group for transfer backgrounds
     * @param {d3.Selection} transferFgGroup - Group for transfer foregrounds
     * @param {d3.Selection} normalStationsGroup - Group for standard stations
     * @param {d3.Selection} labelsGroup - Group for labels
     * @param {Array} visibleLines - Active lines to render
     * @param {Map} zoneColors - Map of zone background colors
     * @param {Map} allStations - Map of all station data
     * @param {Function} addBox - Registers a bounding box
     * @param {Function} checkCollision - Tests if a box overlaps existing elements
     */
    renderStations(transferBgGroup, transferFgGroup, normalStationsGroup, labelsGroup, visibleLines, zoneColors, allStations, addBox, checkCollision) {
        // Separate collision tracker just for labels (not lines/stations)
        const labelBoxes = [];
        const addLabelBox = (xMin, xMax, yMin, yMax) => {
            labelBoxes.push({xMin, xMax, yMin, yMax});
        };
        const checkLabelCollision = (box) => {
            const pad = 2;
            for (let b of labelBoxes) {
                if (box.xMin - pad < b.xMax && box.xMax + pad > b.xMin &&
                    box.yMin - pad < b.yMax && box.yMax + pad > b.yMin) {
                    return true;
                }
            }
            return false;
        };
        visibleLines.forEach(line => {
            line.stations.forEach((station, index) => {
                const isTransfer = station.type === 'transfer' || station.transferTo || station.transferFrom;
                
                let interactiveElement;
                let stationColor = line.color;
                
                const isTintedHere = station.tint;
                const wasTintedBefore = index > 0 ? line.stations[index - 1].tint : false;
                
                if (isTintedHere || (index > 0 && wasTintedBefore && index === line.stations.length - 1)) {
                    stationColor = getTintedColor(line.color, zoneColors.get(line.zone));
                }

                if (isTransfer) {
                    transferBgGroup.append('circle')
                        .attr('cx', station.x)
                        .attr('cy', station.y)
                        .attr('r', 9)
                        .attr('fill', '#000')
                        .attr('class', `line-${line.id}`);

                    interactiveElement = transferFgGroup.append('circle')
                        .attr('cx', station.x)
                        .attr('cy', station.y)
                        .attr('r', 6)
                        .attr('fill', '#fff')
                        .attr('class', `station-circle line-${line.id}`)
                        .style('cursor', 'pointer');
                } else if (station.isStop) {
                    interactiveElement = normalStationsGroup.append('line')
                        .attr('x1', station.x)
                        .attr('y1', station.y - 8)
                        .attr('x2', station.x)
                        .attr('y2', station.y + 8)
                        .attr('stroke', stationColor)
                        .attr('stroke-width', 4)
                        .attr('stroke-linecap', 'round')
                        .attr('class', `station-stop line-${line.id}`)
                        .style('cursor', 'pointer');
                    
                    const hoverArea = normalStationsGroup.append('circle')
                        .attr('cx', station.x)
                        .attr('cy', station.y)
                        .attr('r', 10)
                        .attr('fill', 'transparent')
                        .style('cursor', 'pointer');
                    
                    hoverArea.on('mouseover', (event) => interactiveElement.dispatch('mouseover', {bubbles: true, detail: event}))
                             .on('mouseout', (event) => interactiveElement.dispatch('mouseout', {bubbles: true, detail: event}))
                             .on('click', (event) => interactiveElement.dispatch('click', {bubbles: true, detail: event}));
                             
                } else {
                    interactiveElement = normalStationsGroup.append('circle')
                        .attr('cx', station.x)
                        .attr('cy', station.y)
                        .attr('r', 6)
                        .attr('class', `station-circle line-${line.id}`)
                        .attr('fill', '#fff')
                        .attr('stroke-width', 2)
                        .attr('stroke', stationColor)
                        .style('cursor', 'pointer');
                }

                interactiveElement.on('mouseover', (event) => {
                    const realEvent = event.detail && event.detail.pageX ? event.detail : event;
                    
                    let durationText = '';
                    if (index < line.stations.length - 1) {
                        const nextStation = line.stations[index + 1];
                        if (station.dateObj && nextStation.dateObj) {
                            const diffTime = nextStation.dateObj - station.dateObj;
                            const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
                            durationText = `<br/>${i18next.t('js.durationTo', { target: escapeHtml(nextStation.label), weeks: diffWeeks })}`;
                        }
                    }

                    let descHtml = '';
                    if (station.description && station.description.trim() !== '') {
                        let parsedMd = typeof marked !== 'undefined' ? marked.parse(station.description) : station.description;
                        descHtml = `<div class="tooltip-desc">${sanitizeHtml(parsedMd)}</div>`;
                    }
                    
                    this.tooltip.classed('hidden', false)
                        .html(`
                            <strong>${escapeHtml(station.label)}</strong><br/>
                            ${i18next.t('js.tooltipLine')}: ${escapeHtml(line.label)}<br/>
                            ${i18next.t('js.tooltipDate')}: ${escapeHtml(station.date)}${durationText}
                            ${descHtml}
                        `)
                        .style('left', (realEvent.pageX + 15) + 'px')
                        .style('top', (realEvent.pageY - 15) + 'px');
                    
                    if (!station.isStop) {
                        d3.select(event.target).attr('r', 8);
                    } else {
                        d3.select(event.target).attr('stroke-width', 6);
                    }
                }).on('mouseout', (event) => {
                    this.tooltip.classed('hidden', true);
                    if (!station.isStop) {
                        d3.select(event.target).attr('r', 6);
                    } else {
                        d3.select(event.target).attr('stroke-width', 4);
                    }
                }).on('click', (event) => {
                    const realEvent = event.detail && event.detail.stopPropagation ? event.detail : event;
                    realEvent.stopPropagation();
                    this.highlightLine(line.id);
                    window.dispatchEvent(new CustomEvent('focus-station', {
                        detail: { id: station.id }
                    }));
                });

                if (station.isStop) return;

                const width = station.label.length * 6.5; 
                const height = 14;

                const topOffset = isTransfer ? -18 : -14;
                const bottomOffset = isTransfer ? 26 : 22; 

                const topBox = {
                    xMin: station.x - width/2,
                    xMax: station.x + width/2,
                    yMin: station.y + topOffset - height,
                    yMax: station.y + topOffset
                };

                const bottomBox = {
                    xMin: station.x - width/2,
                    xMax: station.x + width/2,
                    yMin: station.y + bottomOffset - height,
                    yMax: station.y + bottomOffset
                };

                let finalOffset = topOffset;
                let forceBottom = false;
                let forceTop = false;

                if (isTransfer) {
                    let connectedStationId = station.transferTo;
                    if (!connectedStationId) {
                        for (let s of allStations.values()) {
                            if (s.transferTo === station.id) {
                                connectedStationId = s.id;
                                break;
                            }
                        }
                    }
                    if (connectedStationId && allStations.has(connectedStationId)) {
                        const otherY = allStations.get(connectedStationId).y;
                        if (station.y > otherY) {
                            forceBottom = true;
                        } else if (station.y < otherY) {
                            forceTop = true;
                        }
                    }
                } else if (line.isLastInZone) {
                    forceBottom = true;
                }

                let preferredOffset = topOffset;
                if (!line.isLastInZone && line.lineIndex % 2 !== 0 && !isTransfer) {
                    preferredOffset = bottomOffset;
                }

                // Resolve label placement by testing preferred top/bottom positions against occupied boxes.
                if (forceBottom) {
                    finalOffset = bottomOffset;
                } else if (forceTop) {
                    finalOffset = topOffset;
                } else {
                    if (preferredOffset === bottomOffset) {
                        if (!checkCollision(bottomBox)) {
                            finalOffset = bottomOffset;
                        } else if (!checkCollision(topBox)) {
                            finalOffset = topOffset;
                        } else {
                            finalOffset = bottomOffset;
                        }
                    } else {
                        if (!checkCollision(topBox)) {
                            finalOffset = topOffset;
                        } else if (!checkCollision(bottomBox)) {
                            finalOffset = bottomOffset;
                        } else {
                            finalOffset = topOffset;
                        }
                    }
                }
                
                if (station.flipLabel) {
                    finalOffset = (finalOffset === topOffset) ? bottomOffset : topOffset;
                }

                // Stagger labels vertically when stations are close together
                const prevX = index > 0 ? line.stations[index - 1].x : null;
                const nextX = index < line.stations.length - 1 ? line.stations[index + 1].x : null;
                const minDist = Math.min(
                    prevX !== null ? Math.abs(station.x - prevX) : Infinity,
                    nextX !== null ? Math.abs(station.x - nextX) : Infinity
                );
                const denseThreshold = 80;
                let adjustedOffset = finalOffset;
                if (minDist < denseThreshold && !station.flipLabel) {
                    if (index % 2 === 1) {
                        adjustedOffset = (finalOffset === topOffset) ? bottomOffset : topOffset;
                    }
                    if (minDist < 15) {
                        const extraPush = adjustedOffset > 0 ? 14 : -14;
                        adjustedOffset += extraPush;
                    }
                }
                // Label-only collision: find a free vertical slot
                const isDense = minDist < 20;
                const fontSize = isDense ? '10px' : '12px';
                const charW = isDense ? 5.5 : 6.5;
                const labelW = station.label.length * charW;
                const labelH = isDense ? 12 : 14;
                const makeBox = (off) => ({
                    xMin: station.x - labelW/2, xMax: station.x + labelW/2,
                    yMin: station.y + off - labelH, yMax: station.y + off
                });
                let finalBox = makeBox(adjustedOffset);
                if (checkLabelCollision(finalBox)) {
                    // Try multiple vertical slots in small steps
                    const candidates = [
                        (adjustedOffset === topOffset) ? bottomOffset : topOffset,
                        topOffset - 14,
                        bottomOffset + 14,
                        topOffset - 28,
                        bottomOffset + 28
                    ];
                    let found = false;
                    for (const off of candidates) {
                        const tryBox = makeBox(off);
                        if (!checkLabelCollision(tryBox)) {
                            adjustedOffset = off;
                            finalBox = tryBox;
                            found = true;
                            break;
                        }
                    }
                }
                addLabelBox(finalBox.xMin, finalBox.xMax, finalBox.yMin, finalBox.yMax);

                const labelX = station.x;
                const bgEl = labelsGroup.append('text')
                    .attr('x', labelX)
                    .attr('y', station.y + adjustedOffset)
                    .attr('class', `station-label-bg line-${line.id}`)
                    .attr('text-anchor', 'middle')
                    .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                    .attr('font-size', fontSize)
                    .attr('fill', 'none')
                    .attr('stroke', zoneColors.get(line.zone))
                    .attr('stroke-width', 3)
                    .attr('stroke-linejoin', 'round')
                    .style('pointer-events', 'none')
                    .text(station.label);

                const fgEl = labelsGroup.append('text')
                    .attr('x', labelX)
                    .attr('y', station.y + adjustedOffset)
                    .attr('class', `station-label line-${line.id}`)
                    .attr('text-anchor', 'middle')
                    .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                    .attr('font-size', fontSize)
                    .attr('fill', '#333')
                    .style('pointer-events', 'none')
                    .text(station.label);

                // Invisible hit area for label hover
                const hitArea = labelsGroup.append('rect')
                    .attr('x', labelX - labelW/2)
                    .attr('y', station.y + adjustedOffset - labelH)
                    .attr('width', labelW)
                    .attr('height', labelH + 4)
                    .attr('fill', 'transparent')
                    .style('cursor', 'pointer');

                // Hover: highlight label + show tooltip
                const labelHoverIn = (event) => {
                    bgEl.attr('font-size', '13px').attr('stroke-width', 4);
                    fgEl.attr('font-size', '13px').attr('font-weight', 'bold').attr('fill', '#000');
                    let durationText = '';
                    if (index < line.stations.length - 1) {
                        const nextStation = line.stations[index + 1];
                        if (station.dateObj && nextStation.dateObj) {
                            const diffTime = nextStation.dateObj - station.dateObj;
                            const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
                            durationText = '<br/>' + i18next.t('js.durationTo', { target: escapeHtml(nextStation.label), weeks: diffWeeks });
                        }
                    }
                    let descHtml = '';
                    if (station.description && station.description.trim() !== '') {
                        let parsedMd = typeof marked !== 'undefined' ? marked.parse(station.description) : station.description;
                        descHtml = '<div class="tooltip-desc">' + sanitizeHtml(parsedMd) + '</div>';
                    }
                    this.tooltip.classed('hidden', false)
                        .html('<strong>' + escapeHtml(station.label) + '</strong><br/>' +
                              i18next.t('js.tooltipLine') + ': ' + escapeHtml(line.label) + '<br/>' +
                              i18next.t('js.tooltipDate') + ': ' + escapeHtml(station.date) + durationText + descHtml)
                        .style('left', (event.pageX + 15) + 'px')
                        .style('top', (event.pageY - 15) + 'px');
                };
                const labelHoverOut = () => {
                    bgEl.attr('font-size', fontSize).attr('stroke-width', 3);
                    fgEl.attr('font-size', fontSize).attr('font-weight', 'normal').attr('fill', '#333');
                    this.tooltip.classed('hidden', true);
                };
                hitArea.on('mouseover', labelHoverIn).on('mousemove', (event) => {
                    this.tooltip.style('left', (event.pageX + 15) + 'px').style('top', (event.pageY - 15) + 'px');
                }).on('mouseout', labelHoverOut);
            });
        });
    }

    renderLabels(group, layout, visibleLines, zones, zoneColors, config) {
        const bottomY = config.height - config.margins.bottom;

        (layout.events || []).forEach(event => {
            group.append('text')
                .attr('x', event.x)
                .attr('y', bottomY + 20)
                .attr('text-anchor', 'end')
                .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .attr('fill', '#d32f2f')
                .attr('transform', `rotate(-35, ${event.x}, ${bottomY + 20})`)
                .text(event.label);

            group.append('text')
                .attr('x', event.x)
                .attr('y', config.margins.top - 45)
                .attr('text-anchor', 'start')
                .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                .attr('font-size', '11px')
                .attr('font-weight', 'bold')
                .attr('fill', '#d32f2f')
                .attr('transform', `rotate(-35, ${event.x}, ${config.margins.top - 45})`)
                .text(event.date);
        });

        zones.forEach(zone => {
            const labelGroup = group.append('g')
                .style('cursor', 'pointer')
                .on('click', () => {
                    window.dispatchEvent(new CustomEvent('toggle-zone', { detail: { id: zone.id } }));
                });

            if (zone.collapsed) {
                labelGroup.append('path')
                    .attr('d', `M 20 ${zone.y + 21} L 28 ${zone.y + 26} L 20 ${zone.y + 31} Z`)
                    .attr('fill', '#888');
            } else {
                labelGroup.append('path')
                    .attr('d', `M 17 ${zone.y + 24} L 27 ${zone.y + 24} L 22 ${zone.y + 30} Z`)
                    .attr('fill', '#888');
            }

            labelGroup.append('text')
                .attr('x', 38)
                .attr('y', zone.y + 30)
                .attr('class', 'zone-label')
                .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                .attr('font-size', '14px')
                .attr('font-weight', 'bold')
                .attr('fill', '#555')
                .text(zone.label);
        });

        visibleLines.forEach(line => {
            group.append('text')
                .attr('x', 50)
                .attr('y', line.y + 4) 
                .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                .attr('font-size', '12px')
                .attr('fill', 'none')
                .attr('stroke', zoneColors.get(line.zone))
                .attr('stroke-width', 3)
                .attr('stroke-linejoin', 'round')
                .text(line.label);

            group.append('text')
                .attr('x', 50)
                .attr('y', line.y + 4) 
                .attr('font-family', 'Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif')
                .attr('font-size', '12px')
                .attr('fill', '#333')
                .text(line.label);
        });
    }

    setupZoom(svg, zoomGroup) {
        const zoom = d3.zoom()
            .scaleExtent([0.2, 5])
            .on('zoom', (event) => {
                zoomGroup.attr('transform', event.transform);
            });

        svg.call(zoom);
    }

    highlightLine(lineId) {
        d3.selectAll('.metro-line, .station-circle, .station-label, .station-stop, .terminus-line, .metro-relation-path, .metro-relation-hit')
            .attr('opacity', 0.2);

        d3.selectAll(`.line-${lineId}`)
            .attr('opacity', 1);
    }

    clearHighlight() {
        this._selectedRelationKey = null;
        d3.selectAll('.metro-relation-path').classed('relation-path-selected', false).classed('metro-relation-hover', false);
        d3.selectAll('.relation-selection-ring').remove();
        this.tooltip.classed('hidden', true);
        d3.selectAll('.metro-line, .station-circle, .station-label, .station-stop, .terminus-line, .metro-relation-path, .metro-relation-hit')
            .attr('opacity', 1);
    }
}
