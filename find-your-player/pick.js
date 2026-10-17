// 推しを見つけるページの選び方（handball-project#614）。画面は finder.js が描き、ここは答えから選手を選ぶだけ。
// 画面に触らないので、テストがそのまま読み込んで呼ぶ。
//
// - **成績は前季を使う。** 今季は始まったばかりで試合数が少ない。前季の成績が無い選手（新加入など）は、
//   ポジションと年齢だけで選ばれる
// - **選ぶのは「好きなプレー」と「応援したくなる型」の両方に当たる選手から。** 3 人に満たなければ、
//   「好きなプレー」だけに当たる選手で埋める。同じ段の中では別のチームの選手を先に選び、毎回同じ 3 人にならないよう
//   くじで選ぶ
// - **会場で見たい人は、住んでいる県から近いチームの選手から選ぶ。** 近さは県庁どうしの直線距離。
//   近い順にチームを足していき、「好きなプレー」に当たる選手が 3 人そろったところで止める。「応援したくなる型」に
//   当たる選手が足りなくても、遠いチームまでは探さない（行きやすい会場の選手を出すほうを取った）
// - 年齢は開いた日に生年月日から出す（データには生年月日だけがある）

export const POSITIONS = {
    GK: { name: "ゴールキーパー", plain: "ゴールの前で、相手のシュートを止める人" },
    LW: { name: "レフトウイング", plain: "コートの端から、角度のないシュートを決める人" },
    RW: { name: "ライトウイング", plain: "コートの端から、角度のないシュートを決める人" },
    LB: { name: "レフトバック", plain: "遠くから、思い切りよくシュートを打つ人" },
    RB: { name: "ライトバック", plain: "遠くから、思い切りよくシュートを打つ人" },
    CB: { name: "センターバック", plain: "攻めを組み立てる、チームの司令塔" },
    PV: { name: "ポスト", plain: "相手の守りの中に入り、体を張って競り合う人" },
};

// 都道府県庁の所在地（緯度・経度）。会場で見たい人の「近いチーム」を、県庁どうしの直線距離で決める
export const PREFECTURES = [
    ["北海道", 43.064, 141.347], ["青森県", 40.824, 140.740], ["岩手県", 39.704, 141.153], ["宮城県", 38.269, 140.872],
    ["秋田県", 39.719, 140.102], ["山形県", 38.240, 140.364], ["福島県", 37.750, 140.468], ["茨城県", 36.342, 140.447],
    ["栃木県", 36.566, 139.884], ["群馬県", 36.391, 139.061], ["埼玉県", 35.857, 139.649], ["千葉県", 35.605, 140.123],
    ["東京都", 35.690, 139.692], ["神奈川県", 35.448, 139.642], ["新潟県", 37.902, 139.023], ["富山県", 36.695, 137.211],
    ["石川県", 36.594, 136.626], ["福井県", 36.065, 136.222], ["山梨県", 35.664, 138.568], ["長野県", 36.651, 138.181],
    ["岐阜県", 35.391, 136.722], ["静岡県", 34.977, 138.383], ["愛知県", 35.180, 136.907], ["三重県", 34.730, 136.509],
    ["滋賀県", 35.004, 135.869], ["京都府", 35.021, 135.756], ["大阪府", 34.686, 135.520], ["兵庫県", 34.691, 135.183],
    ["奈良県", 34.685, 135.833], ["和歌山県", 34.226, 135.168], ["鳥取県", 35.504, 134.238], ["島根県", 35.472, 133.051],
    ["岡山県", 34.662, 133.935], ["広島県", 34.397, 132.460], ["山口県", 34.186, 131.471], ["徳島県", 34.066, 134.559],
    ["香川県", 34.340, 134.043], ["愛媛県", 33.842, 132.766], ["高知県", 33.560, 133.531], ["福岡県", 33.606, 130.418],
    ["佐賀県", 33.249, 130.299], ["長崎県", 32.745, 129.874], ["熊本県", 32.790, 130.742], ["大分県", 33.238, 131.613],
    ["宮崎県", 31.911, 131.424], ["鹿児島県", 31.560, 130.558], ["沖縄県", 26.212, 127.681],
];

