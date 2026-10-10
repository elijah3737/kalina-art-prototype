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
