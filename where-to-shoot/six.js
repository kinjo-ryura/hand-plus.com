import { el, drawCourt, zoneOf, RATE } from './goal-view.js';

const svg = document.getElementById('sixCourt');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

drawCourt(svg, 12);
const wedgeEl = el('path', { fill: 'rgba(255,255,255,.38)', stroke: '#ffffff', 'stroke-width': 0.05, style: 'display:none; pointer-events:none' }, svg);
const JUMP = [6.2, 3.0];

const ATTACK = ['LW', 'LB', 'CB', 'RB', 'RW', 'PV'];
const DEFENSE = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
const S0 = {
    LW: [-9.5, 0.6], LB: [-9.0, 10.0], CB: [0.5, 10.5], RB: [9.0, 10.0], RW: [9.5, 0.6], PV: [0.3, 6.3],
    D1: [-7.3, 3.1], D2: [-5.0, 5.6], D3: [-1.8, 6.6], D4: [1.8, 6.6], D5: [5.0, 5.6], D6: [7.3, 3.1],
};
const S1a = Object.assign({}, S0, { LB: [-6.5, 7.8] });
const S1 = Object.assign({}, S1a, { D2: [-5.6, 6.8] });
const FEINT_TO = [-3.6, 6.3];
const S2v = Object.assign({}, S1, { LB: [-4.8, 8.0] });
const S2a = Object.assign({}, S1, { LB: [-4.2, 7.15], D2: [-6.2, 7.4] });
const S2 = Object.assign({}, S2a, { D3: [-3.1, 6.2], PV: [-0.6, 6.3], D4: [0.2, 6.8], D5: [2.8, 7.2], D6: [7.2, 6.0], CB: [1.5, 10.5], RB: [9.3, 9.3] });
const S3 = Object.assign({}, S2, { D5: [2.6, 6.6] });
const GAP = [1.4, 7.1];
const S4 = Object.assign({}, S3, { CB: [1.5, 8.7], D5: [2.0, 7.3] });
const S5 = Object.assign({}, S4, { D6: [7.0, 5.4] });
const GAP2 = [5.8, 6.4];
const S6 = Object.assign({}, S5, { RB: [7.4, 7.7], D6: [6.5, 6.9] });

const SCENES = [
    { pos: S0, ball: 'LB', action: { at: 'LB', to: S1.LB, label: 'シュートを狙う' } },
    { steps: [{ pos: S1a, ball: 'LB' }, { pos: S1, ball: 'LB', spot: { around: ['LB', 'D2'], lines: ['シュートを防ぐために', '前に出てくる'] } }], action: { at: 'LB', via: [S2v.LB], to: FEINT_TO, label: 'フェイントで抜く' } },
    { steps: [{ pos: S2v, ball: 'LB', ms: 0.5 }, { pos: S2a, ball: 'LB', ms: 0.5 }, { pos: S2, ball: 'LB', spot: { around: ['LB', 'D3', 'D4', 'D5', 'D6'], lines: ['抜かれたディフェンスを', '助けにくる'] } }], choose: ['LW', 'PV', 'CB', 'RB', 'RW'], outcomes: {
        LW: { cut: 'D1' },
        PV: { cut: 'D4' },
        CB: { pos: S3, ball: 'CB', action: { at: 'CB', to: GAP, label: 'シュートを狙う', dir: 'left' } },
        RB: { cut: 'D6' },
        RW: { cut: 'D6', t: 0.78 },
    } },
    { steps: [{ pos: S4, ball: 'CB' }], choose: ['LW', 'LB', 'PV', 'RB', 'RW'], outcomes: {
        LW: { cut: 'D1', t: 0.85 },
        LB: { cut: 'D3' },
        PV: { cut: 'D4' },
        RB: { pos: S5, ball: 'RB', action: { at: 'RB', to: GAP2, label: 'シュートを狙う' } },
        RW: { cut: 'D6', t: 0.4 },
    } },
    { steps: [{ pos: S6, ball: 'RB' }], choose: ['LW', 'LB', 'PV', 'CB', 'RW'], outcomes: {
        LW: { cut: 'D1', t: 0.92 },
        LB: { cut: 'D4' },
        PV: { cut: 'D5' },
        CB: { cut: 'D5' },
        RW: { pos: S6, ball: 'RW', shoot: true },
    } },
];

