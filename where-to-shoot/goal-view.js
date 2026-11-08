const NS = 'http://www.w3.org/2000/svg';
const EYE = 1.8;
const RATE = { '6m 線の近く': 69.7, 'ウイング': 64.5, '9m 線のあたり': 43.2 };

function el(name, attrs = {}, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
}

const WING_DEG = 54, WING_MAX = 72, NINE_DEG = 45, NEAR_IN = 4.5, NEAR_OUT = 8, WING_OUT = 7, FAR_OUT = 10.2;
const ZONE_LABEL = '#e4ff8a', ZONE_FILL = 'rgba(197,240,108,.38)', ZONE_STROKE = 'rgba(197,240,108,.95)';

function arcPts2(side, degFrom, degTo, D, n = 24) {
    const out = [];
    for (let i = 0; i <= n; i++) {
        const a = (degFrom + (degTo - degFrom) * i / n) * Math.PI / 180;
        out.push([side * (1.5 + D * Math.sin(a)), D * Math.cos(a)]);
    }
    return out;
}
function zonePoints(key) {
    const W = WING_DEG, N = NINE_DEG, A = NEAR_OUT, B = FAR_OUT, I = NEAR_IN, M = WING_MAX, O = WING_OUT;
    if (key === '6m 線の近く') return [...arcPts2(-1, W, 0, A), ...arcPts2(1, 0, W, A), ...arcPts2(1, W, 0, I), ...arcPts2(-1, 0, W, I)];
    if (key === 'ウイング-L') return [...arcPts2(-1, W, M, I), ...arcPts2(-1, M, W, O)];
    if (key === 'ウイング-R') return [...arcPts2(1, W, M, I), ...arcPts2(1, M, W, O)];
    return [...arcPts2(-1, N, 0, A), ...arcPts2(1, 0, N, A), ...arcPts2(1, N, 0, B), ...arcPts2(-1, 0, N, B)];
}
function zoneKey(x, y) {
    const z = zoneOf(x, y);
    return z === 'ウイング' ? (x < 0 ? 'ウイング-L' : 'ウイング-R') : z;
}
function zoneOf(x, y) {
    const ax = Math.abs(x);
    const D = ax <= 1.5 ? y : Math.hypot(ax - 1.5, y);
    const psi = ax <= 1.5 ? 0 : Math.atan2(ax - 1.5, y) * 180 / Math.PI;
    if (y < 0 || D < NEAR_IN) return null;
    if (D < NEAR_OUT) {
        if (psi <= WING_DEG) return '6m 線の近く';
        return psi <= WING_MAX && D < WING_OUT ? 'ウイング' : null;
    }
    if (D < FAR_OUT && psi <= NINE_DEG) return '9m 線のあたり';
    return null;
}

function drawCourt(svg, depth = 10.5) {
    el('rect', { x: -10.5, y: -0.5, width: 21, height: depth + 0.5, fill: '#2b5a8a' }, svg);
    el('rect', { x: -10, y: 0, width: 20, height: depth, fill: '#4f86c0' }, svg);
    el('path', { d: 'M -7.5 0 A 6 6 0 0 0 -1.5 6 L 1.5 6 A 6 6 0 0 0 7.5 0 Z', fill: '#f2a33a' }, svg);
    el('path', { d: 'M -7.5 0 A 6 6 0 0 0 -1.5 6 L 1.5 6 A 6 6 0 0 0 7.5 0', fill: 'none', stroke: '#ffffff', 'stroke-width': 0.06 }, svg);
    el('path', { d: 'M -10 2.958 A 9 9 0 0 0 -1.5 9 L 1.5 9 A 9 9 0 0 0 10 2.958', fill: 'none', stroke: '#ffffff', 'stroke-width': 0.06, 'stroke-dasharray': '0.2 0.2' }, svg);
    el('line', { x1: -0.5, y1: 7, x2: 0.5, y2: 7, stroke: '#ffffff', 'stroke-width': 0.06 }, svg);
    el('line', { x1: -0.1, y1: 4, x2: 0.1, y2: 4, stroke: '#ffffff', 'stroke-width': 0.06 }, svg);
    el('line', { x1: -10, y1: 0, x2: 10, y2: 0, stroke: '#ffffff', 'stroke-width': 0.06 }, svg);
    el('line', { x1: -1.5, y1: 0, x2: 1.5, y2: 0, stroke: '#ffffff', 'stroke-width': 0.1 }, svg);
    el('line', { x1: -10, y1: 0, x2: -10, y2: depth, stroke: '#ffffff', 'stroke-width': 0.06 }, svg);
    el('line', { x1: 10, y1: 0, x2: 10, y2: depth, stroke: '#ffffff', 'stroke-width': 0.06 }, svg);
    for (let i = 0; i < 15; i++) {
        el('rect', { x: -1.5 + i * 0.2, y: -0.12, width: 0.2, height: 0.12, fill: i % 2 ? '#ffffff' : '#d7263d' }, svg);
    }
    el('rect', { x: -1.56, y: -0.12, width: 0.06, height: 0.12, fill: '#d7263d' }, svg);
    el('rect', { x: 1.5, y: -0.12, width: 0.06, height: 0.12, fill: '#d7263d' }, svg);
    const zones = {};
    for (const key of ['6m 線の近く', 'ウイング-L', 'ウイング-R', '9m 線のあたり']) {
        zones[key] = el('polygon', { points: zonePoints(key).map(p => p.join(',')).join(' '), fill: ZONE_FILL, stroke: ZONE_STROKE, 'stroke-width': 0.04, 'stroke-linejoin': 'round', opacity: 0, style: 'transition: opacity .25s' }, svg);
    }
    return zones;
}

