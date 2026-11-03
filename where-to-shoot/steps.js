import { el } from './goal-view.js';
import { drawHeatCourt } from './heat.js';

const BASE = { LW: [-9.5, 0.6], LB: [-9.0, 10.0], CB: [0.5, 10.5], RB: [9.0, 10.0], RW: [9.5, 0.6], PV: [0.3, 6.3],
               D1: [-5.9, 4.5], D2: [-3.7, 6.0], D3: [-1.3, 6.7], D4: [1.3, 6.7], D5: [3.7, 6.0], D6: [5.9, 4.5] };

function node(svg, p, isA) {
    el('circle', { cx: p[0], cy: p[1], r: 0.55, fill: isA ? '#ffffff' : '#243a5e', stroke: isA ? '#1a1a1a' : '#ffffff', 'stroke-width': 0.08 }, svg);
}
function ball(svg, holder, pos) {
    const p = pos[holder], side = p[0] < 0 ? -1 : 1;
    el('circle', { cx: Math.max(-9.6, Math.min(9.6, p[0] + side * 0.45)), cy: p[1] - 0.45, r: 0.3, fill: '#f2a33a', stroke: '#1a1a1a', 'stroke-width': 0.06 }, svg);
}
function wedge(svg, p) {
    el('path', { d: `M ${p[0]} ${p[1]} L -1.5 0 L 1.5 0 Z`, fill: 'rgba(36,58,94,.16)', stroke: '#243a5e', 'stroke-width': 0.04, 'stroke-opacity': 0.5 }, svg);
}
function scene(svg, pos, holder, opts = {}) {
    drawHeatCourt(svg, { depth: 12 });
    if (opts.wedge) wedge(svg, pos[holder]);
    for (const id in pos) node(svg, pos[id], !id.startsWith('D'));
    ball(svg, holder, pos);
}

const LONG = Object.assign({}, BASE, { LB: [-3.6, 9.3], CB: [1.5, 10.5] });
const def = document.getElementById('defCourt');
if (def) scene(def, LONG, 'LB', { wedge: true });