const PLACES = new Map(PREFECTURES.map(([name, lat, lon]) => [name, { lat, lon }]));

// 2 つの県の県庁どうしの直線距離（km）。知らない県は null
export function distanceKm(a, b) {
    const p = PLACES.get(a);
    const q = PLACES.get(b);
    if (!p || !q) return null;
    const rad = (deg) => (deg * Math.PI) / 180;
    const h = Math.sin(rad(q.lat - p.lat) / 2) ** 2
        + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(rad(q.lon - p.lon) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// 生年月日（YYYY-MM-DD）から、その日の満年齢
export function ageOn(birthDate, today) {
    const [y, m, d] = birthDate.split("-").map(Number);
    let age = today.getFullYear() - y;
    if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
    return age;
}

// ── 質問 ────────────────────────────────────────────────────

// 「好きなプレー」の選択肢 → 当てはまる選手。経験で 2 系統に分ける（どちらもない人には日常の言葉で聞く）
export const STYLES = {
    small: (p) => p.small,
    power: (p) => p.position === "PV",
    long: (p) => p.position === "LB" || p.position === "RB",
    keeper: (p) => p.position === "GK",
    wing: (p) => p.position === "LW" || p.position === "RW",
    back: (p) => p.position === "LB" || p.position === "RB",
    pivot: (p) => p.position === "PV",
    center: (p) => p.position === "CB",
    seven: (p) => (p.prev?.goals7m ?? 0) > 0,
};

export const YOUNG_MAX = 23;
export const VETERAN_MIN = 30;

// 「応援したくなる型」の選択肢 → 当てはまる選手
export const CHEERS = {
    ace: (p) => p.teamRank !== null,
    craft: (p) => p.craft,
    young: (p) => p.age <= YOUNG_MAX,
    veteran: (p) => p.age >= VETERAN_MIN,
};

// ── 選手の下ごしらえ ────────────────────────────────────────

// エースは今のチームで前季の得点が 3 番目まで（GK は今のチームの GK で阻止数がいちばん）
const ACE_FIELD_RANK = 3;
// 職人は前季に 30 本以上打った（GK は受けた）選手のうち、率が上半分
const CRAFT_MIN_SHOTS = 30;

// 前季の行を足し合わせる（季の途中で移籍した選手は 2 行ある）。シュート数は「得点 ÷ 率」から戻す
function previousStats(player, season) {
    const rows = player.stats.filter((s) => s.season === season && s.games > 0);
    if (rows.length === 0) return null;
    const sum = { games: 0, goals: 0, fieldGoals: 0, goals7m: 0, saves: 0, shots: 0, faced: 0 };
    for (const s of rows) {
        sum.games += s.games;
        sum.goals += s.goals;
        sum.fieldGoals += s.fieldGoals;
        sum.goals7m += s.goals7m;
        sum.saves += s.saves;
        if (s.shotRate) sum.shots += Math.round(s.fieldGoals / s.shotRate);
        if (s.saveRate) sum.faced += Math.round(s.saves / s.saveRate);
    }
    return sum;
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 上から 1/4 に入る下限（同じ値は同じ側に入れる）
function topQuarterFloor(values) {
    const sorted = [...values].sort((a, b) => b - a);
    if (sorted.length === 0) return null;
    return sorted[Math.max(0, Math.ceil(sorted.length / 4) - 1)];
}

// data は players.json。today は年齢を出す日
export function prepare(data, today) {
    const teams = new Map(data.teams.map((t) => [t.id, t]));
    const players = data.players
        .filter((p) => teams.has(p.team))
        .map((p) => {
            const team = teams.get(p.team);
            return {
                ...p,
                gender: team.gender,
                teamName: team.name,
                teamPrefecture: team.prefecture,
                scheduleUrl: team.scheduleUrl,
                age: ageOn(p.birthDate, today),
                prev: previousStats(p, data.previousSeason),
                small: false,
                craft: false,
                teamRank: null,
            };
        });

    for (const gender of ["men", "women"]) {
        const group = players.filter((p) => p.gender === gender);
        const field = group.filter((p) => p.position !== "GK");
        const keepers = group.filter((p) => p.position === "GK");

        // 小さい人が大きい相手をかわして決める: 前季の得点が上位 1/4 で、同じポジションの中央値より背が低い
        const goalsFloor = topQuarterFloor(field.filter((p) => p.prev).map((p) => p.prev.goals));
        for (const position of Object.keys(POSITIONS)) {
            const same = group.filter((p) => p.position === position && Number.isFinite(p.height));
            const middle = median(same.map((p) => p.height));
            for (const p of same) {
                if (position !== "GK" && p.prev && p.prev.goals >= goalsFloor && p.height < middle) p.small = true;
            }
        }

        // 職人: 前季 30 本以上で、率が上半分
        const shooters = field.filter((p) => p.prev && p.prev.shots >= CRAFT_MIN_SHOTS);
        const shotMiddle = median(shooters.map((p) => p.prev.fieldGoals / p.prev.shots));
        for (const p of shooters) if (p.prev.fieldGoals / p.prev.shots >= shotMiddle) p.craft = true;
        const savers = keepers.filter((p) => p.prev && p.prev.faced >= CRAFT_MIN_SHOTS);
        const saveMiddle = median(savers.map((p) => p.prev.saves / p.prev.faced));
        for (const p of savers) if (p.prev.saves / p.prev.faced >= saveMiddle) p.craft = true;
    }

    // エース: 今のチームの中での前季の順位（同じ数は同じ順位）
    for (const teamId of teams.keys()) {
        const mates = players.filter((p) => p.team === teamId && p.prev);
        const rank = (list, value) => (p) => 1 + list.filter((q) => value(q) > value(p)).length;
        const field = mates.filter((p) => p.position !== "GK" && p.prev.goals > 0);
        const fieldRank = rank(field, (p) => p.prev.goals);
        for (const p of field) {
            const r = fieldRank(p);
            if (r <= ACE_FIELD_RANK) p.teamRank = r;
        }
        const keepers = mates.filter((p) => p.position === "GK" && p.prev.saves > 0);
        const keeperRank = rank(keepers, (p) => p.prev.saves);
        for (const p of keepers) if (keeperRank(p) === 1) p.teamRank = 1;
    }

    return { season: data.season, previousSeason: data.previousSeason, teams, players };
}

// ── 選ぶ ────────────────────────────────────────────────────

export const PICK_COUNT = 3;

// answers: { experience, style, cheer, gender: "men" | "women" | "any", watch, prefecture?, position?, hand? }
function candidates(prepared, answers, exclude) {
    const style = STYLES[answers.style];
    const pool = prepared.players.filter((p) => (answers.gender === "any" || p.gender === answers.gender) && !exclude.has(p.id));
    if (answers.watch !== "venue" || !answers.prefecture) return pool;

    // 近い順にチームを足し、「好きなプレー」に当たる選手が 3 人そろったところで止める。同じ県のチームは同じ近さ
    const byTeam = new Map();
    for (const p of pool) {
        if (!byTeam.has(p.team)) byTeam.set(p.team, []);
        byTeam.get(p.team).push(p);
    }
    const distance = (teamId) => distanceKm(answers.prefecture, byTeam.get(teamId)[0].teamPrefecture) ?? Infinity;
    const order = [...byTeam.keys()].sort((a, b) => distance(a) - distance(b));
    const near = [];
    let matched = 0;
    for (let i = 0; i < order.length; i++) {
        near.push(...byTeam.get(order[i]));
        matched += byTeam.get(order[i]).filter(style).length;
        const tied = i + 1 < order.length && distance(order[i + 1]) === distance(order[i]);
        if (matched >= PICK_COUNT && !tied) break;
    }
    return near;
}

// 段（両方に当たる → プレーだけ → 残り）の中で、まだ選んでいないチームの選手を先に、くじで選ぶ
function draw(list, reason, chosen, random) {
    const rest = [...list];
    while (chosen.length < PICK_COUNT && rest.length > 0) {
        const used = new Set(chosen.map((c) => c.player.team));
        const fresh = rest.filter((p) => !used.has(p.team));
        const from = fresh.length > 0 ? fresh : rest;
        const player = from[Math.floor(random() * from.length)];
        rest.splice(rest.indexOf(player), 1);
        chosen.push({ player, ...reason });
    }
}

// 3 人を返す。それぞれに、どちらの問いに当たったか（style・cheer）を付ける。
// exclude は選ばない選手の番号（「ほかの 3 人」で、もう見せた選手を外す）
export function choose(prepared, answers, { random = Math.random, exclude = new Set() } = {}) {
    const style = STYLES[answers.style];
    const cheer = CHEERS[answers.cheer];
    const pool = candidates(prepared, answers, exclude);
    const both = pool.filter((p) => style(p) && cheer(p));
    const styleOnly = pool.filter((p) => style(p) && !cheer(p));
    const others = pool.filter((p) => !style(p));
    const chosen = [];
    draw(both, { style: true, cheer: true }, chosen, random);
    draw(styleOnly, { style: true, cheer: false }, chosen, random);
    draw(others, { style: false, cheer: false }, chosen, random);
    return chosen;
}

// ── 見せる ──────────────────────────────────────────────────

function percent(rate) {
    return `${Math.round(rate * 1000) / 10}%`;
}

// 「ここを見て」の一文。当たった問いの理由を先に出し、無ければ前季の成績、成績が無ければ経歴から作る。
// 若手・ベテランに当たったときは、どの文にも年齢を頭に付ける
export function highlight(pick, answers) {
    const p = pick.player;
    const keeper = p.position === "GK";
    const age = pick.cheer && (answers.cheer === "young" || answers.cheer === "veteran") ? `${p.age} 歳。` : "";
    if (p.prev) {
        if (pick.cheer && answers.cheer === "ace") {
            return keeper
                ? `前季の阻止数は、今のチームの GK でいちばん（${p.prev.saves} 本）`
                : `前季の得点は、今のチームで${p.teamRank === 1 ? "いちばん" : ` ${p.teamRank} 番目`}（${p.prev.goals} 点）`;
        }
        if (pick.cheer && answers.cheer === "craft") {
            return keeper
                ? `前季の阻止率 ${percent(p.prev.saves / p.prev.faced)}（${p.prev.faced} 本中 ${p.prev.saves} 本を止めた）`
                : `前季のシュート率 ${percent(p.prev.fieldGoals / p.prev.shots)}（${p.prev.shots} 本中 ${p.prev.fieldGoals} 本）`;
        }
        if (pick.style && answers.style === "small") return `${age}身長 ${p.height}cm で、前季 ${p.prev.goals} 点`;
        if (pick.style && answers.style === "seven") return `${age}前季の 7m スローで ${p.prev.goals7m} 点`;
    }
    if (!p.prev) {
        const last = p.career.at(-1);
        return last ? `${age}前の所属は${last}。リーグH での成績はこれから` : `${age}リーグH での成績はこれから`;
    }
    if (keeper && p.prev.faced > 0) return `${age}前季 ${p.prev.games} 試合で、阻止率 ${percent(p.prev.saves / p.prev.faced)}`;
    return `${age}前季 ${p.prev.games} 試合で ${p.prev.goals} 点`;
}

// あなたとの共通点（あれば 1 行）。点には入れず、知るきっかけとして添えるだけ
export function commonPoints(player, answers) {
    const points = [];
    if (answers.prefecture && player.birthplace === answers.prefecture) points.push(`あなたの住む${answers.prefecture}の出身`);
    // 右利きは 8 割なので、同じでもきっかけにならない。左利きだけを添える
    const same = [];
    if (answers.position && player.position === answers.position) same.push(answers.position);
    if (answers.hand === "left" && player.hand === "left") same.push("左利き");
    if (same.length > 0) points.push(`あなたと同じ ${same.join("・")}`);
    return points.length > 0 ? points.join("。") : null;
}
