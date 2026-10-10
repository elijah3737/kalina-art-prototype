// KALINA ART — поведение страниц: меню, поиск, лента выставок, «Показать ещё», фото работы, заявка, подписка, cookie.
// Данные из JSON вставляются только через textContent и атрибуты — никакого innerHTML с данными.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function getJSON(url) {
    var cache = getJSON.cache || (getJSON.cache = {});
    if (!cache[url]) {
      cache[url] = fetch(url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error(url + ': ' + r.status);
        return r.json();
      });
    }
    return cache[url];
  }

  // ---------- шапка: меню и поиск ----------
  // На широком экране поле поиска видно всегда; на телефоне его открывает лупа (класс is-search на шапке).
  var hdr = $('[data-hdr]');
  // тонкая шапка: как только страницу прокрутили вниз, шапка становится узкой полосой; у верха — снова полная.
  // Место под шапку (--hdr-full) — высота полной шапки без поиска: сжатие не двигает страницу и не вызывает прыжков.
  if (hdr) {
    var root = document.documentElement;
    var measure = function () {
      var c = hdr.classList.contains('is-compact'), s = hdr.classList.contains('is-search');
      // без анимации: иначе замер берёт промежуточную высоту сжатой шапки
      hdr.classList.add('is-measuring');
      hdr.classList.remove('is-compact', 'is-search');
      root.style.setProperty('--hdr-full', hdr.offsetHeight + 'px');
      if (c) hdr.classList.add('is-compact');
      if (s) hdr.classList.add('is-search');
      void hdr.offsetHeight;
      hdr.classList.remove('is-measuring');
    };
    var compact = function () { hdr.classList.toggle('is-compact', window.scrollY > 80); };
    measure();
    window.addEventListener('resize', measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    window.addEventListener('scroll', compact, { passive: true });
    compact();
  }
  var menuBtn = $('[data-menu-toggle]'), mnav = $('#mnav');
  var searchBtn = $('[data-search-toggle]'), searchForm = $('[data-search]'), searchInput = $('#search-input');
  var out = $('[data-search-results]');

  function setMenu(open) {
    if (!menuBtn || !mnav) return;
    mnav.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  function showResults(show) { if (out) out.hidden = !show; }
  function setSearch(open) {
    if (!hdr || !searchBtn) return;
    hdr.classList.toggle('is-search', open);
    searchBtn.setAttribute('aria-expanded', String(open));
    if (open) { searchInput.focus({ preventScroll: true }); runSearch(); } else showResults(false);
  }
  if (menuBtn) menuBtn.addEventListener('click', function () {
    setSearch(false);
    setMenu(mnav.hidden);
  });
  if (searchBtn) searchBtn.addEventListener('click', function () {
    setMenu(false);
    setSearch(!hdr.classList.contains('is-search'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    setMenu(false);
    if (out && !out.hidden) { showResults(false); return; }
    setSearch(false);
  });
  document.addEventListener('click', function (e) {
    if (searchForm && !searchForm.contains(e.target) && !(searchBtn && searchBtn.contains(e.target))) showResults(false);
  });

  // неразрывный пробел в инициалах («И.\u00A0В.») ищется как обычный
  var norm = function (s) { return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[«»"]/g, '').replace(/\s+/g, ' '); };
  function runSearch() {
    if (!searchInput || !out) return;
    var q = norm(searchInput.value.trim());
    out.textContent = '';
    if (q.length < 2) { showResults(false); return; }
    getJSON('/kalina-art-prototype/data/search.json').then(function (d) {
      if (norm(searchInput.value.trim()) !== q) return;
      var artists = d.artists.filter(function (a) { return norm(a.n).indexOf(q) !== -1; }).slice(0, 6);
      var works = d.works.filter(function (w) { return norm(w.t + ' ' + w.a).indexOf(q) !== -1; }).slice(0, 8);
      out.textContent = '';
      showResults(true);
      if (!artists.length && !works.length) {
        var none = document.createElement('p');
        none.textContent = 'Ничего не нашли. Попробуйте фамилию художника или слово из названия.';
        out.appendChild(none);
        return;
      }
      [['Художники', artists, function (a) { return a.n + ' · ' + a.c; }],
       ['Работы', works, function (w) { return '«' + w.t + '» — ' + w.a; }]].forEach(function (g) {
        if (!g[1].length) return;
        var col = document.createElement('div');
        var h = document.createElement('p');
        h.textContent = g[0];
        col.appendChild(h);
        g[1].forEach(function (x) {
          var a = document.createElement('a');
          a.href = x.u;
          a.textContent = g[2](x);
          col.appendChild(a);
        });
        out.appendChild(col);
      });
    }).catch(function () { out.textContent = 'Поиск временно недоступен.'; showResults(true); });
  }
  if (searchInput) {
    searchInput.addEventListener('input', runSearch);
    searchInput.addEventListener('focus', runSearch);
  }
  // Enter — сразу на первый найденный результат; без JS форма уходит в галерею.
  if (searchForm) searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var first = $('a', out);
    if (first) location.href = first.href; else runSearch();
  });

  // ---------- лента выставок: стрелки ----------
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function syncRail(rail) {
    var max = rail.scrollWidth - rail.clientWidth - 2;
    $$('[data-rail-prev="' + rail.id + '"]').forEach(function (b) { b.disabled = rail.scrollLeft <= 2; });
    $$('[data-rail-next="' + rail.id + '"]').forEach(function (b) { b.disabled = rail.scrollLeft >= max; });
  }
  $$('[data-rail-prev], [data-rail-next]').forEach(function (btn) {
    var rail = document.getElementById(btn.getAttribute('data-rail-prev') || btn.getAttribute('data-rail-next'));
    if (!rail) return;
    var dir = btn.hasAttribute('data-rail-next') ? 1 : -1;
    btn.addEventListener('click', function () {
      var item = rail.firstElementChild;
      var gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
      var step = item ? item.getBoundingClientRect().width + gap : rail.clientWidth * 0.8;
      rail.scrollBy({ left: dir * step, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });
  $$('.rail[id]').forEach(function (rail) {
    syncRail(rail);
    rail.addEventListener('scroll', function () { syncRail(rail); }, { passive: true });
    window.addEventListener('resize', function () { syncRail(rail); });
  });

  // ---------- «Показать ещё» ----------
  var tpl = $('#tpl-card');
  function makeCard(w) {
    var node = tpl.content.firstElementChild.cloneNode(true);
    $$('[data-f=link]', node).forEach(function (a) { a.href = w.u; });
    var img = $('[data-f=img]', node);
    img.src = w.i;
    img.alt = w.alt;
    var artist = $('[data-f=artist]', node);
    artist.href = w.au;
    artist.textContent = w.an;
    var title = $('[data-f=title]', node);
    title.href = w.u;
    title.textContent = w.t;
    $('[data-f=size]', node).textContent = w.s;
    $('[data-f=price]', node).textContent = w.p;
    // поля карточки варианта 4: год, техника, отметка «для примерки»
    var year = $('[data-f=year]', node), tech = $('[data-f=tech]', node), pick = $('[data-pick]', node);
    if (year) year.textContent = w.y ? ', ' + w.y : '';
    if (tech) tech.textContent = w.m ? w.m + ', ' : '';
    if (node.hasAttribute('data-work')) node.setAttribute('data-work', w.id);
    if (pick) { pick.dataset.title = w.t; pick.dataset.artist = w.an; pick.setAttribute('aria-label', 'Отложить для примерки: ' + w.t); }
    return node;
  }
  $$('[data-more]').forEach(function (btn) {
    var grid = btn.parentNode.previousElementSibling;
    var step = Number(grid.dataset.shown) || 12;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      getJSON('/kalina-art-prototype/data/works.json').then(function (all) {
        var list = all.filter(function (w) {
          return (!grid.dataset.artist || w.a === grid.dataset.artist) && w.id !== grid.dataset.exclude;
        });
        var shown = Number(grid.dataset.shown);
        var next = list.slice(shown, shown + step);
        var frag = document.createDocumentFragment();
        next.forEach(function (w) { frag.appendChild(makeCard(w)); });
        grid.appendChild(frag);
        document.dispatchEvent(new CustomEvent('ka:cards-added'));
        grid.dataset.shown = String(shown + next.length);
        btn.disabled = false;
        if (shown + next.length >= list.length) btn.parentNode.hidden = true;
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = 'Не загрузилось — ещё раз';
      });
    });
  });

  // ---------- фото на странице работы ----------
  var main = $('[data-main]');
  $$('[data-thumb]').forEach(function (b) {
    b.addEventListener('click', function () {
      main.src = b.dataset.thumb;
      $$('[data-thumb]').forEach(function (x) { x.classList.toggle('is-current', x === b); });
    });
  });

  // ---------- заявка ----------
  var dlg = $('#lead');
  // note — пояснение под заголовком вместо темы, когда тема повторяет заголовок; тема всё равно уходит с заявкой
  function openLead(subject, title, note) {
    var form = $('form', dlg);
    resetForm(form);
    $('#lead-title').textContent = title || 'Заявка';
    var sub = $('[data-lead-subject]', dlg);
    sub.textContent = note || subject || '';
    sub.hidden = !(note || subject);
    form.elements.subject.value = subject || '';
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    form.elements.name.focus({ preventScroll: true });
  }
  function closeLead() { if (dlg.open) { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); } }
  $$('[data-lead]').forEach(function (b) {
    b.addEventListener('click', function () { openLead(b.dataset.lead, b.dataset.leadTitle, b.dataset.leadNote); });
  });
  if (dlg) {
    $('[data-lead-close]', dlg).addEventListener('click', closeLead);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeLead(); });
  }

  function msg(form, text, isError) {
    var m = $('[data-msg]', form);
    m.textContent = text;
    m.hidden = !text;
    m.classList.toggle('is-error', !!isError);
  }
  function resetForm(form) {
    form.reset();
    $$('.is-invalid', form).forEach(function (el) { el.classList.remove('is-invalid'); });
    $$('input, textarea, button', form).forEach(function (el) { el.disabled = false; });
    msg(form, '');
  }
  function validate(form, fields) {
    var bad = fields.filter(function (n) {
      var el = form.elements[n];
      var ok = el.type === 'checkbox' ? el.checked
        : el.type === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim())
        : el.type === 'tel' ? el.value.replace(/\D/g, '').length >= 10
        : el.value.trim() !== '';
      el.classList.toggle('is-invalid', !ok);
      el.setAttribute('aria-invalid', String(!ok));
      return !ok;
    });
    if (bad.length) form.elements[bad[0]].focus();
    return bad;
  }
  var NAMES = { name: 'имя', phone: 'телефон', email: 'email', consent: 'согласие на обработку данных' };
  $$('[data-lead-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = ['name', 'phone', 'consent'];
      if (form.elements.email.value.trim()) fields.push('email');
      var bad = validate(form, fields);
      if (bad.length) { msg(form, 'Проверьте: ' + bad.map(function (n) { return NAMES[n]; }).join(', ') + '.', true); return; }
      // Прототип: отправку на почту подключим на этапе разработки (api/lead.php).
      $$('input, textarea, button', form).forEach(function (el) { el.disabled = true; });
      msg(form, 'Спасибо! Татьяна свяжется с вами по телефону или в мессенджере.');
    });
  });
  $$('[data-subscribe]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = validate(form, ['email', 'consent']);
      if (bad.length) { msg(form, 'Проверьте: ' + bad.map(function (n) { return NAMES[n]; }).join(', ') + '.', true); return; }
      $$('input, button', form).forEach(function (el) { el.disabled = true; });
      msg(form, 'Готово — напишем, когда появятся новые картины.');
    });
  });

  // ---------- cookie ----------
  var cookie = $('#cookie');
  var seen = false;
  try { seen = localStorage.getItem('ka_cookie_ok') === '1'; } catch (err) { /* приватный режим */ }
  if (cookie && !seen) cookie.hidden = false;
  var ok = $('[data-cookie-ok]');
  if (ok) ok.addEventListener('click', function () {
    cookie.hidden = true;
    try { localStorage.setItem('ka_cookie_ok', '1'); } catch (err) { /* не страшно */ }
  });
})();
