// 推しを見つけるページの画面（handball-project#614）。1 問 1 画面で聞き、答えから 3 人を選んで見せる。
// 選び方は pick.js。選手のデータは隣の players.json を開いたときに読む。
//
// - **聞くのは「どんなプレーや選手に惹かれるか」。** 最初に経験を聞き、見たこと・したことのある人には
//   ハンドボールの言葉で、どちらも無い人には日常の言葉で聞く
// - **写真は載せない。** 公式の選手ページへのリンクで、写真と成績はそちらで見る
// - **結果を見た数と、選手ページ・試合日程のリンクを押した数を数える。** 送り先は掲示板の Worker
//   （data-finder-events）。送るのは何を見た・押したかと選手の番号だけで、答えも見た人を識別する情報も送らない
// - 前の問いに戻れる。答え直しても、送ったのは結果を見たときだけ
import { POSITIONS, PREFECTURES, choose, commonPoints, highlight, prepare } from "./pick.js";

const root = document.getElementById("finder");

const EVENTS = root?.dataset.finderEvents ? `${root.dataset.finderEvents}/find-your-player` : null;

// ── 質問 ────────────────────────────────────────────────────

const QUESTIONS = {
    experience: {
        title: "ハンドボールは？",
        options: [
            ["played", "プレーしたことがある"],
            ["watched", "見たことはある"],
            ["none", "どちらもない"],
        ],
    },
    // どちらもない人には、プレーの型を日常の言葉で聞く
    stylePlain: {
        key: "style",
        title: "見ていて気持ちいいのは？",
        options: [
            ["small", "小さい人が、大きい相手をかわして決める"],
            ["power", "力強くぶつかって、押し込む"],
            ["long", "遠くから、思い切りよく決める"],
            ["keeper", "最後の砦として、ゴールを守る"],
        ],
    },
    style: {
        title: "好きなプレーは？",
        options: [
            ["wing", "サイドから、角度のないシュート"],
            ["back", "9m の外からのロングシュート"],
            ["pivot", "ポストでの競り合い"],
            ["center", "試合を組み立てる"],
            ["seven", "7m スロー"],
            ["keeper", "GK のセーブ"],
        ],
    },
    cheer: {
        title: "応援したくなるのは？",
        options: [
            ["ace", "チームを引っ張るエース"],
            ["craft", "決めるべきところで外さない職人"],
            ["young", "これから伸びる若手"],
            ["veteran", "長く第一線で戦うベテラン"],
        ],
    },
    gender: {
        title: "見たいのは？",
        options: [
            ["men", "男子"],
            ["women", "女子"],
            ["any", "どちらでも"],
        ],
    },
    watch: {
        title: "試合はどうやって見たい？",
        options: [
            ["venue", "会場で見たい"],
            ["stream", "配信で見る"],
            ["unsure", "まだ分からない"],
        ],
    },
};

// 答えた分から、次に聞く問いの並びを決める（会場の人だけ県を、プレーしたことのある人だけ自分のことを聞く）
function steps(answers) {
    const list = ["experience", answers.experience === "none" ? "stylePlain" : "style", "cheer", "gender", "watch"];
    if (answers.watch === "venue") list.push("prefecture");
    if (answers.experience === "played") list.push("self");
    return list;
}

// ── 小さな部品 ──────────────────────────────────────────────

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === "class") node.className = value;
        else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
}

function select(name, label, choices) {
    return el("label", { class: "finder-field" },
        el("span", {}, label),
        el("select", { name }, ...choices.map(([value, text]) => el("option", { value }, text))));
}

// 結果を見た・リンクを押したことを数える。ページを離れても届くよう sendBeacon で送る（text/plain なので事前確認が要らない）
function count(kind, players) {
    if (!EVENTS || !navigator.sendBeacon) return;
    try {
        navigator.sendBeacon(EVENTS, new Blob([JSON.stringify({ kind, players })], { type: "text/plain" }));
    } catch {
        // 数えられなくても、ページは今までどおり使える
    }
}

// ── 画面 ────────────────────────────────────────────────────

let prepared = null;
let answers = {};
let at = 0;
// 「ほかの 3 人」で、同じ答えのまま見せた選手を続けて出さない
let shown = new Set();
// 開いた直後は見出しへ移らない（ページの頭の説明を読ませる）。答え始めてからは、新しい問いの見出しへ移る
let answering = false;

function show(...children) {
    root.replaceChildren(...children);
    if (!answering) return;
    const heading = root.querySelector("h2");
    if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
    }
    // スマホでは選択肢の下のほうを押すので、次の問いの頭が画面の上に隠れる
    if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: "start" });
}

function progress(list) {
    return el("p", { class: "finder-progress" }, `${at + 1} / ${list.length}`);
}

// 最初の問いでは何も描かない（append は null を文字の「null」にするので、空の文字列を返す）
function back() {
    if (at === 0) return "";
    return el("p", { class: "finder-back" },
        el("button", { type: "button", class: "finder-link", onclick: () => { at -= 1; render(); } }, "← 前の質問へ"));
}

function answer(key, value) {
    answering = true;
    answers[key] = value;
    // 経験や見方を変えたら、その先で聞く問いが変わる。もう聞かない問いの答えは捨てる
    const list = steps(answers);
    if (!list.includes("prefecture")) delete answers.prefecture;
    if (!list.includes("self")) {
        delete answers.position;
        delete answers.hand;
    }
    at += 1;
    if (at >= list.length) {
        shown = new Set();
        result();
    } else {
        render();
    }
}

