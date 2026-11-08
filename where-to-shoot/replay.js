import { el, drawCourt, zoneOf, RATE } from './goal-view.js';

const DIM = 'rgba(10,20,40,.62)';

export function createReplay(svg, def) {
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ATTACK = def.attack, DEFENSE = def.defense, DEPTH = def.court.depth;
    const W = 21, H = DEPTH + 0.5;

    let memo = {};
    function frame(name) {
        if (memo[name]) return memo[name];
        const f = def.frames[name];
        if (!f) throw new Error(`frame が無い: ${name}`);
        const base = f.from ? frame(f.from) : {};
        const out = {};
        for (const id in base) out[id] = base[id].slice();
        for (const id in f.pos) out[id] = f.pos[id].slice();
        return (memo[name] = out);
    }
    function point(ref) {
        if (Array.isArray(ref)) return ref;
        if (ref.includes('.')) {
            const [fn, id] = ref.split('.'), p = frame(fn)[id];
            if (!p) throw new Error(`point が無い: ${ref}`);
            return p;
        }
        if (!def.points[ref]) throw new Error(`point が無い: ${ref}`);
        return def.points[ref];
    }
    const posOf = st => st.pos || frame(st.frame);

    drawCourt(svg, DEPTH);
    const wedgeEl = el('path', { fill: 'rgba(255,255,255,.38)', stroke: '#ffffff', 'stroke-width': 0.05, style: 'display:none; pointer-events:none' }, svg);
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
    const maskId = `${svg.id}SpotMask`;
    const spotHoles = el('mask', { id: maskId }, el('defs', {}, svg));
    el('rect', { x: -10.5, y: -0.5, width: W, height: H, fill: '#ffffff' }, spotHoles);
    const spot = el('g', { class: 'six-spot', style: 'display:none' }, svg);
    const spotMask = el('rect', { x: -10.5, y: -0.5, width: W, height: H, fill: DIM, mask: `url(#${maskId})` }, spot);
    const spotText = el('text', { x: 0, 'font-size': 0.8, 'font-weight': 700, fill: '#ffffff', 'text-anchor': 'middle', style: 'pointer-events:none' }, spot);
    const spotHint = el('text', { x: 0, y: 4.6, 'font-size': 0.45, fill: '#ffffff', opacity: 0.8, 'text-anchor': 'middle', style: 'pointer-events:none' }, spot);
    spotHint.textContent = def.spotHint;
    const pick = el('text', { x: 0, y: 2.9, 'font-size': 0.72, 'font-weight': 700, fill: '#243a5e', 'text-anchor': 'middle', style: 'display:none; pointer-events:none' }, svg);
    pick.textContent = def.pickText;

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
        spotMask.setAttribute('fill', sp.color || DIM);
        const y0 = 2.4 + (2 - sp.lines.length) * 0.5;
        spotText.innerHTML = '';
        sp.lines.forEach((line, i) => { const t = el('tspan', { x: sp.x || 0, y: y0 + i * 1.0 }, spotText); t.textContent = line; });
        spotHint.setAttribute('x', sp.x || 0);
        spotHint.setAttribute('y', y0 + (sp.lines.length - 1) * 1.0 + 1.2);
        spotHint.textContent = sp.hint || def.spotHint;
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
        const p = cur[a.at], q = point(a.to), pts = [p, ...(a.via || []).map(point), q];
        const unit = (s, t) => { const dx = t[0] - s[0], dy = t[1] - s[1], L = Math.hypot(dx, dy); return [dx / L, dy / L]; };
        const [sx, sy] = unit(pts[0], pts[1]), [ex, ey] = unit(pts[pts.length - 2], q);
        const line = pts.map((pt, i) => i === 0 ? [pt[0] + sx * 0.75, pt[1] + sy * 0.75] : i === pts.length - 1 ? [q[0] - ex * 1.0, q[1] - ey * 1.0] : pt);
        actLine.setAttribute('points', line.map(pt => pt.join(',')).join(' '));
        actHead.setAttribute('transform', `translate(${q[0] - ex * 0.7} ${q[1] - ey * 0.7}) rotate(${Math.atan2(ey, ex) * 180 / Math.PI})`);
        actGhost.setAttribute('cx', q[0]); actGhost.setAttribute('cy', q[1]);
        placeBubble(p, a.label, a.dir || ((sx > 0.6 || p[0] > 3) && p[1] + 2.2 <= DEPTH ? 'down' : p[0] > 3 ? 'left' : 'right'));
        actInner.classList.toggle('six-breathe', !tapped && !REDUCED);
        act.style.display = '';
        act.onclick = () => { tapped = true; actInner.classList.remove('six-breathe'); onClick(); };
    }

    const cur = {};
    let ball = [0, 0];
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

    function clear() {
        pick.style.display = 'none';
        act.style.display = 'none';
        act.onclick = null;
        passLine.style.display = 'none';
        spot.style.display = 'none';
        wedgeEl.style.display = 'none';
        for (const id of ATTACK) { nodes[id].ring.style.display = 'none'; nodes[id].g.classList.remove('six-pick'); nodes[id].g.onclick = null; }
    }
    function show(scene, ms, on = {}) {
        clear();
        const steps = scene.steps;
        let i = 0;
        function finish() {
            passLine.style.display = 'none';
            if (on.after) {
                on.after();
            } else if (scene.choose) {
                pick.style.display = '';
                for (const id of scene.choose) { nodes[id].ring.style.display = ''; nodes[id].g.classList.add('six-pick'); nodes[id].g.onclick = () => choose(id); }
            } else if (scene.action) {
                showAction(scene.action, on.onNext);
            }
        }
        function runStep() {
            if (i >= steps.length) return finish();
            const st = steps[i++], pos = posOf(st), sp = st.spot && ms ? st.spot : null;
            if (sp && !sp.after) showSpot(sp, pos);
            tween(pos, ballOf(st.ball, pos), ms * (st.ms || 1), () => {
                if (!sp) return runStep();
                if (sp.after) showSpot(sp, pos);
                armSpot(on.onTap || runStep);
            });
        }
        runStep();
    }
    let stage = 0;
    function goStep(i, ms = def.moveMs) {
        stage = i;
        show(def.scenes[i], ms, { onNext: () => goStep(i + 1) });
    }
    function choose(id) {
        const sc = def.scenes[stage], last = sc.steps[sc.steps.length - 1], lastPos = posOf(last), o = sc.outcomes[id];
        const pos = Object.assign({}, o.frame ? frame(o.frame) : lastPos), from = ball.slice(), to = pos[id];
        let b = ballOf(id, pos);
        if (o.cut) {
            const d = cur[o.cut], vx = to[0] - from[0], vy = to[1] - from[1], L = Math.hypot(vx, vy);
            const t = o.t || Math.max(0.1, Math.min(0.8, ((d[0] - from[0]) * vx + (d[1] - from[1]) * vy) / (L * L)));
            pos[o.cut] = [from[0] + vx * t, from[1] + vy * t];
            b = [pos[o.cut][0] - vx / L * 0.85, pos[o.cut][1] - vy / L * 0.85];
            const sp = { around: [o.cut], lines: o.lines || def.cutSpot.lines, color: def.cutSpot.color, hint: def.cutSpot.hint, after: true };
            show({ steps: [{ pos, ball: b, spot: sp }] }, def.moveMs, { onTap: () => tween(lastPos, ballOf(last.ball, lastPos), def.backMs, () => goStep(stage, 0)) });
        } else if (o.shoot) {
            show({ steps: [{ pos, ball: b }] }, def.moveMs, { after: () => shoot(id, o.shoot) });
        } else {
            show({ steps: [{ pos, ball: b }], action: o.action }, def.moveMs, { onNext: () => goStep(stage + 1) });
        }
        passLine.setAttribute('x1', from[0]); passLine.setAttribute('y1', from[1]);
        passLine.setAttribute('x2', to[0]); passLine.setAttribute('y2', to[1]);
        passLine.style.display = '';
    }

    function shoot(id, s) {
        spot.style.display = 'none';
        passLine.style.display = 'none';
        const at = point(s.from), goal = point(s.to);
        const pos = Object.assign({}, cur, { [id]: at });
        tween(pos, ballOf(id, pos), s.jumpMs, () => {
            wedgeEl.setAttribute('d', `M ${at[0]} ${at[1]} L -1.5 0 L 1.5 0 Z`);
            wedgeEl.style.display = '';
            tween(pos, goal, s.ballMs, () => {
                const rate = RATE[zoneOf(at[0], at[1])];
                const lines = rate === undefined ? s.spot.lines.filter(l => !l.includes('{rate}')) : s.spot.lines.map(l => l.replace('{rate}', rate.toFixed(1)));
                showSpot(Object.assign({}, s.spot, { around: [id], lines }), pos);
                armSpot(() => goStep(0, 0));
            });
        });
    }

    function place(pos, holder) {
        for (const id in pos) cur[id] = pos[id].slice();
        ball = ballOf(holder, cur);
        render();
    }
    function start(i = 0) {
        cancelAnimationFrame(anim);
        memo = {};
        const st = def.scenes[i].steps[0];
        place(posOf(st), st.ball);
        goStep(i, 0);
    }
    function stop() {
        cancelAnimationFrame(anim);
        clear();
        spot.onclick = null;
    }
    function invalidate() { memo = {}; }

    return { def, nodes, frame, point, place, start, stop, invalidate };
}
