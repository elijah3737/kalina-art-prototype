// Галерея: фильтры (внутри группы — «или», между группами — «и»), сортировка, «Показать ещё» по 12, состояние в адресе.
// Без JS видны все работы. Данные карточек — в data-атрибутах, выводятся только через textContent.
(function () {
  'use strict';
  var form = document.querySelector('[data-flt]'), grid = document.querySelector('[data-gal]');
  if (!form || !grid) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cards = $$('.card', grid), STEP = 12, shown = STEP;
  var groups = $$('[data-flt-group]', form).map(function (g) { return g.getAttribute('data-flt-group'); });
  var sort = $('[data-flt-sort]', form), chips = $('[data-flt-chips]', form), panel = $('[data-flt-panel]', form), openBtn = $('[data-flt-open]', form);
  var more = $('[data-gal-more]'), moreWrap = $('[data-gal-more-wrap]'), empty = $('[data-gal-empty]');
  var params = new URLSearchParams(location.search), query = (params.get('q') || '').trim().toLowerCase();

  // состояние из адреса: ?tema=Пейзаж,Город&sort=price-asc
  groups.forEach(function (key) {
    var vals = (params.get(key) || '').split(',').filter(Boolean);
    $$('input[name="' + key + '"]', form).forEach(function (i) { i.checked = vals.indexOf(i.value) !== -1; });
  });
  if (sort && params.get('sort')) sort.value = params.get('sort');

  function picked() {
    var st = {};
    groups.forEach(function (key) {
      var v = $$('input[name="' + key + '"]:checked', form).map(function (i) { return i.value; });
      if (v.length) st[key] = v;
    });
    return st;
  }
  function matches(card, st) {
    if (query && (card.getAttribute('data-q') || '').indexOf(query) === -1) return false;
    return Object.keys(st).every(function (key) {
      var have = (card.getAttribute('data-' + key) || '').split('|');
      return st[key].some(function (v) { return have.indexOf(v) !== -1; });
    });
  }
  function order(list) {
    var s = sort ? sort.value : '';
    var num = function (c, a) { return parseInt(c.getAttribute(a), 10) || 0; };
    return list.slice().sort(function (a, b) {
      if (s === 'price-asc' || s === 'price-desc') {
        // data-rank — место по цене (скрытая цена тоже считается); 0 — цены нет совсем, такие в конце при любом направлении
        var pa = num(a, 'data-rank'), pb = num(b, 'data-rank');
        if (!pa !== !pb) return pa ? -1 : 1;
        if (pa !== pb) return s === 'price-asc' ? pa - pb : pb - pa;
      }
      if (s === 'new') {
        // по году работы; год не указан — в конце
        var ya = num(a, 'data-year'), yb = num(b, 'data-year');
        if (ya !== yb) return yb - ya;
      }
      if (s === 'size-asc' || s === 'size-desc') {
        var d = num(a, 'data-size') - num(b, 'data-size');
        if (d) return s === 'size-asc' ? d : -d;
      }
      return num(a, 'data-i') - num(b, 'data-i');
    });
  }
  function chip(text, onRemove) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'flt__chip';
    b.textContent = text + ' ×';
    b.setAttribute('aria-label', 'Убрать фильтр: ' + text);
    b.addEventListener('click', onRemove);
    chips.appendChild(b);
  }
  function apply(keepShown) {
    var st = picked();
    if (!keepShown) shown = STEP;
    var list = order(cards.filter(function (c) { return matches(c, st); }));
    cards.forEach(function (c) { c.hidden = true; });
    list.forEach(function (c, i) { grid.appendChild(c); c.hidden = i >= shown; });
    $('[data-flt-found]', form).textContent = String(list.length);
    var total = $('[data-flt-total]', form); if (total) total.textContent = String(list.length);
    moreWrap.hidden = list.length <= shown;
    empty.hidden = list.length > 0;

    // отметки: сколько выбрано в группе и всего, чипы выбранного
    var n = 0;
    $$('[data-flt-group]', form).forEach(function (g) {
      var k = (st[g.getAttribute('data-flt-group')] || []).length;
      n += k;
      $('[data-flt-badge]', g).textContent = k ? String(k) : '';
      g.classList.toggle('is-active', k > 0);
    });
    $('[data-flt-n]', form).textContent = n ? '· ' + n : '';
    chips.textContent = '';
    if (query) chip('Поиск: ' + query, function () { query = ''; apply(); });
    Object.keys(st).forEach(function (key) {
      st[key].forEach(function (v) {
        chip(v, function () { var i = $('input[name="' + key + '"][value="' + CSS.escape(v) + '"]', form); if (i) i.checked = false; apply(); });
      });
    });
    if (n || query) {
      var r = document.createElement('button');
      r.type = 'button'; r.className = 'flt__reset link'; r.textContent = 'Сбросить все';
      r.addEventListener('click', reset);
      chips.appendChild(r);
    }
    chips.hidden = !(n || query);

    // адрес: можно отправить ссылку с выбранными фильтрами
    var p = new URLSearchParams();
    if (query) p.set('q', query);
    Object.keys(st).forEach(function (key) { p.set(key, st[key].join(',')); });
    if (sort && sort.value) p.set('sort', sort.value);
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }
  function reset() {
    query = '';
    $$('input[type="checkbox"]', form).forEach(function (i) { i.checked = false; });
    if (sort) sort.value = '';
    apply();
  }

  form.addEventListener('change', function () { apply(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  more.addEventListener('click', function () { shown += STEP; apply(true); });
  $$('[data-flt-reset]').forEach(function (b) { b.addEventListener('click', reset); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setPanel(false);
  });

  // на телефоне фильтры — шторка на весь экран
  function setPanel(on) {
    form.classList.toggle('is-open', on);
    openBtn.setAttribute('aria-expanded', String(on));
    document.documentElement.classList.toggle('flt-lock', on);
  }
  openBtn.addEventListener('click', function () { setPanel(true); });
  $$('[data-flt-close]', form).forEach(function (b) { b.addEventListener('click', function () { setPanel(false); }); });

  apply(true);
})();
