// ハンドボール掲示板。議題は hand-plus.com リポの Issues（ラベル「議題」）で、ページを開いたときに
// GitHub の API から読んで並べる。`?n=<番号>` のときはその議題の本文と返信を見せる。
//
// - **議題を HTML に書き出さない。** 書き出すと、議題や返信が増えるたびにサイトの更新が要る。
//   開いたときに読めば、GitHub で書かれたものが次に開いた時点で載る
// - **議題は Worker（data-board-read）から読み、読めなければ GitHub の API から直接読む**（handball-project#622）。
//   Google がページを描くとき、GitHub の API からは読めず（2026-10-18 のリッチリザルト テスト）、議題が検索に載らなかった。
//   Worker は App の token で読んで 60 秒ためる。返事は GitHub のものそのままなので、どちらから読んでも同じ部品で描く。
//   直接読むときは、ログインなしの API は IP ごとに 1 時間 60 回まで（一覧は 1 回、議題は 2 回〈本文と返信〉）。
//   どちらでも読めないときは GitHub の一覧へ案内する
// - **検索に載せる形**（handball-project#622）: canonical は HTML に書かず、ここで議題ごとの URL（?n=<番号>）を入れる。
//   議題の題と本文の頭を、ページの題と説明にする。議題が見つからない・読めないときは、そのページを noindex にする
//   （中身の無いページが議題の URL で検索に載らないように）
// - **本文は GitHub が HTML にしたもの（`body_html`）を受け取る。** Markdown をここで描かない。
//   差し込む前に、使う要素と属性だけを残す（GitHub が既に無害化しているが、ページに入れる側でも絞る）
// - **閉じた議題は、「解決した」で閉じたものだけを解決済みとして出す**（handball-project#618）。一覧では書く入口の
//   下に並べ、議題のページでは札を付けて返信も受ける（Worker も同じ議題への返信を受ける）。まずいものは
//   「対応しない」で閉じるか、ラベル「議題」を外すか消せば、ページからも消える。GitHub の閉じるボタンの既定は
//   「解決した」なので、隠すために閉じるときは閉じ方を選ぶ
// - **アカウントの無い人は、ここのフォームから書く**（handball-project#596）。送り先は Worker
//   （data-board-post）で、内容を確かめてから GitHub App の名前で載る。
//   data-board-sitekey か data-board-post が空のうちはフォームを出さない
// - **匿名の投稿が載ったら、送った人の画面にはその場で出す**（handball-project#616）。Worker が載せたものを
//   GitHub から読むときと同じ形で返すので、読み直さない（読み直すと 60 秒のキャッシュで古いものが返りうる）。
//   返信は並びの最後に足し、議題はその議題のページへ移る。中身が返らない（古い Worker）ときは開くリンクを出す
// - **GitHub App（bot）の投稿は、書いた人を「匿名」と出す。** github.com では名前の後ろに [bot] が付き、
//   本文の最後に注記（NOTE）が付くが、ページでは注記を消して見せる
// - **リポの持ち主（author_association が OWNER）の投稿は、書いた人を「運営」と出す**（handball-project#615）。
//   読む人にはアカウント名では誰か分からない。返信が並んでも見つけやすいよう、印（board-owner）で囲む。
//   github.com ではアカウント名のまま
(() => {
    "use strict";

    const root = document.getElementById("board");
    if (!root) return;

    const REPO = root.dataset.boardRepo;
    const LABEL = root.dataset.boardLabel;
    const BOARD_URL = root.dataset.boardUrl;
    const READ_BASE = root.dataset.boardRead;
    const API = `https://api.github.com/repos/${REPO}`;
    const HTML_JSON = "application/vnd.github.html+json";
    const LIST_ON_GITHUB = `https://github.com/${REPO}/issues?q=${encodeURIComponent(`is:issue is:open label:${LABEL}`)}`;
    // Issue form は本文の頭に「### <欄の label>」を入れる。.github/ISSUE_TEMPLATE/board.yml の label と揃える
    const FORM_HEADING = "本文";
    // Worker の LIST_PER_PAGE と揃える（Worker のテストが見る）
    const PER_PAGE = 100;
    // 議題のページの説明（検索結果の題の下に出る文）にする本文の頭の文字数
    const DESCRIPTION_MAX = 120;

    // 匿名の入口。上限と注記は Worker と揃える（Worker のテストが見る）
    const POST_BASE = root.dataset.boardPost;
    const SITEKEY = root.dataset.boardSitekey;
    const TITLE_MAX = 100;
    const BODY_MAX = 4000;
    const NOTE = "ハンドボール掲示板のフォームから、名前を出さずに届いた投稿です。";
    const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    // .github/ISSUE_TEMPLATE/board.yml の placeholder と同じ（GitHub の起票フォームと匿名のフォームを揃える）
    const BODY_PLACEHOLDER = "何に困っているか、何を聞きたいか、どうなったら良いか。思いついたままで大丈夫です。";

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

    // Worker は path の頼み方（query）を見ず、自分で決めた同じ頼み方で読む。Worker が 404 を返したとき（直前に
    // 載った議題がまだ Worker の一覧に無いなど）も GitHub に聞き直す
    async function get(path) {
        if (READ_BASE) {
            try {
                const res = await fetch(READ_BASE + path);
                if (res.ok) return await res.json();
            } catch {
                // 下で GitHub から直接読む
            }
        }
        const res = await fetch(API + path, { headers: { Accept: HTML_JSON } });
        if (!res.ok) throw new ApiError(res.status);
        return res.json();
    }

    // ── 検索に載せる形 ──────────────────────────────────────────

    // HTML に canonical は無い（あると、書き換えたときに Google が迷う）。無ければ足し、あれば向け直す
    // （匿名の議題が載って議題のページへ移ったとき）
    function setCanonical(number) {
        let link = document.head.querySelector('link[rel="canonical"]');
        if (!link) {
            link = el("link", { rel: "canonical" });
            document.head.append(link);
        }
        link.setAttribute("href", number ? `${BOARD_URL}?n=${number}` : BOARD_URL);
    }

    function setMeta(name, content) {
        let meta = document.head.querySelector(`meta[name="${name}"]`);
        if (!meta) {
            meta = el("meta", { name });
            document.head.append(meta);
        }
        meta.setAttribute("content", content);
    }

    function describe(text) {
        const flat = text.replace(/\s+/g, " ").trim();
        if (!flat) return;
        const chars = [...flat];
        setMeta("description", chars.length > DESCRIPTION_MAX ? `${chars.slice(0, DESCRIPTION_MAX).join("")}…` : flat);
    }

    // 「解決した」で閉じた議題（handball-project#618）。「対応しない」など他の理由で閉じたものは出さない。
    // Worker の isSolved と同じ形（返信を受けるかが揃っていないと、返信の欄から送っても断られる）
    function isSolved(issue) {
        return issue.state === "closed" && issue.state_reason === "completed";
    }

    function isBoardIssue(issue) {
        return !issue.pull_request && (issue.state === "open" || isSolved(issue)) && issue.labels.some((l) => l.name === LABEL);
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

    // 載ったものの中身（Worker が GitHub の返事をそのまま渡したもの）。古い Worker は返さないので null
    function publishedItem(data) {
        const item = data.item;
        if (data.result !== "published" || !item || typeof item !== "object") return null;
        return typeof item.body_html === "string" && typeof item.html_url === "string" ? item : null;
    }

    // kind = "topic"（議題）| "reply"（返信。issueNumber の議題へ）。
    // onPublished(item) は載ったものをその場で出す。null なら resultMessage の開くリンクを出す
    function anonForm(kind, issueNumber, onPublished) {
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
            // Worker は判定と公開を済ませてから返すので数秒かかる。止まっていないと分かるよう、回る印を添える
            status.replaceChildren(el("span", { class: "board-spinner", "aria-hidden": "true" }), "送っています…");
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
                    // 載せないと判定されたときは書いた文を残す（誤判定なら、書き直して送り直せる。handball-project#616）
                    if (data.result === "published" || data.result === "held") form.reset();
                    const item = onPublished ? publishedItem(data) : null;
                    if (item) {
                        status.textContent = "載りました。";
                        onPublished(item);
                    } else {
                        status.replaceChildren(...resultMessage(kind, data));
                    }
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

    function topicList(issues) {
        return el("ul", { class: "board-list" }, ...issues.map((issue) => el("li", {},
            el("a", { href: `?n=${issue.number}` }, issue.title),
            el("p", { class: "board-meta" }, `返信 ${issue.comments} 件・${formatDate(issue.updated_at)}`))));
    }

    // 解決済みは書く入口の下に並べる（handball-project#618）。未解決の一覧に混ぜると、未解決が埋もれる。
    // 増えて長くなったら別のページへ移す
    function showSolved(issues) {
        const solved = document.querySelector("[data-board-solved]");
        if (!solved || issues.length === 0) return;
        solved.replaceChildren(el("h2", {}, "解決済み"), topicList(issues));
        solved.hidden = false;
    }

    async function showList() {
        root.replaceChildren(el("p", { class: "board-status" }, "読み込み中…"));
        // 解決済みも同じ 1 回で読んで、ここで分ける（1 時間 60 回の枠を増やさない）
        const fetched = await get(`/issues?state=all&labels=${encodeURIComponent(LABEL)}&sort=updated&per_page=${PER_PAGE}`);
        const shown = fetched.filter(isBoardIssue);
        const issues = shown.filter((issue) => issue.state === "open");
        showSolved(shown.filter(isSolved));
        const heading = el("h2", {}, "議題");
        if (issues.length === 0) {
            const empty = shown.length === 0 ? "まだ議題はありません。" : "いまは、解決していない議題はありません。";
            root.replaceChildren(heading, el("p", { class: "board-status" }, empty));
            return;
        }
        root.replaceChildren(heading, topicList(issues));
        if (fetched.length === PER_PAGE) {
            root.append(el("p", { class: "board-status" }, "続きは ", el("a", { href: LIST_ON_GITHUB }, "GitHub"), " で読めます。"));
        }
    }

    // ── 議題 ────────────────────────────────────────────────────

    // item は議題か返信。bot を先に見る（匿名の投稿は運営が載せたものでも「匿名」）
    function author(item) {
        if (item.user.type === "Bot") return "匿名";
        if (item.author_association === "OWNER") return "運営";
        return item.user.login;
    }

    function post(item, title) {
        const name = author(item);
        const meta = el("p", { class: "board-meta" },
            name === "運営" ? el("span", { class: "board-owner" }, name) : name, `・${formatDate(item.created_at)}`);
        if (title && isSolved(item)) meta.append(" ", el("span", { class: "board-solved-mark" }, "解決済み"));
        return el("article", { class: "board-post" }, ...(title ? [el("h2", {}, title)] : []), meta,
            cleanBody(item.body_html, item.html_url));
    }

    function backLink() {
        return el("p", { class: "board-back" }, el("a", { href: "./" }, "← 議題の一覧"));
    }

    // 議題を開いているときは、一覧の側の書く入口を隠す（書く入口は一覧の側にだけ置く）
    function hideListWrite() {
        const write = document.querySelector("[data-board-write]");
        if (write) write.hidden = true;
    }

    async function showIssue(number) {
        hideListWrite();
        root.replaceChildren(backLink(), el("p", { class: "board-status" }, "読み込み中…"));

        let issue = null;
        try {
            issue = await get(`/issues/${number}`);
        } catch (e) {
            if (!(e instanceof ApiError && NOT_FOUND.has(e.status))) throw e;
        }
        if (!issue || !isBoardIssue(issue)) {
            setMeta("robots", "noindex");
            root.replaceChildren(backLink(), el("p", { class: "board-status" }, "この議題は見つかりませんでした。"));
            return;
        }
        const comments = issue.comments > 0 ? await get(`/issues/${number}/comments?per_page=${PER_PAGE}`) : [];
        renderIssue(issue, comments);
    }

    // 匿名の議題が載ったら、その議題のページへ移る（handball-project#616）。Worker が返した中身で描き、GitHub を
    // 読み直さない。戻る操作で一覧に戻ったときは、開き直して読む（下の popstate）
    function openTopic(issue) {
        history.pushState(null, "", `?n=${issue.number}`);
        hideListWrite();
        renderIssue(issue, [], "載りました。");
        window.scrollTo(0, 0);
    }

    // notice は一番上に出す一言（議題が載った直後の「載りました。」）
    function renderIssue(issue, comments, notice) {
        document.title = `${issue.title}｜ハンドボール掲示板`;
        setCanonical(issue.number);
        const topic = post(issue, issue.title);
        describe(topic.querySelector(".board-body").textContent);
        let count = issue.comments;
        const heading = el("h3", { class: "board-replies-heading" }, `返信 ${count} 件`);
        const replies = el("ol", { class: "board-replies" }, ...comments.map((c) => el("li", {}, post(c))));
        const parts = [backLink()];
        if (notice) parts.push(el("p", { class: "board-status" }, notice));
        parts.push(topic, heading);
        if (comments.length > 0) parts.push(replies);
        const more = issue.comments > comments.length;
        if (more) {
            parts.push(el("p", { class: "board-status" }, "続きは ", el("a", { href: issue.html_url }, "GitHub"), " で読めます。"));
        }

        // 匿名の返信が載ったら、並びの最後にその場で足す（handball-project#616）。開いた後に他の人が書いた返信は、
        // 開き直すまで出ない。読みきれていない返信がある（more）ときは、足すと順が崩れるので開くリンクのまま
        function addReply(item) {
            if (!replies.isConnected) heading.after(replies);
            const li = el("li", {}, post(item));
            replies.append(li);
            count += 1;
            heading.textContent = `返信 ${count} 件`;
            li.scrollIntoView({ block: "nearest" });
        }

        // 返信の欄も一覧のページと同じく「匿名 → GitHub」の順（handball-project#605）で、見出しと入口の言い方（#606）と、
        // GitHub の入口を文字のリンクにすること（#619）も揃える
        const reply = el("div", { class: "board-write" });
        if (anonEnabled()) {
            reply.append(el("div", { class: "board-anon" }, el("h3", {}, "匿名で返信する"),
                anonForm("reply", issue.number, more ? null : addReply)));
        }
        reply.append(el("div", { class: "board-github" },
            el("h3", {}, "ニックネーム付きで返信する"),
            el("p", { class: "board-cta" }, el("a", { class: "board-link", href: issue.html_url },
                "GitHub にログインして返信 ", el("span", { "aria-hidden": "true" }, "↗")))));
        parts.push(reply);
        root.replaceChildren(...parts);
    }

    const number = Number(new URLSearchParams(location.search).get("n"));
    const viewingIssue = Number.isInteger(number) && number > 0;
    // 読み込む前に入れる（読めなかったときも、議題のページは自分の URL を名乗る）
    setCanonical(viewingIssue ? number : null);
    const anon = document.querySelector("[data-board-anon]");
    if (anon && anonEnabled() && !viewingIssue) {
        anon.append(anonForm("topic", null, openTopic));
        anon.hidden = false;
    }
    // openTopic が履歴に足した議題のページから戻ったとき、描き直す代わりに開き直す
    window.addEventListener("popstate", () => location.reload());
    const run = viewingIssue ? showIssue(number) : showList();
    run.catch(() => {
        // 一覧のページには書く入口と説明があるので残す。議題のページは中身が無いので検索に載せない
        if (viewingIssue) setMeta("robots", "noindex");
        showFailure();
    });
})();
