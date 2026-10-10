// KALINA ART, вариант 4: отметки «для примерки», фото услуг по наведению, досчёт цифр, появление блоков.
// Данные выводятся только через textContent и атрибуты. Без JS страница полностью рабочая: всё видно, ссылки ведут на страницы.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- для примерки: до пяти работ, список живёт в браузере посетителя ----------
  var KEY = 'ka_pick_v1', MAX = 5;
  var bar = $('[data-pickbar]');
  var picks = [];
  try { picks = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (err) { picks = []; }
  if (!Array.isArray(picks)) picks = [];
  picks = picks.filter(function (p) { return p && typeof p.id === 'string'; }).slice(0, MAX);

  function save() { try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch (err) { /* приватный режим: список живёт до перезагрузки */ } }
  var label = bar && $('[data-pick-label]', bar), count = bar && $('[data-pick-count]', bar), send = bar && $('[data-pick-send]', bar);
  var labelText = label ? label.textContent : '';
  var hintTimer;
  function hint(text) {
    if (!label) return;
    label.textContent = text;
    bar.classList.add('is-hint');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { label.textContent = labelText; bar.classList.remove('is-hint'); }, 2600);
  }
  function sync() {
    $$('[data-work]').forEach(function (card) {
      var on = picks.some(function (p) { return p.id === card.getAttribute('data-work'); });
      var b = $('[data-pick]', card);
      card.classList.toggle('is-picked', on);
      if (!b) return;
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? 'Убрать из примерки' : 'Отложить для примерки';
    });
    if (!bar) return;
    if (bar.classList.contains('is-undo') && picks.length) { clearTimeout(undoTimer); backup = null; bar.classList.remove('is-undo'); label.textContent = labelText; }
    bar.hidden = picks.length === 0 && !bar.classList.contains('is-undo');
    // отступ под полосой держится, пока полоса видна, в том числе 6 секунд «Вернуть»
    document.body.classList.toggle('has-pickbar', !bar.hidden);
    count.textContent = String(picks.length);
    // тема заявки: список работ уйдёт Татьяне вместе с именем и телефоном
    send.setAttribute('data-lead', 'Примерка: ' + picks.map(function (p) { return '«' + p.t + '», ' + p.a; }).join('; '));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-pick]');
    if (!b) return;
    var card = b.closest('[data-work]');
    if (!card) return;
    var id = card.getAttribute('data-work');
    var i = picks.findIndex(function (p) { return p.id === id; });
    if (i >= 0) picks.splice(i, 1);
    else if (picks.length >= MAX) { hint('Можно отложить до пяти работ'); return; }
    else picks.push({ id: id, t: b.getAttribute('data-title') || '', a: b.getAttribute('data-artist') || '' });
    save();
    sync();
  });
  // очистка с возможностью вернуть: 6 секунд полоса показывает «Вернуть»
  var clear = bar && $('[data-pick-clear]', bar), undo = bar && $('[data-pick-undo]', bar);
  var backup = null, undoTimer;
  function endUndo() { clearTimeout(undoTimer); backup = null; bar.classList.remove('is-undo'); label.textContent = labelText; sync(); }
  if (clear) clear.addEventListener('click', function () {
    backup = picks.slice();
    picks = [];
    save();
    clearTimeout(hintTimer);
    bar.classList.remove('is-hint');
    bar.classList.add('is-undo');
    label.textContent = 'Список очищен';
    sync();
    undo.focus({ preventScroll: true });
    clearTimeout(undoTimer);
    undoTimer = setTimeout(endUndo, 6000);
  });
  if (undo) undo.addEventListener('click', function () {
    if (backup) { picks = backup; save(); }
    endUndo();
  });
  document.addEventListener('ka:cards-added', sync);
  // высота полосы меняется (подпись в две строки на узком телефоне): отступ страницы и cookie берут её из --pickbar-h
  if (bar && 'ResizeObserver' in window) {
    new ResizeObserver(function () {
      if (!bar.hidden) document.documentElement.style.setProperty('--pickbar-h', bar.offsetHeight + 'px');
    }).observe(bar);
  }
  sync();

  // ---------- шапка: линия снизу появляется, когда страницу начали прокручивать ----------
  var hdr = $('[data-hdr]');
  if (hdr) {
    var atTop = function () { hdr.classList.toggle('is-top', window.scrollY < 8); };
    window.addEventListener('scroll', atTop, { passive: true });
    atTop();
  }

  // ---------- услуги: одно фото справа меняется на фото строки, на которую навели ----------
  var items = $$('[data-svc-item]'), shot = $('[data-svc-img]');
  var preloaded = false, swapTimer;
  function activate(item) {
    var src = item.getAttribute('data-svc-item');
    items.forEach(function (it) { it.classList.toggle('is-on', it === item); });
    if (!shot || shot.getAttribute('src') === src) return;
    if (!preloaded) { preloaded = true; items.forEach(function (it) { new Image().src = it.getAttribute('data-svc-item'); }); }
    if (reduce) { shot.setAttribute('src', src); return; }
    shot.classList.add('is-fading');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(function () { shot.setAttribute('src', src); shot.classList.remove('is-fading'); }, 260);
  }
  items.forEach(function (it) {
    it.addEventListener('mouseenter', function () { activate(it); });
    it.addEventListener('focusin', function () { activate(it); });
  });

  if (reduce || !('IntersectionObserver' in window)) return;

  // ---------- цифры фактов досчитывают один раз, когда блок появился на экране ----------
  var nums = $$('[data-count]');
  var numIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      numIO.unobserve(en.target);
      var el = en.target, to = parseInt(el.getAttribute('data-count'), 10), tail = el.textContent.replace(/^\d+/, '');
      var t0 = performance.now(), dur = 1200;
      (function step(t) {
        var k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
        el.textContent = v + tail;
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }, { threshold: 0.6 });
  // только те, что ниже первого экрана: видимые сразу цифры не «прыгают» в ноль
  var vh = window.innerHeight;
  nums.filter(function (el) { return el.getBoundingClientRect().top > vh; }).forEach(function (el) { numIO.observe(el); });

  // ---------- плавное появление блоков ниже первого экрана ----------
  var targets = $$('.bio__photo, .bio__body, .why__item, .sec-head, .sec > .wrap > .sec-title, .works, .svc__item, .svc__media, .expo__item, .ftr__cta');
  var rvIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      rvIO.unobserve(en.target);
      en.target.classList.add('rv-in');
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  // сначала все замеры, потом все записи классов — без пересчёта раскладки на каждом шаге
  var below = targets.filter(function (el) { return el.getBoundingClientRect().top >= vh; });
  below.forEach(function (el) {
    // соседи в одном ряду появляются друг за другом
    if (el.matches('.why__item, .expo__item')) el.style.transitionDelay = (Array.prototype.indexOf.call(el.parentNode.children, el) % 4) * 80 + 'ms';
    el.classList.add('rv');
    rvIO.observe(el);
  });
})();