const LOOP = [[-7.5, 2.4], [-7.4, 6.8], [-1.0, 8.8], [0.5, 6.4], [4.8, 6.2], [7.5, 2.4], [7.4, 6.8], [1.0, 8.8], [-0.5, 6.4], [-4.8, 6.2]];
const SEG_MS = 2200, LOOP_MS = SEG_MS * LOOP.length, IDLE_RESUME = 5000, BLEND = 1200, FRAME = 32;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

function loopPoint(ms) {
    const n = LOOP.length, u = ((ms % LOOP_MS) + LOOP_MS) % LOOP_MS / SEG_MS, i = Math.floor(u), t = u - i;
    const p0 = LOOP[(i + n - 1) % n], p1 = LOOP[i], p2 = LOOP[(i + 1) % n], p3 = LOOP[(i + 2) % n];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
    return { x: cr(p0[0], p1[0], p2[0], p3[0]), y: cr(p0[1], p1[1], p2[1], p3[1]) };
}
function nearestMs(p) {
    let best = 0, bd = Infinity;
    for (let k = 0; k < 400; k++) {
        const ms = LOOP_MS * k / 400, q = loopPoint(ms), d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < bd) { bd = d; best = ms; }
    }
    return best;
}

function makeCourt(svg, onMove, start) {
    const zones = drawCourt(svg);
    let pos = { x: start[0], y: start[1] };
    const wedge = el('path', { fill: 'rgba(255,255,255,.38)', stroke: '#ffffff', 'stroke-width': 0.05 }, svg);
    const halo = el('circle', { r: 1.1, fill: 'rgba(255,255,255,.18)' }, svg);
    const pulse = el('circle', { r: 0.9, fill: 'none', stroke: '#ffffff', 'stroke-width': 0.12, class: 'gv-pulse' }, svg);
    const dot = el('circle', { r: 0.55, fill: '#ffffff', stroke: '#1a1a1a', 'stroke-width': 0.1, style: 'cursor:grab' }, svg);
    const label = el('text', { 'font-size': 0.5, fill: '#ffffff', stroke: '#1a1a1a', 'stroke-width': 0.14, 'paint-order': 'stroke', 'text-anchor': 'middle', 'font-weight': 700, style: 'pointer-events:none' }, svg);
    label.textContent = 'シューター';
    const hint = el('g', { style: 'pointer-events:none' }, svg);
    const callout = el('g', { class: 'gv-callout' }, hint);
    const bubble = el('g', {}, callout);
    el('path', { d: 'M 0 0 L 0.5 -0.35 L 0.5 0.35 Z', fill: '#1a1a1a' }, bubble);
    el('rect', { x: 0.45, y: -0.65, width: 4.1, height: 1.3, rx: 0.35, fill: '#1a1a1a' }, bubble);
    const hintText = el('text', { x: 2.5, y: 0.2, 'font-size': 0.6, 'font-weight': 700, fill: '#fff', 'text-anchor': 'middle' }, callout);
    hintText.textContent = '動かしてみて';
    function render() {
        const key = zoneKey(pos.x, pos.y);
        for (const k in zones) zones[k].setAttribute('opacity', k === key ? 1 : 0.4);
        wedge.setAttribute('d', `M ${pos.x} ${pos.y} L -1.5 0 L 1.5 0 Z`);
        halo.setAttribute('cx', pos.x); halo.setAttribute('cy', pos.y);
        dot.setAttribute('cx', pos.x); dot.setAttribute('cy', pos.y);
        pulse.setAttribute('cx', pos.x); pulse.setAttribute('cy', pos.y);
        label.setAttribute('x', pos.x); label.setAttribute('y', pos.y + 1.2);
        const flip = pos.x > 3.5;
        hint.setAttribute('transform', `translate(${pos.x + (flip ? -0.75 : 0.75)} ${pos.y})`);
        bubble.setAttribute('transform', flip ? 'scale(-1 1)' : '');
        hintText.setAttribute('x', flip ? -2.5 : 2.5);
        onMove(pos.x, pos.y);
    }
    function toLocal(ev) {
        const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        return { x: Math.max(-9.2, Math.min(9.2, p.x)), y: Math.max(0.4, Math.min(10.2, p.y)) };
    }

    let auto = null, raf = 0, resumeTimer = 0, visible = true, dragging = false, lastFrame = 0;
    function frame(now) {
        if (!auto) return;
        raf = requestAnimationFrame(frame);
        if (now - lastFrame < FRAME) return;
        lastFrame = now;
        const target = loopPoint(now - auto.startedAt + auto.offset);
        const k = Math.min(1, (now - auto.startedAt) / BLEND), e = 1 - (1 - k) * (1 - k);
        pos = { x: auto.from.x + (target.x - auto.from.x) * e, y: auto.from.y + (target.y - auto.from.y) * e };
        render();
    }
    function startAuto() {
        clearTimeout(resumeTimer); resumeTimer = 0;
        if (REDUCED || dragging || !visible) return;
        cancelAnimationFrame(raf);
        auto = { from: { x: pos.x, y: pos.y }, startedAt: performance.now(), offset: nearestMs(pos) };
        raf = requestAnimationFrame(frame);
    }
    function stopAuto() { cancelAnimationFrame(raf); auto = null; clearTimeout(resumeTimer); }
    function touched() { hint.remove(); pulse.remove(); }
    svg.addEventListener('pointerdown', ev => { dragging = true; stopAuto(); svg.setPointerCapture(ev.pointerId); pos = toLocal(ev); touched(); render(); });
    svg.addEventListener('pointermove', ev => { if (!dragging) return; pos = toLocal(ev); render(); });
    function released() { dragging = false; clearTimeout(resumeTimer); resumeTimer = setTimeout(startAuto, IDLE_RESUME); }
    svg.addEventListener('pointerup', released);
    svg.addEventListener('pointercancel', released);
    new IntersectionObserver(([en]) => {
        visible = en.isIntersecting;
        if (!visible) { cancelAnimationFrame(raf); auto = null; }
        else if (!dragging && !resumeTimer) startAuto();
    }, { threshold: 0.2 }).observe(svg);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && auto) startAuto(); });
    render();
    startAuto();
}