const passLine = el('line', { stroke: '#f2a33a', 'stroke-width': 0.1, 'stroke-dasharray': '0.25 0.25', 'stroke-opacity': 0.9, style: 'display:none; pointer-events:none' }, svg);
const nodes = {};
for (const id of [...DEFENSE, ...ATTACK]) {
    const isA = ATTACK.includes(id);
    const g = el('g', { 'data-id': id }, svg);
    const ring = el('circle', { r: 0.9, fill: 'none', 'stroke-width': 0.14, class: 'gv-pulse', style: 'display:none; stroke: var(--accent)' }, g);
    el('circle', { r: 0.55, fill: isA ? '#ffffff' : '#243a5e', stroke: isA ? '#1a1a1a' : '#ffffff', 'stroke-width': 0.08 }, g);
    nodes[id] = { g, ring };
}
const ballEl = el('circle', { r: 0.3, fill: '#f2a33a', stroke: '#1a1a1a', 'stroke-width': 0.06, style: 'pointer-events:none' }, svg);
const act = el('g', { class: 'six-act', style: 'display:none' }, svg);
const actLine = el('polyline', { fill: 'none', 'stroke-width': 0.1, 'stroke-dasharray': '0.3 0.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'stroke: var(--accent)' }, act);
const actHead = el('path', { d: 'M 0 0 L -0.5 -0.3 L -0.5 0.3 Z', style: 'fill: var(--accent)' }, act);
const actGhost = el('circle', { r: 0.55, fill: 'rgba(255,255,255,.25)', 'stroke-width': 0.1, 'stroke-dasharray': '0.22 0.16', style: 'stroke: var(--accent)' }, act);
const actBubble = el('g', {}, act);
const actInner = el('g', {}, actBubble);
let tapped = false;
const actTail = el('path', { stroke: '#ffffff', 'stroke-width': 0.08, 'stroke-linejoin': 'round', style: 'fill: var(--accent)' }, actInner);
const actRect = el('rect', { height: 1.4, rx: 0.45, stroke: '#ffffff', 'stroke-width': 0.08, style: 'fill: var(--accent)' }, actInner);
const actTailIn = el('path', { style: 'fill: var(--accent)' }, actInner);
const actText = el('text', { 'font-size': 0.6, 'font-weight': 700, fill: '#fff', 'text-anchor': 'middle', style: 'pointer-events:none' }, actInner);
const spotHoles = el('mask', { id: 'sixSpotMask' }, el('defs', {}, svg));
el('rect', { x: -10.5, y: -0.5, width: 21, height: 12.5, fill: '#ffffff' }, spotHoles);
const spot = el('g', { class: 'six-spot', style: 'display:none' }, svg);
const spotMask = el('rect', { x: -10.5, y: -0.5, width: 21, height: 12.5, fill: 'rgba(10,20,40,.62)', mask: 'url(#sixSpotMask)' }, spot);
const spotText = el('text', { x: 0, 'font-size': 0.8, 'font-weight': 700, fill: '#ffffff', 'text-anchor': 'middle', style: 'pointer-events:none' }, spot);
const spotHint = el('text', { x: 0, y: 4.6, 'font-size': 0.45, fill: '#ffffff', opacity: 0.8, 'text-anchor': 'middle', style: 'pointer-events:none' }, spot);
spotHint.textContent = 'タップで続ける';
const pick = el('text', { x: 0, y: 2.9, 'font-size': 0.72, 'font-weight': 700, fill: '#243a5e', 'text-anchor': 'middle', style: 'display:none; pointer-events:none' }, svg);
pick.textContent = 'タップしてパスする相手を選ぼう';
function hull(pts) {
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (P.length < 3) return P;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of P.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
}
function showSpot(sp, target) {
    while (spotHoles.childNodes.length > 1) spotHoles.removeChild(spotHoles.lastChild);
    const pts = hull(sp.around.map(id => target[id]));
    const d = pts.map((q, i) => (i ? 'L' : 'M') + ' ' + q[0] + ' ' + q[1]).join(' ') + ' Z';
    el('path', { d, fill: '#000000', stroke: '#000000', 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, spotHoles);
    spotMask.setAttribute('fill', sp.color || 'rgba(10,20,40,.62)');
    const y0 = 2.4 + (2 - sp.lines.length) * 0.5;
    spotText.innerHTML = '';
    sp.lines.forEach((line, i) => { const t = el('tspan', { x: sp.x || 0, y: y0 + i * 1.0 }, spotText); t.textContent = line; });
    spotHint.setAttribute('x', sp.x || 0);
    spotHint.setAttribute('y', y0 + (sp.lines.length - 1) * 1.0 + 1.2);
    spotHint.textContent = sp.hint || 'タップで続ける';
    spotHint.style.display = 'none';
    spot.onclick = null;
    spot.style.display = '';
}
function armSpot(onTap) {
    spotHint.style.display = '';
    spot.onclick = () => { spot.style.display = 'none'; spot.onclick = null; onTap(); };
}
function placeBubble(p, label, dir) {
    const w = label.length * 0.62 + 1.0;
    actText.textContent = label;
    if (dir === 'down') {
        const shift = Math.min(0, 10.2 - (p[0] + w / 2)) + Math.max(0, -10.2 - (p[0] - w / 2));
        actTail.setAttribute('d', 'M 0 0 L -0.4 0.55 L 0.4 0.55 Z');
        actTailIn.setAttribute('d', 'M 0 0.05 L -0.33 0.55 L 0.33 0.55 Z');
        actRect.setAttribute('x', shift - w / 2); actRect.setAttribute('y', 0.45); actRect.setAttribute('width', w);
        actText.setAttribute('x', shift); actText.setAttribute('y', 1.35);
        actBubble.setAttribute('transform', `translate(${p[0]} ${p[1] + 0.75})`);
    } else if (dir === 'left') {
        actTail.setAttribute('d', 'M 0 0 L -0.55 -0.4 L -0.55 0.4 Z');
        actTailIn.setAttribute('d', 'M -0.05 0 L -0.55 -0.33 L -0.55 0.33 Z');
        actRect.setAttribute('x', -0.45 - w); actRect.setAttribute('y', -0.7); actRect.setAttribute('width', w);
        actText.setAttribute('x', -0.45 - w / 2); actText.setAttribute('y', 0.2);
        actBubble.setAttribute('transform', `translate(${p[0] - 0.75} ${p[1]})`);
    } else {
        actTail.setAttribute('d', 'M 0 0 L 0.55 -0.4 L 0.55 0.4 Z');
        actTailIn.setAttribute('d', 'M 0.05 0 L 0.55 -0.33 L 0.55 0.33 Z');
        actRect.setAttribute('x', 0.45); actRect.setAttribute('y', -0.7); actRect.setAttribute('width', w);
        actText.setAttribute('x', 0.45 + w / 2); actText.setAttribute('y', 0.2);
        actBubble.setAttribute('transform', `translate(${p[0] + 0.75} ${p[1]})`);
    }
}
function showAction(a, onClick) {
    const p = cur[a.at], q = a.to, pts = [p, ...(a.via || []), q];
    const unit = (s, t) => { const dx = t[0] - s[0], dy = t[1] - s[1], L = Math.hypot(dx, dy); return [dx / L, dy / L]; };
    const [sx, sy] = unit(pts[0], pts[1]), [ex, ey] = unit(pts[pts.length - 2], q);
    const line = pts.map((pt, i) => i === 0 ? [pt[0] + sx * 0.75, pt[1] + sy * 0.75] : i === pts.length - 1 ? [q[0] - ex * 1.0, q[1] - ey * 1.0] : pt);
    actLine.setAttribute('points', line.map(pt => pt.join(',')).join(' '));
    actHead.setAttribute('transform', `translate(${q[0] - ex * 0.7} ${q[1] - ey * 0.7}) rotate(${Math.atan2(ey, ex) * 180 / Math.PI})`);
    actGhost.setAttribute('cx', q[0]); actGhost.setAttribute('cy', q[1]);
    placeBubble(p, a.label, a.dir || ((sx > 0.6 || p[0] > 3) && p[1] + 2.2 <= 12 ? 'down' : p[0] > 3 ? 'left' : 'right'));
    actInner.classList.toggle('six-breathe', !tapped && !REDUCED);
    act.style.display = '';
    act.onclick = () => { tapped = true; actInner.classList.remove('six-breathe'); onClick(); };
}

const cur = {};
for (const id in S0) cur[id] = S0[id].slice();
let ball = ballOf('LB', cur);

function ballOf(holder, pos) {
    if (Array.isArray(holder)) return holder.slice();
    const p = pos[holder], side = p[0] < 0 ? -1 : 1;
    return [Math.max(-9.6, Math.min(9.6, p[0] + side * 0.45)), p[1] - 0.45];
}
function render() {
    for (const id in cur) nodes[id].g.setAttribute('transform', `translate(${cur[id][0]} ${cur[id][1]})`);
    ballEl.setAttribute('cx', ball[0]); ballEl.setAttribute('cy', ball[1]);
}

let anim = 0;
function tween(target, ballTarget, ms, done) {
    cancelAnimationFrame(anim);
    const from = {}; for (const id in cur) from[id] = cur[id].slice();
    const bFrom = ball.slice(), t0 = performance.now(), dur = REDUCED ? 0 : ms;
    function step(now) {
        const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        for (const id in cur) { const a = from[id], b = target[id]; cur[id] = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]; }
        ball = [bFrom[0] + (ballTarget[0] - bFrom[0]) * e, bFrom[1] + (ballTarget[1] - bFrom[1]) * e];
        render();
        if (k < 1) anim = requestAnimationFrame(step); else if (done) done();
    }
    anim = requestAnimationFrame(step);
}

function show(scene, ms = 1600) {
    pick.style.display = 'none';
    act.style.display = 'none';
    act.onclick = null;
    passLine.style.display = 'none';
    spot.style.display = 'none';
    wedgeEl.style.display = 'none';
    for (const id of ATTACK) { nodes[id].ring.style.display = 'none'; nodes[id].g.classList.remove('six-pick'); nodes[id].g.onclick = null; }
    const steps = scene.steps || [{ pos: scene.pos, ball: scene.ball }];
    let i = 0;
    function finish() {
        passLine.style.display = 'none';
        if (scene.after) {
            scene.after();
        } else if (scene.choose) {
            pick.style.display = '';
            for (const id of scene.choose) { nodes[id].ring.style.display = ''; nodes[id].g.classList.add('six-pick'); nodes[id].g.onclick = () => choose(id); }
        } else if (scene.action) {
            showAction(scene.action, scene.onNext);
        }
    }
    function runStep() {
        if (i >= steps.length) return finish();
        const st = steps[i++], sp = st.spot && ms ? st.spot : null;
        if (sp && !sp.after) showSpot(sp, st.pos);
        tween(st.pos, ballOf(st.ball, st.pos), ms * (st.ms || 1), () => {
            if (!sp) return runStep();
            if (sp.after) showSpot(sp, st.pos);
            armSpot(scene.onTap || runStep);
        });
    }
    runStep();
}
let stage = 0;
function goStep(i, ms) {
    const sc = SCENES[i];
    stage = i;
    sc.onNext = () => goStep(i + 1);
    show(sc, ms);
}
function choose(id) {
    const sc = SCENES[stage], last = sc.steps[sc.steps.length - 1], o = sc.outcomes[id];
    const pos = Object.assign({}, o.pos || last.pos), from = ball.slice(), to = pos[id];
    let b = ballOf(id, pos);
    if (o.cut) {
        const d = cur[o.cut], vx = to[0] - from[0], vy = to[1] - from[1], L = Math.hypot(vx, vy);
        const t = o.t || Math.max(0.1, Math.min(0.8, ((d[0] - from[0]) * vx + (d[1] - from[1]) * vy) / (L * L)));
        pos[o.cut] = [from[0] + vx * t, from[1] + vy * t];
        b = [pos[o.cut][0] - vx / L * 0.85, pos[o.cut][1] - vy / L * 0.85];
        const sp = { around: [o.cut], lines: o.t ? ['パスカットされてしまった', '遠いパスは戻られる'] : ['パスカットされてしまった'], color: 'rgba(180,24,40,.66)', hint: 'タップでパス前に戻る', after: true };
        show({ steps: [{ pos, ball: b, spot: sp }], onTap: () => tween(last.pos, ballOf(last.ball, last.pos), 1200, () => goStep(stage, 0)) });
    } else if (o.shoot) {
        show({ pos, ball: b, after: shoot });
    } else {
        show({ pos, ball: b, action: o.action, onNext: () => goStep(stage + 1) });
    }
    passLine.setAttribute('x1', from[0]); passLine.setAttribute('y1', from[1]);
    passLine.setAttribute('x2', to[0]); passLine.setAttribute('y2', to[1]);
    passLine.style.display = '';
}

function shoot() {
    spot.style.display = 'none';
    passLine.style.display = 'none';
    const pos = Object.assign({}, cur, { RW: JUMP });
    tween(pos, ballOf('RW', pos), 700, () => {
        wedgeEl.setAttribute('d', `M ${JUMP[0]} ${JUMP[1]} L -1.5 0 L 1.5 0 Z`);
        wedgeEl.style.display = '';
        tween(pos, [0.6, -0.05], 500, () => {
            const rate = RATE[zoneOf(JUMP[0], JUMP[1])];
            showSpot({ around: ['RW'], lines: ['パスを繋いで', 'シュートチャンスを作れた', `ここからの決定率は ${rate.toFixed(1)}%`], x: -1.2, color: 'rgba(16,130,70,.66)', hint: 'タップで最初から' }, pos);
            armSpot(() => goStep(0, 0));
        });
    });
}

render();
goStep(0, 0);
