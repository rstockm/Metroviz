export class MetroRenderer {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        this.tooltip = d3.select('#tooltip');
    }

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
                const dx = curr.x - prev.x;
                const dy = curr.y - prev.y;
                const absDy = Math.abs(dy);
                
                // For small decorative lane changes, we start the 45-degree slope a fixed distance before the station
                // rather than in the exact middle, to make it look like a "pulling into station" maneuver.
                // We use a fixed distance (e.g. 20px) or half the X distance if it's too tight.
                const slopeWidth = absDy; // For a 45 degree angle, dx = dy
                
                // Wir wollen, dass der Spurwechsel (die Diagonale) etwas VOR der Station stattfindet,
                // und danach noch ein kurzes gerades Stück bis zur Station verläuft.
                const straightBeforeStation = 15; // px gerade vor der Station
                const requiredSpace = slopeWidth + straightBeforeStation;
                
                if (Math.abs(dx) > requiredSpace) {
                    const direction = Math.sign(dx);
                    // 1. Fahre auf alter Höhe bis kurz vor die Diagonale
                    const slopeStartX = curr.x - (requiredSpace * direction);
                    path.push({x: slopeStartX, y: prev.y, lineId: curr.lineId});
                    
                    // 2. Diagonale
                    const slopeEndX = curr.x - (straightBeforeStation * direction);
                    path.push({x: slopeEndX, y: curr.y, lineId: curr.lineId});
                    
                    // 3. Gerade bis in die Station
                    path.push(point);
                } else if (Math.abs(dx) > slopeWidth) {
                    // Falls nicht genug Platz für das gerade Stück ist, nur Diagonale
                    const slopeStartX = curr.x - (slopeWidth * Math.sign(dx));
                    path.push({x: slopeStartX, y: prev.y, lineId: curr.lineId});
                    path.push(point);
                } else {
                    // Fallback
                    path.push(point);
                }
            }
        }
        return path;
    }

    render(layout) {
        const { config, xScale, zones, lines } = layout;

        this.container.innerHTML = '';

        const svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${config.width} ${config.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('xmlns', 'http://www.w3.org/2000/svg');

        const zoomGroup = svg.append('g').attr('class', 'zoom-group');

        // Helper to compute pale zone background color
        const getPaleColor = (hexColor) => {
            const color = d3.color(hexColor || '#eeeeee');
            if (!color) return '#ffffff';
            // Mix with white: 10% color, 90% white
            const r = Math.round(color.r * 0.1 + 255 * 0.9);
            const g = Math.round(color.g * 0.1 + 255 * 0.9);
            const b = Math.round(color.b * 0.1 + 255 * 0.9);
            return d3.rgb(r, g, b).formatHex();
        };

        const zoneColors = new Map();
        zones.forEach(z => zoneColors.set(z.id, getPaleColor(z.color)));

        // 0. Render Meta (Title & Organization)
        if (layout.meta) {
            const metaGroup = zoomGroup.append('g').attr('class', 'meta-info');
            
            if (layout.meta.title) {
                metaGroup.append('text')
                    .attr('x', 20)
                    .attr('y', 40)
                    .attr('font-family', 'sans-serif')
                    .attr('font-size', '24px')
                    .attr('font-weight', 'bold')
                    .attr('fill', '#333')
                    .text(layout.meta.title);
            }
            
            if (layout.meta.organization) {
                metaGroup.append('text')
                    .attr('x', 20)
                    .attr('y', 65)
                    .attr('font-family', 'sans-serif')
                    .attr('font-size', '14px')
                    .attr('fill', '#666')
                    .text(layout.meta.organization);
            }
        }

        // 1. Render Zones Backgrounds
        const zoneGroup = zoomGroup.append('g').attr('class', 'zones');
        zones.forEach(zone => {
            zoneGroup.append('rect')
                .attr('x', 0)
                .attr('y', zone.y)
                .attr('width', Math.max(config.width * 2, 3000))
                .attr('height', zone.height)
                .attr('fill', zone.color || '#eee')
                .attr('class', 'zone-band')
                .attr('opacity', '0.1');
        });

        // 2. Render Grid
        // 2a. Quarters
        const xAxisQuarters = d3.axisTop(xScale)
            .ticks(d3.timeMonth.every(3))
            .tickFormat(d => {
                // Only show label if it's not the start of a year
                if (d.getMonth() === 0) return "";
                const quarter = Math.floor(d.getMonth() / 3) + 1;
                return `Q${quarter}`;
            });

        zoomGroup.append('g')
            .attr('class', 'axis axis-grid-quarters')
            .attr('transform', `translate(0, ${config.margins.top})`)
            .call(xAxisQuarters.tickSize(-config.height + config.margins.top + config.margins.bottom))
            .selectAll("line")
            .attr("stroke", "#e0e0e0")
            .attr("stroke-width", 1);
            
        zoomGroup.selectAll(".axis-grid-quarters path").attr("stroke", "none");
        zoomGroup.selectAll(".axis-grid-quarters text").attr("fill", "#999").attr("font-family", "sans-serif").attr("font-size", "7px");

        // 2b. Years
        const xAxisYears = d3.axisTop(xScale)
            .ticks(d3.timeYear.every(1))
            .tickFormat(d3.timeFormat("%Y"));

        zoomGroup.append('g')
            .attr('class', 'axis axis-grid-years')
            .attr('transform', `translate(0, ${config.margins.top})`)
            .call(xAxisYears.tickSize(-config.height + config.margins.top + config.margins.bottom))
            .selectAll("line")
            .attr("stroke", "#cccccc")
            .attr("stroke-width", 1.5);

        zoomGroup.selectAll(".axis-grid-years path").attr("stroke", "none");
        zoomGroup.selectAll(".axis-grid-years text").attr("fill", "#555").attr("font-family", "sans-serif").attr("font-size", "15px").attr("font-weight", "bold");

        // 3. Render Events (Vertical Lines)
        const eventsGroup = zoomGroup.append('g').attr('class', 'events-lines');
        const bottomY = config.height - config.margins.bottom;

        (layout.events || []).forEach(event => {
            eventsGroup.append('line')
                .attr('x1', event.x)
                .attr('y1', config.margins.top)
                .attr('x2', event.x)
                .attr('y2', bottomY)
                .attr('stroke', '#d32f2f') // Red dashed line for events
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5')
                .attr('opacity', '0.7');
        });

        // Filter visible lines for rendering
        const visibleLines = lines.filter(l => !l.hidden);

        // 4. Render Line Indicators (Pills)
        const lineIndicatorsGroup = zoomGroup.append('g').attr('class', 'line-indicators');
        visibleLines.forEach(line => {
            lineIndicatorsGroup.append('line')
                .attr('x1', 20)
                .attr('y1', line.y)
                .attr('x2', 40)
                .attr('y2', line.y)
                .attr('stroke', line.color)
                .attr('stroke-width', 6)
                .attr('stroke-linecap', 'round');
        });

        // 5. Lines
        const linesGroup = zoomGroup.append('g').attr('class', 'lines');
        const lineGenerator = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveLinear);

        visibleLines.forEach(line => {
            const routedPath = this.generateMetroPath(line.stations);
            
            // To support tinting, we need to draw segments instead of one single path
            // We group the routedPath points into segments that correspond to the sections between stations
            const segments = [];
            let currentSegment = [];
            let currentTint = false;
            
            // Reconstruct segments between stations
            // We need to map the routed points back to the original stations to know when tint changes
            let currentStationIndex = 0;
            
            for (let i = 0; i < routedPath.length; i++) {
                const pt = routedPath[i];
                currentSegment.push(pt);
                
                // If this point is exactly at the next station's coordinates (ignoring intermediate routing points)
                const nextStation = line.stations[currentStationIndex];
                if (nextStation && pt.x === nextStation.x && pt.y === nextStation.y) {
                    
                    // The segment ends here
                    if (currentSegment.length > 1) {
                        segments.push({
                            path: currentSegment,
                            tint: currentStationIndex > 0 ? line.stations[currentStationIndex-1].tint : false
                        });
                    }
                    
                    // Start new segment
                    currentSegment = [pt];
                    currentStationIndex++;
                }
            }
            // Add final segment if any points left after last station
            if (currentSegment.length > 1) {
                 segments.push({
                     path: currentSegment,
                     tint: currentStationIndex > 0 && currentStationIndex <= line.stations.length ? line.stations[currentStationIndex-1].tint : false
                 });
            }

            segments.forEach((seg, idx) => {
                let strokeColor = line.color;
                if (seg.tint) {
                    // Calculate a solid faded color instead of using opacity to prevent grid from shining through
                    const zoneBg = zoneColors.get(line.zone) || '#ffffff';
                    // Mix the line color with the zone background color (30% line color, 70% zone background)
                    strokeColor = d3.interpolate(line.color, zoneBg)(0.7);
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
                    .on('click', (event) => this.highlightLine(line.id));
            });
        });

        // Terminus Indicators
        const terminusGroup = zoomGroup.append('g').attr('class', 'terminus-indicators');
        visibleLines.forEach(line => {
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

        // Links calculation
        const transferLinks = [];
        const allStations = new Map();
        lines.forEach(l => l.stations.forEach(s => allStations.set(s.id, { ...s, color: l.color, hidden: l.hidden })));

        allStations.forEach(s => {
            if (s.transferTo && allStations.has(s.transferTo)) {
                const target = allStations.get(s.transferTo);
                if (!s.hidden || !target.hidden) {
                    transferLinks.push({
                        source: s,
                        target: target
                    });
                }
            }
        });

        // Collision Detection for Labels
        const occupiedBoxes = [];
        
        function addBox(xMin, xMax, yMin, yMax) {
            occupiedBoxes.push({xMin, xMax, yMin, yMax});
        }
        
        function checkCollision(box) {
            const pad = 2;
            for (let b of occupiedBoxes) {
                if (box.xMin - pad < b.xMax && box.xMax + pad > b.xMin && 
                    box.yMin - pad < b.yMax && box.yMax + pad > b.yMin) {
                    return true;
                }
            }
            return false;
        }

        // Add line segments to occupiedBoxes
        visibleLines.forEach(line => {
            const routedPath = this.generateMetroPath(line.stations);
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

        // Add transfer links to occupiedBoxes
        transferLinks.forEach(link => {
            addBox(
                Math.min(link.source.x, link.target.x) - 10,
                Math.max(link.source.x, link.target.x) + 10,
                Math.min(link.source.y, link.target.y) - 10,
                Math.max(link.source.y, link.target.y) + 10
            );
        });

        // Add station circles to occupiedBoxes
        visibleLines.forEach(line => {
            line.stations.forEach(station => {
                const isTransfer = station.type === 'transfer' || station.transferTo || station.transferFrom;
                const r = isTransfer ? 10 : 7;
                addBox(station.x - r, station.x + r, station.y - r, station.y + r);
            });
        });

        // Groups for layering
        const transferBgGroup = zoomGroup.append('g').attr('class', 'transfer-bg');
        const transferFgGroup = zoomGroup.append('g').attr('class', 'transfer-fg');
        const normalStationsGroup = zoomGroup.append('g').attr('class', 'normal-stations');
        const labelsGroup = zoomGroup.append('g').attr('class', 'labels');

        // Transfer Links lines
        transferLinks.forEach(link => {
            // Background (Black outline)
            transferBgGroup.append('line')
                .attr('x1', link.source.x)
                .attr('y1', link.source.y)
                .attr('x2', link.target.x)
                .attr('y2', link.target.y)
                .attr('stroke', '#000')
                .attr('stroke-width', 18)
                .attr('stroke-linecap', 'round');
            
            // Foreground (White inner)
            transferFgGroup.append('line')
                .attr('x1', link.source.x)
                .attr('y1', link.source.y)
                .attr('x2', link.target.x)
                .attr('y2', link.target.y)
                .attr('stroke', '#fff')
                .attr('stroke-width', 12)
                .attr('stroke-linecap', 'round');
        });

        // Stations
        visibleLines.forEach(line => {
            line.stations.forEach((station, index) => {
                const isTransfer = station.type === 'transfer' || station.transferTo || station.transferFrom;
                
                let interactiveElement;
                
                // Determine station circle color
                let stationColor = line.color;
                // If this station starts a tinted segment, OR the previous segment was tinted and this station is just an intermediate point
                // we should probably use the tinted color, UNLESS it's the start/end of a non-tinted segment.
                // Let's check if both surrounding segments (if they exist) are tinted.
                const isTintedHere = station.tint;
                const wasTintedBefore = index > 0 ? line.stations[index - 1].tint : false;
                
                if (isTintedHere || (index > 0 && wasTintedBefore && index === line.stations.length - 1)) {
                    const zoneBg = zoneColors.get(line.zone) || '#ffffff';
                    stationColor = d3.interpolate(line.color, zoneBg)(0.7);
                }

                if (isTransfer) {
                    // Transfer Station Background
                    transferBgGroup.append('circle')
                        .attr('cx', station.x)
                        .attr('cy', station.y)
                        .attr('r', 9)
                        .attr('fill', '#000')
                        .attr('class', `line-${line.id}`);

                    // Transfer Station Foreground
                    interactiveElement = transferFgGroup.append('circle')
                        .attr('cx', station.x)
                        .attr('cy', station.y)
                        .attr('r', 6)
                        .attr('fill', '#fff')
                        .attr('class', `station-circle line-${line.id}`)
                        .style('cursor', 'pointer');
                } else if (station.isStop) {
                    // Stop (Haltestelle) - 90 degree line
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
                    
                    // Add a transparent circle overlay for better hover/click area
                    const hoverArea = normalStationsGroup.append('circle')
                        .attr('cx', station.x)
                        .attr('cy', station.y)
                        .attr('r', 10)
                        .attr('fill', 'transparent')
                        .style('cursor', 'pointer');
                    
                    // Link the hoverArea events to the interactiveElement logic
                    hoverArea.on('mouseover', (event) => interactiveElement.dispatch('mouseover', {bubbles: true, detail: event}))
                             .on('mouseout', (event) => interactiveElement.dispatch('mouseout', {bubbles: true, detail: event}))
                             .on('click', (event) => interactiveElement.dispatch('click', {bubbles: true, detail: event}));
                             
                } else {
                    // Normal Station
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

                // Tooltip events
                interactiveElement.on('mouseover', (event) => {
                    // Unwrap the detail if this came from the hoverArea transparent circle
                    const realEvent = event.detail && event.detail.pageX ? event.detail : event;
                    
                    let durationText = '';
                    if (index < line.stations.length - 1) {
                        const nextStation = line.stations[index + 1];
                        if (station.dateObj && nextStation.dateObj) {
                            const diffTime = nextStation.dateObj - station.dateObj;
                            const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
                            durationText = `<br/>Dauer bis ${nextStation.label}: ca. ${diffWeeks} Wochen`;
                        }
                    }

                    let descHtml = '';
                    if (station.description && station.description.trim() !== '') {
                        let parsedMd = typeof marked !== 'undefined' ? marked.parse(station.description) : station.description;
                        descHtml = `<div class="tooltip-desc">${parsedMd}</div>`;
                    }
                    
                    this.tooltip.classed('hidden', false)
                        .html(`
                            <strong>${station.label}</strong><br/>
                            Linie: ${line.label}<br/>
                            Datum: ${station.date}${durationText}
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
                    // Dispatch custom event to trigger Alpine scroll
                    window.dispatchEvent(new CustomEvent('focus-station', {
                        detail: { id: station.id }
                    }));
                });

                // Skip drawing label text permanently on map if it is a stop (Haltestelle)
                if (station.isStop) return;

                // Station label collision detection
                const width = station.label.length * 6.5; 
                const height = 14;

                const topOffset = isTransfer ? -18 : -14;
                const bottomOffset = isTransfer ? 26 : 22; // text baseline is roughly at the bottom

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

                // For transfer stations, always place the label on the "outside" of the transfer link
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

                // Remove the strict even/odd forcing because it can cause the top-most line to force bottom incorrectly
                // if it happens to be an odd index (which depends on total number of lines in zone).
                // Let the collision detection handle it, but we can give it a hint:
                let preferredOffset = topOffset;
                if (!line.isLastInZone && line.lineIndex % 2 !== 0 && !isTransfer) {
                    // For non-last, odd-indexed lines, prefer bottom if it doesn't collide
                    preferredOffset = bottomOffset;
                }

                if (forceBottom) {
                    finalOffset = bottomOffset;
                    addBox(bottomBox.xMin, bottomBox.xMax, bottomBox.yMin, bottomBox.yMax);
                } else if (forceTop) {
                    finalOffset = topOffset;
                    addBox(topBox.xMin, topBox.xMax, topBox.yMin, topBox.yMax);
                } else {
                    if (preferredOffset === bottomOffset) {
                        // Try bottom first
                        if (!checkCollision(bottomBox)) {
                            finalOffset = bottomOffset;
                            addBox(bottomBox.xMin, bottomBox.xMax, bottomBox.yMin, bottomBox.yMax);
                        } else if (!checkCollision(topBox)) {
                            finalOffset = topOffset;
                            addBox(topBox.xMin, topBox.xMax, topBox.yMin, topBox.yMax);
                        } else {
                            finalOffset = bottomOffset; // Default fallback
                            addBox(bottomBox.xMin, bottomBox.xMax, bottomBox.yMin, bottomBox.yMax);
                        }
                    } else {
                        // Try top first
                        if (!checkCollision(topBox)) {
                            finalOffset = topOffset;
                            addBox(topBox.xMin, topBox.xMax, topBox.yMin, topBox.yMax);
                        } else if (!checkCollision(bottomBox)) {
                            finalOffset = bottomOffset;
                            addBox(bottomBox.xMin, bottomBox.xMax, bottomBox.yMin, bottomBox.yMax);
                        } else {
                            finalOffset = topOffset; // Default fallback
                            addBox(topBox.xMin, topBox.xMax, topBox.yMin, topBox.yMax);
                        }
                    }
                }

                labelsGroup.append('text')
                    .attr('x', station.x)
                    .attr('y', station.y + finalOffset)
                    .attr('class', `station-label line-${line.id}`)
                    .attr('text-anchor', 'middle')
                    .attr('font-family', 'sans-serif')
                    .attr('font-size', '12px')
                    .attr('fill', '#333')
                    .attr('stroke', zoneColors.get(line.zone))
                    .attr('stroke-width', 3)
                    .attr('paint-order', 'stroke fill')
                    .attr('stroke-linejoin', 'round')
                    .text(station.label);
            });
        });

        // 9. Render All Texts/Labels at the very top (highest Z-Order)
        const globalLabelsGroup = zoomGroup.append('g').attr('class', 'global-labels');

        // Event Labels
        (layout.events || []).forEach(event => {
            // Label at the bottom
            globalLabelsGroup.append('text')
                .attr('x', event.x)
                .attr('y', bottomY + 20)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'sans-serif')
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .attr('fill', '#d32f2f')
                .text(event.label);

            // Date at the top (above the year grid)
            globalLabelsGroup.append('text')
                .attr('x', event.x)
                .attr('y', config.margins.top - 25)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'sans-serif')
                .attr('font-size', '11px')
                .attr('font-weight', 'bold')
                .attr('fill', '#d32f2f')
                .text(event.date);
        });

        // Zone Labels
        zones.forEach(zone => {
            const labelGroup = globalLabelsGroup.append('g')
                .style('cursor', 'pointer')
                .on('click', () => {
                    window.dispatchEvent(new CustomEvent('toggle-zone', { detail: { id: zone.id } }));
                });

            labelGroup.append('text')
                .attr('x', 20)
                .attr('y', zone.y + 30)
                .attr('font-family', 'sans-serif')
                .attr('font-size', '12px')
                .attr('fill', '#888')
                .text(zone.collapsed ? '▶' : '▼');

            labelGroup.append('text')
                .attr('x', 38)
                .attr('y', zone.y + 30)
                .attr('class', 'zone-label')
                .attr('font-family', 'sans-serif')
                .attr('font-size', '14px')
                .attr('font-weight', 'bold')
                .attr('fill', '#555')
                .text(zone.label);
        });

        // Line Labels
        visibleLines.forEach(line => {
            globalLabelsGroup.append('text')
                .attr('x', 50)
                .attr('y', line.y + 4) // adjust for vertical alignment with the pill
                .attr('font-family', 'sans-serif')
                .attr('font-size', '12px')
                .attr('fill', '#333')
                .attr('stroke', zoneColors.get(line.zone))
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke fill')
                .attr('stroke-linejoin', 'round')
                .text(line.label);
        });

        // Setup Zoom
        const zoom = d3.zoom()
            .scaleExtent([0.2, 5])
            .on('zoom', (event) => {
                zoomGroup.attr('transform', event.transform);
            });

        svg.call(zoom);
        
        // Background click to clear highlight
        svg.on('click', (event) => {
            if (event.target.tagName === 'svg' || event.target.tagName === 'rect') {
                this.clearHighlight();
            }
        });

        this.svgElement = svg.node();
    }

    highlightLine(lineId) {
        d3.selectAll('.metro-line, .station-circle, .station-label, .terminus-line')
            .attr('opacity', 0.2);
        
        d3.selectAll(`.line-${lineId}`)
            .attr('opacity', 1);
    }

    clearHighlight() {
        d3.selectAll('.metro-line, .station-circle, .station-label, .terminus-line')
            .attr('opacity', 1);
    }
}