function question(id, list) {
    const q = QUESTIONS[id];
    const key = q.key ?? id;
    return [
        progress(list),
        el("h2", {}, q.title),
        el("div", { class: "finder-options" },
            ...q.options.map(([value, text]) => el("button", {
                type: "button",
                class: answers[key] === value ? "finder-option is-chosen" : "finder-option",
                onclick: () => answer(key, value),
            }, text))),
        back(),
    ];
}

function prefectureStep(list) {
    const field = select("prefecture", "都道府県", [["", "選んでください"], ...PREFECTURES.map(([name]) => [name, name])]);
    const input = field.querySelector("select");
    input.value = answers.prefecture ?? "";
    const next = el("button", { type: "button", class: "finder-button", onclick: () => answer("prefecture", input.value) }, "次へ");
    next.disabled = !input.value;
    input.addEventListener("change", () => { next.disabled = !input.value; });
    return [
        progress(list),
        el("h2", {}, "住んでいる都道府県は？"),
        el("p", { class: "finder-note" }, "近いチームの選手から選びます。"),
        field,
        el("p", {}, next),
        back(),
    ];
}

function selfStep(list) {
    const position = select("position", "ポジション",
        [["", "答えない"], ...Object.entries(POSITIONS).map(([code, p]) => [code, `${code}（${p.name}）`])]);
    const hand = select("hand", "利き手", [["", "答えない"], ["right", "右"], ["left", "左"], ["both", "両方"]]);
    position.querySelector("select").value = answers.position ?? "";
    hand.querySelector("select").value = answers.hand ?? "";
    const done = () => {
        answers.position = position.querySelector("select").value || undefined;
        answers.hand = hand.querySelector("select").value || undefined;
        answer("self", true);
    };
    return [
        progress(list),
        el("h2", {}, "自分のポジションと利き手は？"),
        el("p", { class: "finder-note" }, "答えなくても選べます。同じところがある選手には、そのことを添えます。"),
        position,
        hand,
        el("p", {}, el("button", { type: "button", class: "finder-button", onclick: done }, "結果を見る")),
        back(),
    ];
}

function render() {
    const list = steps(answers);
    const id = list[at];
    if (id === "prefecture") show(...prefectureStep(list));
    else if (id === "self") show(...selfStep(list));
    else show(...question(id, list));
}

function card(pick) {
    const p = pick.player;
    const position = POSITIONS[p.position];
    const common = commonPoints(p, answers);
    const link = (kind, href, text) => el("a", {
        href,
        target: "_blank",
        rel: "noopener noreferrer",
        onclick: () => count(kind, [p.id]),
    }, text, " ", el("span", { "aria-hidden": "true" }, "↗"));
    return el("li", { class: "finder-card" },
        el("h3", {}, p.name),
        el("p", { class: "finder-meta" }, `${p.teamName}・${p.position}（${position.name}）・背番号 ${p.number}`),
        answers.experience === "none" ? el("p", { class: "finder-plain" }, `${position.name} ― ${position.plain}`) : "",
        el("p", { class: "finder-point" }, el("strong", {}, "ここを見て"), highlight(pick, answers)),
        common ? el("p", { class: "finder-common" }, common) : "",
        el("p", { class: "finder-links" },
            link("player", p.url, "選手ページ（写真と成績）"),
            link("schedule", p.scheduleUrl, `${p.teamName}の試合日程`)));
}

function result() {
    let picks = choose(prepared, answers, { exclude: shown });
    // 当てはまる選手を見せ尽くしたら、今の 3 人だけを外して回し直す
    if (shown.size > 0 && picks.some((pick) => !pick.style)) {
        const last = [...shown].slice(-3);
        shown = new Set(last);
        picks = choose(prepared, answers, { exclude: shown });
    }
    for (const pick of picks) shown.add(pick.player.id);
    count("result", picks.map((pick) => pick.player.id));

    show(
        el("h2", {}, "あなたにおすすめの 3 人"),
        el("p", { class: "finder-note" }, `成績は前季（${prepared.previousSeason} シーズン）のものです。`),
        el("ol", { class: "finder-results" }, ...picks.map(card)),
        el("div", { class: "finder-again" },
            el("button", { type: "button", class: "finder-button", onclick: result }, "ほかの 3 人を見る"),
            el("button", { type: "button", class: "finder-link", onclick: restart }, "最初から答え直す")),
        el("p", { class: "finder-note" },
            "載っている内容の間違いや、載せないでほしいときは、",
            el("a", { href: "../board/" }, "ハンドボール掲示板"),
            "で教えてください。"));
}

function restart() {
    answers = {};
    at = 0;
    shown = new Set();
    render();
}

async function start() {
    root.replaceChildren(el("p", { class: "finder-note" }, "選手のデータを読み込んでいます…"));
    try {
        const res = await fetch("players.json");
        if (!res.ok) throw new Error(`players.json ${res.status}`);
        prepared = prepare(await res.json(), new Date());
    } catch {
        root.replaceChildren(el("p", { class: "finder-note" }, "いまは選手のデータを読み込めませんでした。少し時間をおいて開き直してください。"));
        return;
    }
    render();
}

if (root) start();