const VW = 600, VH = 300, FOCAL = (VW / 2) / Math.tan(30 * Math.PI / 180), NEAR = 0.15;

function camera(E, G) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const f = norm(sub(G, E)), r = norm(cross([0, 0, 1], f)), u = cross(f, r);
    const toCam = P => { const d = sub(P, E); return [dot(d, r), dot(d, u), dot(d, f)]; };
    const proj = c => [VW / 2 + FOCAL * c[0] / c[2], VH * 0.56 - FOCAL * c[1] / c[2]];
    return { toCam, proj, point: P => { const c = toCam(P); return c[2] < NEAR ? null : proj(c); } };
}

function clipNear(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const ain = a[2] >= NEAR, bin = b[2] >= NEAR;
        if (ain) out.push(a);
        if (ain !== bin) {
            const t = (NEAR - a[2]) / (b[2] - a[2]);
            out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
        }
    }
    return out;
}

function poly3D(svg, cam, pts3, attrs) {
    const c = clipNear(pts3.map(cam.toCam));
    if (c.length < 3) return null;
    return el('polygon', Object.assign({ points: c.map(p => cam.proj(p).join(',')).join(' ') }, attrs), svg);
}

function path3D(svg, cam, pts3, attrs) {
    const runs = []; let cur = [];
    for (const P of pts3) { const q = cam.point(P); if (q) cur.push(q.join(',')); else { if (cur.length > 1) runs.push(cur); cur = []; } }
    if (cur.length > 1) runs.push(cur);
    for (const run of runs) el('polyline', Object.assign({ points: run.join(' '), fill: 'none' }, attrs), svg);
}

function arcPts(rad, n = 60) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (t < 0.4) { const a = Math.PI / 2 + (Math.PI / 2) * (1 - t / 0.4); pts.push([-1.5 + rad * Math.cos(a), rad * Math.sin(a), 0]); }
        else if (t < 0.6) pts.push([-1.5 + 3 * ((t - 0.4) / 0.2), rad, 0]);
        else { const a = Math.PI / 2 - (Math.PI / 2) * ((t - 0.6) / 0.4); pts.push([1.5 + rad * Math.cos(a), rad * Math.sin(a), 0]); }
    }
    return pts;
}

