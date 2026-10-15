/* LP の対話部分（アコーディオンの開閉 / スクリーンショットのカルーセル）。
   もとは index.html のインライン <script> だったが、CSP（handball-project#284）で
   `script-src` に `'unsafe-inline'` を書かずに済ませるため外部ファイルへ出した。
   nonce / hash 方式も採れるが、hash は本文を 1 文字直すたびに書き換えが要り、
   **忘れるとスクリプトが黙って実行されなくなる**（この JS は無くても details の
   開閉自体は動くため、壊れても画面に出ない）。ファイルなら `'self'` で足りる。 */
/* 層のアコーディオンをゆっくり開閉する。details は閉じている間 中身がレンダリング
   されないので、高さの補間には実測が要る。CSS だけで済ませる手（`::details-content` +
   `interpolate-size`）もあるが、対応が Chrome 131+ / Safari 18.4+ と新しく、未対応の
   ブラウザでは即座に開くことになる。ここは JS で全ブラウザに揃える。
   **JS が無い / 落ちた場合も details のまま開閉はできる**（動きが無くなるだけ）。
   handball-project#241 */
document.querySelectorAll('.layer').forEach(function(layer) {
    var summary = layer.querySelector('summary');
    var body = layer.querySelector('.layer-body');
    if (!summary || !body) { return; }
    var running = null;

    summary.addEventListener('click', function(event) {
        // 動きを減らす設定の人には既定の即時開閉を残す。
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
        event.preventDefault();
        if (running) { running.cancel(); }

        var opening = !layer.open;
        if (opening) { layer.open = true; }
        var full = body.scrollHeight;

        running = body.animate(
            [{ height: (opening ? 0 : full) + 'px' }, { height: (opening ? full : 0) + 'px' }],
            { duration: 280, easing: 'ease' }
        );
        running.onfinish = function() {
            running = null;
            if (!opening) { layer.open = false; }
        };
    });
});

/* デモの中身（wasm + YouTube）は、その節が視界に入るまで読まない。1 個ずつ別々に見張るので、
   畳まれたままの層のぶんは読まない（閉じた details の中身は描画されず、交差も起きない）。
   #241 */
(function() {
    var roots = document.querySelectorAll('[data-demo]');
    if (!roots.length) { return; }
    Array.prototype.forEach.call(roots, function(root, i) {
        /* ES モジュールは URL 単位でキャッシュされるので、クエリを変えて **状態を共有しない
           別インスタンス**として読む。同じ URL で 2 回 mount すると、後から動かした方が
           先の YouTube プレイヤーを奪う（demo.js 冒頭「マウント」を参照）。
           wasm のグルーはクエリを付けないので 1 回しか落ちてこない。 */
        var load = function() {
            import('./demo/demo.js?i=' + i).then(function(m) { m.mount(root); });
        };
        if (!('IntersectionObserver' in window)) { load(); return; }
        var io = new IntersectionObserver(function(entries) {
            if (entries.some(function(e) { return e.isIntersecting; })) {
                io.disconnect();
                load();
            }
        }, { rootMargin: '300px' });
        io.observe(root);
    });
})();

document.querySelectorAll('.screens').forEach(function(screen) {
    var track = screen.querySelector('.screens-track');
    var dots = screen.querySelector('.screens-dots');
    var slides = Array.prototype.slice.call(track.querySelectorAll('.screens-slide'));
    if (slides.length < 2) {
        dots.remove();
        return;
    }
    slides.forEach(function(slide, i) {
        var focusSlide = function() {
            slide.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        };
        var dot = document.createElement('span');
        dot.className = 'dot' + (i === 0 ? ' active' : '');
        dot.addEventListener('click', focusSlide);
        dots.appendChild(dot);
        slide.style.cursor = 'pointer';
        slide.addEventListener('click', focusSlide);
    });
    function updateDots() {
        var maxScroll = track.scrollWidth - track.clientWidth;
        dots.style.display = maxScroll > 1 ? '' : 'none';
        var ratio = maxScroll > 0 ? track.scrollLeft / maxScroll : 0;
        var active = Math.round(ratio * (slides.length - 1));
        dots.querySelectorAll('.dot').forEach(function(d, i) {
            d.classList.toggle('active', i === active);
        });
        var trackCenter = track.scrollLeft + track.clientWidth / 2;
        var stride = slides[1].offsetLeft - slides[0].offsetLeft;
        slides.forEach(function(slide) {
            var dist = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - trackCenter);
            var away = Math.min(1, dist / stride);
            slide.style.transform = 'scale(' + (1 - 0.1 * away) + ')';
        });
    }
    var ticking = false;
    track.addEventListener('scroll', function() {
        if (ticking) { return; }
        ticking = true;
        requestAnimationFrame(function() {
            ticking = false;
            updateDots();
        });
    });
    window.addEventListener('resize', updateDots);
    updateDots();
});
