import { el } from './goal-view.js';

const INNER = 4.5, STEP = 0.3, LINE = '#8e98a6';
const RAMP = ['#ffffff', '#ffeda0', '#feb24c', '#fd8d3c', '#e31a1c'];

function heat(x, y) {
    const d = Math.hypot(x, y);
    const ax = Math.abs(x);
    if (y < 0 || (ax <= 1.5 ? y : Math.hypot(ax - 1.5, y)) < INNER) return 0;
    const psi = ax <= 1.5 ? 0 : Math.atan2(ax - 1.5, y) * 180 / Math.PI;
    const fd = d <= 6 ? 1 : Math.exp(-Math.pow((d - 6) / 3.8, 2) * 1.2);
    const fa = psi <= 45 ? 1 : Math.max(0, Math.cos((psi - 45) / 45 * Math.PI / 2));
    return fd * fa;
}
function hex(c) { return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); }
function rampColor(t) {
    const n = RAMP.length - 1, k = Math.min(n - 1, Math.floor(t * n)), u = t * n - k;
    const a = hex(RAMP[k]), b = hex(RAMP[k + 1]);
    return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',') + ')';
}

function drawLines(svg) {
    el('path', { d: 'M -7.5 0 A 6 6 0 0 0 -1.5 6 L 1.5 6 A 6 6 0 0 0 7.5 0', fill: 'none', stroke: LINE, 'stroke-width': 0.06 }, svg);
    el('path', { d: 'M -10 2.958 A 9 9 0 0 0 -1.5 9 L 1.5 9 A 9 9 0 0 0 10 2.958', fill: 'none', stroke: LINE, 'stroke-width': 0.06, 'stroke-dasharray': '0.2 0.2' }, svg);
    el('line', { x1: -0.5, y1: 7, x2: 0.5, y2: 7, stroke: LINE, 'stroke-width': 0.06 }, svg);
    el('line', { x1: -0.1, y1: 4, x2: 0.1, y2: 4, stroke: LINE, 'stroke-width': 0.06 }, svg);
    el('line', { x1: -10, y1: 0, x2: 10, y2: 0, stroke: LINE, 'stroke-width': 0.06 }, svg);
    for (let i = 0; i < 15; i++) el('rect', { x: -1.5 + i * 0.2, y: -0.14, width: 0.2, height: 0.14, fill: i % 2 ? '#ffffff' : '#d7263d', stroke: '#d7263d', 'stroke-width': 0.02 }, svg);
}

let uid = 0;
function drawHeatCourt(svg, opts = {}) {
    const id = 'heat' + (uid++), depth = opts.depth || 10.5;
    el('rect', { x: -10, y: 0, width: 20, height: depth, fill: '#ffffff' }, svg);
    const defs = el('defs', {}, svg);
    const filter = el('filter', { id: id + 'Blur', x: '-5%', y: '-5%', width: '110%', height: '110%' }, defs);
    el('feGaussianBlur', { stdDeviation: 0.35 }, filter);
    const clip = el('clipPath', { id: id + 'Clip' }, defs);
    el('rect', { x: -10, y: 0, width: 20, height: depth }, clip);
    const g = el('g', { filter: `url(#${id}Blur)`, 'clip-path': `url(#${id}Clip)` }, svg);
    for (let y = 0; y < depth; y += STEP) {
        for (let x = -10; x < 10; x += STEP) {
            const h = heat(x + STEP / 2, y + STEP / 2);
            if (h < 0.02) continue;
            el('rect', { x, y, width: STEP, height: STEP, fill: rampColor(h) }, g);
        }
    }
    drawLines(svg);
    if (opts.legend) {
        const N = 12, X0 = 4.9, X1 = 7.4, Y0 = -1.45, H = 0.36, W = (X1 - X0) / N;
        el('rect', { x: X0, y: Y0, width: X1 - X0, height: H, fill: '#ffffff', stroke: LINE, 'stroke-width': 0.03 }, svg);
        for (let i = 0; i < N; i++) el('rect', { x: X0 + i * W, y: Y0, width: W, height: H, fill: rampColor(i / (N - 1)) }, svg);
        el('text', { x: X0 - 0.2, y: Y0 + 0.31, 'font-size': 0.4, fill: 'currentColor', opacity: 0.7, 'text-anchor': 'end' }, svg).textContent = '決まりにくい';
        el('text', { x: X1 + 0.2, y: Y0 + 0.31, 'font-size': 0.4, fill: 'currentColor', opacity: 0.7 }, svg).textContent = '決まりやすい';
    }
}

const main = document.getElementById('heatCourt');
if (main) drawHeatCourt(main, { legend: true });

export { drawHeatCourt };