function stripedBar(svg, cam, A, B, n, radius, firstRed) {
    for (let i = 0; i < n; i++) {
        const P = [A[0] + (B[0] - A[0]) * i / n, A[1] + (B[1] - A[1]) * i / n, A[2] + (B[2] - A[2]) * i / n];
        const Q = [A[0] + (B[0] - A[0]) * (i + 1) / n, A[1] + (B[1] - A[1]) * (i + 1) / n, A[2] + (B[2] - A[2]) * (i + 1) / n];
        const p = cam.toCam(P), q = cam.toCam(Q);
        if (p[2] < NEAR || q[2] < NEAR) continue;
        const [x1, y1] = cam.proj(p), [x2, y2] = cam.proj(q);
        const w = Math.max(2, FOCAL * 2 * radius / ((p[2] + q[2]) / 2));
        const red = firstRed ? i % 2 === 0 : i % 2 === 1;
        el('line', { x1, y1, x2, y2, stroke: red ? '#d7263d' : '#ffffff', 'stroke-width': w, 'stroke-linecap': 'butt' }, svg);
    }
}

function drawView(svg, x, y) {
    svg.innerHTML = '';
    const E = [x, y, EYE], G = [0, 0, 1.0];
    const cam = camera(E, G);
    const defs = el('defs', {}, svg);
    const grad = el('linearGradient', { id: 'gvWall', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0', 'stop-color': '#17283d' }, grad);
    el('stop', { offset: '1', 'stop-color': '#2b4a6e' }, grad);

    el('rect', { x: 0, y: 0, width: VW, height: VH, fill: 'url(#gvWall)' }, svg);
    poly3D(svg, cam, [[-80, -30, 0], [80, -30, 0], [80, 80, 0], [-80, 80, 0]], { fill: '#4f86c0' });
    poly3D(svg, cam, [[-80, -30, 0], [80, -30, 0], [80, 0, 0], [-80, 0, 0]], { fill: '#2b5a8a' });
    poly3D(svg, cam, arcPts(6), { fill: '#f2a33a' });
    const key = zoneKey(x, y);
    if (key) poly3D(svg, cam, zonePoints(key).map(p => [p[0], p[1], 0]), { fill: ZONE_FILL, stroke: ZONE_STROKE, 'stroke-width': 1.5, 'stroke-linejoin': 'round' });
    path3D(svg, cam, arcPts(6), { stroke: '#ffffff', 'stroke-width': 2.5 });
    path3D(svg, cam, arcPts(9), { stroke: '#ffffff', 'stroke-width': 2.5, 'stroke-dasharray': '6 6' });
    path3D(svg, cam, [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [5, 0, 0], [10, 0, 0]], { stroke: '#ffffff', 'stroke-width': 2.5 });
    path3D(svg, cam, [[-10, 0, 0], [-10, 5, 0], [-10, 10, 0], [-10, 20, 0]], { stroke: '#ffffff', 'stroke-width': 2.5 });
    path3D(svg, cam, [[10, 0, 0], [10, 5, 0], [10, 10, 0], [10, 20, 0]], { stroke: '#ffffff', 'stroke-width': 2.5 });

    const zone = zoneOf(x, y), rate = zone ? RATE[zone] : null;
    const label = el('text', { x: 16, y: 27, 'font-size': 15, fill: '#ffffff' }, svg);
    el('tspan', { 'fill-opacity': 0.85 }, label).textContent = 'この';
    el('tspan', { fill: rate === null ? '#ffffff' : ZONE_LABEL, 'font-weight': 700 }, label).textContent = 'ゾーン';
    el('tspan', { 'fill-opacity': 0.85 }, label).textContent = 'からの決定率';
    el('text', { x: 16, y: 64, 'font-size': 36, 'font-weight': 700, fill: '#ffffff' }, svg).textContent = rate === null ? '—' : rate.toFixed(1) + '%';
    if (rate === null) el('text', { x: 16, y: 84, 'font-size': 12, fill: '#ffffff', opacity: 0.75 }, svg).textContent = 'ここからはほとんど打たない';

    stripedBar(svg, cam, [-1.5, 0, 0], [-1.5, 0, 2], 10, 0.04, false);
    stripedBar(svg, cam, [1.5, 0, 0], [1.5, 0, 2], 10, 0.04, false);
    stripedBar(svg, cam, [-1.5, 0, 2], [1.5, 0, 2], 15, 0.04, true);
}

const viewSvg = document.getElementById('gvView');
if (viewSvg) makeCourt(document.getElementById('gvCourt'), (x, y) => drawView(viewSvg, x, y), [LOOP[0][0], LOOP[0][1]]);

export { el, drawCourt, zoneOf, RATE };
