// ハンドボール掲示板。議題は hand-plus.com リポの Issues（ラベル「議題」）で、ページを開いたときに
// GitHub の API から読んで並べる。`?n=<番号>` のときはその議題の本文と返信を見せる。
//
// - **議題を HTML に書き出さない。** 書き出すと、議題や返信が増えるたびにサイトの更新が要る。
//   開いたときに読めば、GitHub で書かれたものが次に開いた時点で載る
// - **ログインなしの API は IP ごとに 1 時間 60 回まで。** 一覧は 1 回、議題は 2 回（本文と返信）。
//   超えたとき・読めないときは GitHub の一覧へ案内する
// - **本文は GitHub が HTML にしたもの（`body_html`）を受け取る。** Markdown をここで描かない。
//   差し込む前に、使う要素と属性だけを残す（GitHub が既に無害化しているが、ページに入れる側でも絞る）
// - **閉じた議題は出さない。** まずいものは GitHub で閉じるか消せば、ページからも消える
(() => {
    "use strict";

    const root = document.getElementById("board");
    if (!root) return;

    const REPO = root.dataset.boardRepo;
    const LABEL = root.dataset.boardLabel;
    const API = `https://api.github.com/repos/${REPO}`;
    const HTML_JSON = "application/vnd.github.html+json";
    const LIST_ON_GITHUB = `https://github.com/${REPO}/issues?q=${encodeURIComponent(`is:issue is:open label:${LABEL}`)}`;
    // Issue form は本文の頭に「### <欄の label>」を入れる。.github/ISSUE_TEMPLATE/board.yml の label と揃える
    const FORM_HEADING = "本文";
    const PER_PAGE = 100;

    // ── 小さな部品 ──────────────────────────────────────────────

    function el(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            if (key === "class") node.className = value;
            else node.setAttribute(key, value);
        }
        node.append(...children);
        return node;
    }

    function formatDate(iso) {
        const date = new Date(iso);
        const sameYear = date.getFullYear() === new Date().getFullYear();
        return date.toLocaleDateString("ja-JP", sameYear
            ? { month: "long", day: "numeric" }
            : { year: "numeric", month: "long", day: "numeric" });
    }

    // 見つからない（消した・番号違い）と、読めない（回数の上限・通信）を分ける。前者を「読めない」と出すと、
    // 開き直しても直らないものを待たせる
    const NOT_FOUND = new Set([404, 410]);

    class ApiError extends Error {
        constructor(status) {
            super(`GitHub API ${status}`);
            this.status = status;
        }
    }

    async function get(path) {
        const res = await fetch(API + path, { headers: { Accept: HTML_JSON } });
        if (!res.ok) throw new ApiError(res.status);
        return res.json();
    }

    function isBoardIssue(issue) {
        return !issue.pull_request && issue.state === "open" && issue.labels.some((l) => l.name === LABEL);
    }

    function showFailure() {
        root.replaceChildren(el("p", { class: "board-status" },
            "いまは議題を読み込めませんでした。少し時間をおいて開き直すか、",
            el("a", { href: LIST_ON_GITHUB }, "GitHub で見てください"),
            "。"));
    }

    // ── 本文の HTML を絞る ──────────────────────────────────────

    // 文の構造だけを残す。画像は CSP（img-src 'self'）で出ないので、GitHub で見る案内に置き換える
    const KEEP = new Set([
        "P", "BR", "HR", "A", "STRONG", "B", "EM", "I", "DEL", "S", "CODE", "PRE", "BLOCKQUOTE",
        "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
        "DETAILS", "SUMMARY", "SPAN", "DIV", "G-EMOJI",
    ]);
    const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "TEXTAREA",
        "SELECT", "LINK", "META", "SVG", "MATH", "VIDEO", "AUDIO", "SOURCE", "TEMPLATE"]);

    function cleanBody(html, linkToGitHub) {
        // DOMParser の文書は描画されないので、ここで script も画像の読み込みも走らない
        const doc = new DOMParser().parseFromString(html || "", "text/html");
        const body = doc.body;
        const first = body.firstElementChild;
        if (first && /^H[1-6]$/.test(first.tagName) && first.textContent.trim() === FORM_HEADING) first.remove();

        for (const node of [...body.querySelectorAll("*")]) {
            if (!node.isConnected) continue;
            const tag = node.tagName.toUpperCase();
            if (DROP.has(tag)) {
                node.remove();
            } else if (tag === "IMG") {
                node.replaceWith(el("a", { href: linkToGitHub }, "［画像は GitHub で見られます］"));
            } else if (!KEEP.has(tag)) {
                node.replaceWith(...node.childNodes);
            } else {
                const href = tag === "A" ? node.getAttribute("href") : null;
                for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
                if (tag === "A") {
                    if (href && /^https?:\/\//.test(href)) {
                        node.setAttribute("href", href);
                        node.setAttribute("rel", "nofollow noopener noreferrer");
                    }
                }
            }
        }
        const out = el("div", { class: "board-body" });
        out.append(...[...body.childNodes].map((n) => document.importNode(n, true)));
        return out;
    }

    // ── 一覧 ────────────────────────────────────────────────────

    async function showList() {
        root.replaceChildren(el("p", { class: "board-status" }, "読み込み中…"));
        const issues = (await get(`/issues?state=open&labels=${encodeURIComponent(LABEL)}&sort=updated&per_page=${PER_PAGE}`))
            .filter(isBoardIssue);
        const heading = el("h2", {}, "議題");
        if (issues.length === 0) {
            root.replaceChildren(heading, el("p", { class: "board-status" }, "まだ議題はありません。"));
            return;
        }
        const list = el("ul", { class: "board-list" }, ...issues.map((issue) => el("li", {},
            el("a", { href: `?n=${issue.number}` }, issue.title),
            el("p", { class: "board-meta" }, `返信 ${issue.comments} 件・${formatDate(issue.updated_at)}`))));
        root.replaceChildren(heading, list);
        if (issues.length === PER_PAGE) {
            root.append(el("p", { class: "board-status" }, "続きは ", el("a", { href: LIST_ON_GITHUB }, "GitHub"), " で読めます。"));
        }
    }

    // ── 議題 ────────────────────────────────────────────────────

    function post(item, title) {
        const meta = el("p", { class: "board-meta" }, `${item.user.login}・${formatDate(item.created_at)}`);
        return el("article", { class: "board-post" }, ...(title ? [el("h2", {}, title)] : []), meta,
            cleanBody(item.body_html, item.html_url));
    }

    async function showIssue(number) {
        const write = document.querySelector("[data-board-write]");
        if (write) write.hidden = true;
        const back = el("p", { class: "board-back" }, el("a", { href: "./" }, "← 議題の一覧"));
        root.replaceChildren(back, el("p", { class: "board-status" }, "読み込み中…"));

        let issue = null;
        try {
            issue = await get(`/issues/${number}`);
        } catch (e) {
            if (!(e instanceof ApiError && NOT_FOUND.has(e.status))) throw e;
        }
        if (!issue || !isBoardIssue(issue)) {
            root.replaceChildren(back, el("p", { class: "board-status" }, "この議題は見つかりませんでした。"));
            return;
        }
        document.title = `${issue.title}｜ハンドボール掲示板`;
        const comments = issue.comments > 0 ? await get(`/issues/${number}/comments?per_page=${PER_PAGE}`) : [];

        const parts = [back, post(issue, issue.title), el("h3", { class: "board-replies-heading" }, `返信 ${issue.comments} 件`)];
        if (comments.length > 0) {
            parts.push(el("ol", { class: "board-replies" }, ...comments.map((c) => el("li", {}, post(c)))));
        }
        if (issue.comments > comments.length) {
            parts.push(el("p", { class: "board-status" }, "続きは ", el("a", { href: issue.html_url }, "GitHub"), " で読めます。"));
        }
        parts.push(el("p", { class: "board-cta" }, el("a", { class: "board-button", href: issue.html_url }, "GitHub で返信する")));
        root.replaceChildren(...parts);
    }

    const number = Number(new URLSearchParams(location.search).get("n"));
    const run = Number.isInteger(number) && number > 0 ? showIssue(number) : showList();
    run.catch(showFailure);
})();
