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
// - **アカウントの無い人は、ここのフォームから書く**（handball-project#596）。送り先は Worker
//   （data-board-post）で、内容を確かめてから GitHub App の名前で載る。
//   data-board-sitekey か data-board-post が空のうちはフォームを出さない
// - **GitHub App（bot）の投稿は、書いた人を「匿名」と出す。** github.com では名前の後ろに [bot] が付き、
//   本文の最後に注記（NOTE）が付くが、ページでは注記を消して見せる
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

    // 匿名の入口。上限と注記は Worker と揃える（Worker のテストが見る）
    const POST_BASE = root.dataset.boardPost;
    const SITEKEY = root.dataset.boardSitekey;
    const TITLE_MAX = 100;
    const BODY_MAX = 4000;
    const NOTE = "ハンドボール掲示板のフォームから、名前を出さずに届いた投稿です。";
    const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    // .github/ISSUE_TEMPLATE/board.yml の placeholder と同じ（GitHub の起票フォームと匿名のフォームを揃える）
    const BODY_PLACEHOLDER = "何に困っているか、どんな場面か、どうなったら良いか。思いついたままで大丈夫です。";

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
        // 匿名の投稿の最後の「区切り線 + 注記」は github.com で読む人向けなので、ページでは消す
        const last = body.lastElementChild;
        if (last && last.tagName === "P" && last.textContent.trim() === NOTE && last.previousElementSibling?.tagName === "HR") {
            last.previousElementSibling.remove();
            last.remove();
        }

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

    // ── 匿名のフォーム ──────────────────────────────────────────

    const UNAVAILABLE = "いまは送れませんでした。時間をおいて、もう一度送ってください（書いた文は消えていません）。";
    const ERRORS = {
        invalid: `タイトルと本文を書いてください（タイトルは ${TITLE_MAX} 文字、本文は ${BODY_MAX} 文字まで）。`,
        too_large: `タイトルと本文を書いてください（タイトルは ${TITLE_MAX} 文字、本文は ${BODY_MAX} 文字まで）。`,
        turnstile: "確認が済んでいませんでした。少し待ってから、もう一度送ってください。",
        busy: "いま投稿が多く、受け付けを止めています。時間をおいて送ってください。",
        not_found: "この議題には返信できません。閉じられたか、消された議題です。",
    };

    function anonEnabled() {
        return Boolean(POST_BASE && SITEKEY);
    }

    let turnstileLoading = null;

    // Turnstile は投稿のフォームを出すときだけ読む（読むだけの人には読ませない）
    function loadTurnstile() {
        turnstileLoading ??= new Promise((resolve, reject) => {
            const script = el("script", { src: TURNSTILE_SRC });
            script.async = true;
            script.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile"))));
            script.addEventListener("error", reject);
            document.head.append(script);
        });
        return turnstileLoading;
    }

    function resultMessage(kind, data) {
        if (data.result === "published") {
            return ["載りました。", el("a", { href: data.url }, kind === "topic" ? "議題を開く" : "開き直して見る")];
        }
        if (data.result === "held") return ["受け取りました。内容を確かめてから載せます。少し時間がかかることがあります。"];
        if (data.result === "rejected") return ["この内容は、掲示板には載せられませんでした。"];
        return [UNAVAILABLE];
    }

    // kind = "topic"（議題）| "reply"（返信。issueNumber の議題へ）
    function anonForm(kind, issueNumber) {
        const fields = [];
        let title = null;
        if (kind === "topic") {
            title = el("input", { type: "text", name: "title", maxlength: String(TITLE_MAX), required: "" });
            fields.push(el("label", { class: "board-field" }, el("span", {}, "タイトル"), title));
        }
        const body = el("textarea", { name: "body", rows: "6", maxlength: String(BODY_MAX), required: "", placeholder: BODY_PLACEHOLDER });
        fields.push(el("label", { class: "board-field" }, el("span", {}, "本文"), body));
        const check = el("div", { class: "board-turnstile" });
        const button = el("button", { type: "submit", class: "board-button" }, "送る");
        const status = el("p", { class: "board-status", "aria-live": "polite" });
        const form = el("form", { class: "board-form" }, ...fields, check, el("p", { class: "board-cta" }, button), status);

        let widget = null;
        loadTurnstile().then((turnstile) => {
            widget = turnstile.render(check, { sitekey: SITEKEY, language: "ja" });
        }).catch(() => {
            status.textContent = UNAVAILABLE;
            button.disabled = true;
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const token = widget === null ? "" : window.turnstile.getResponse(widget);
            if (!token) {
                status.textContent = ERRORS.turnstile;
                return;
            }
            button.disabled = true;
            status.textContent = "送っています…";
            const payload = kind === "topic"
                ? { title: title.value, body: body.value, turnstileToken: token }
                : { issue: issueNumber, body: body.value, turnstileToken: token };
            try {
                const res = await fetch(`${POST_BASE}/${kind === "topic" ? "topics" : "replies"}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    form.reset();
                    status.replaceChildren(...resultMessage(kind, data));
                } else {
                    status.textContent = ERRORS[data.error] ?? UNAVAILABLE;
                }
            } catch {
                status.textContent = UNAVAILABLE;
            } finally {
                button.disabled = false;
                // token は 1 回しか通らない
                window.turnstile.reset(widget);
            }
        });
        return form;
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

    function author(user) {
        return user.type === "Bot" ? "匿名" : user.login;
    }

    function post(item, title) {
        const meta = el("p", { class: "board-meta" }, `${author(item.user)}・${formatDate(item.created_at)}`);
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
        // 返信の欄も一覧のページと同じく「匿名 → GitHub」の順（handball-project#605）
        const reply = el("div", { class: "board-write" });
        if (anonEnabled()) {
            reply.append(el("div", { class: "board-anon" }, el("h3", {}, "匿名で返信する"), anonForm("reply", issue.number)));
        }
        reply.append(el("div", { class: "board-github" },
            el("p", { class: "board-cta" }, el("a", { class: "board-button", href: issue.html_url }, "GitHub で返信する"))));
        parts.push(reply);
        root.replaceChildren(...parts);
    }

    const number = Number(new URLSearchParams(location.search).get("n"));
    const viewingIssue = Number.isInteger(number) && number > 0;
    const anon = document.querySelector("[data-board-anon]");
    if (anon && anonEnabled() && !viewingIssue) {
        anon.append(anonForm("topic"));
        anon.hidden = false;
    }
    const run = viewingIssue ? showIssue(number) : showList();
    run.catch(showFailure);
})();
