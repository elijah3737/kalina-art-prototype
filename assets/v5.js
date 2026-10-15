// KALINA ART, вариант 5: цифры фактов досчитывают один раз, когда блок появился на экране. Без JS цифры видны сразу.
(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;
  var nums = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      var el = en.target, to = parseInt(el.getAttribute('data-count'), 10), t0 = performance.now(), dur = 1200;
      (function step(t) {
        var k = Math.min(1, (t - t0) / dur);
        el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }, { threshold: 0.6 });
  // только ниже первого экрана: видимые сразу цифры не «прыгают» в ноль
  nums.filter(function (el) { return el.getBoundingClientRect().top > window.innerHeight; }).forEach(function (el) { io.observe(el); });
})();

// Вкладки на странице работы: стрелки переключают, без JS тексты видны все сразу
(function () {
  'use strict';
  Array.prototype.forEach.call(document.querySelectorAll('[data-wtabs]'), function (box) {
    var list = box.querySelector('[role="tablist"]');
    var tabs = Array.prototype.slice.call(box.querySelectorAll('[role="tab"]'));
    if (!list || tabs.length < 2) return;
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) t.removeAttribute('tabindex'); else t.setAttribute('tabindex', '-1');
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
    }
    list.hidden = false;
    box.classList.add('is-js');
    // высота блока — по самому длинному тексту, чтобы страница не прыгала при переключении
    var body = box.querySelector('.wtabs__body');
    function fit() {
      if (!body) return;
      body.style.minHeight = '';
      var max = 0;
      var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
      var shown = panels.map(function (p) { return p.hidden; });
      // меряем весь блок с каждой панелью по очереди — так учитываются и отступы панели
      panels.forEach(function (p) {
        panels.forEach(function (q) { q.hidden = q !== p; });
        max = Math.max(max, body.offsetHeight);
      });
      panels.forEach(function (p, i) { p.hidden = shown[i]; });
      body.style.minHeight = max + 'px';
    }
    select(tabs[0], false);
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('load', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t, false); });
      t.addEventListener('keydown', function (ev) {
        var d = (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ? 1 : (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') ? -1 : 0;
        if (!d) return;
        ev.preventDefault();
        select(tabs[(i + d + tabs.length) % tabs.length], true);
      });
    });
  });
})();
