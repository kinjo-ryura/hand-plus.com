/* 撮り方ガイドの手順のスクショを横にめくる帯（.screens）。ハンド記録の LP（handball-recorder/lp.js）の
   カルーセルと同じ動きを、この 1 枚のために写したもの。lp.js はハンド記録の LP 専用の処理（層の開閉・デモの読み込み）
   と同じファイルにあり、アプリをまたいで読むと片方の変更がもう片方を壊すので、共有しない。
   CSP（script-src に 'unsafe-inline' を書かない）のため、インラインではなくファイルで置く。
   **JS が無い / 落ちた場合も横にスクロールしてめくれる**（点の表示と、端のスクショを縮める動きが無くなるだけ）。 */
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
