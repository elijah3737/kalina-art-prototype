/* Прототип: панель вариантов внизу слева, как у Joy — «Варианты» открывает панель, в ней кнопки «PT Root» и «DIN Pro»,
 * выбранная залита. Выбор и открытость панели помнятся между страницами (localStorage).
 * Файлов DIN Pro у нас нет: он виден, только если установлен на устройстве — иначе в панели предупреждение. */
(function () {
  var root = document.documentElement;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  // есть ли DIN Pro на устройстве: ширина строки с ним отличается от запасного моноширинного
  function hasDin() {
    try {
      var x = document.createElement('canvas').getContext('2d'), s = 'Картина в интерьере 0123';
      x.font = '32px monospace'; var base = x.measureText(s).width;
      return ['"DIN Pro"', 'DINPro', '"DIN Pro Regular"'].some(function (f) { x.font = '32px ' + f + ', monospace'; return x.measureText(s).width !== base; });
    } catch (e) { return true; }
  }

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }

  var box = el('aside', 'vpanel'); box.setAttribute('aria-label', 'Варианты дизайна');
  var toggle = el('button', 'vpanel__toggle'); toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'vpanel-body');
  toggle.appendChild(el('span', 'vpanel__dot')); toggle.appendChild(el('span', '', 'Варианты')); toggle.appendChild(el('span', 'vpanel__chev'));
  var body = el('div', 'vpanel__body'); body.id = 'vpanel-body'; body.hidden = true;

  var label = el('p', 'vpanel__label', 'Шрифт сайта'); label.id = 'vp-font';
  var opts = el('div', 'vpanel__opts'); opts.setAttribute('role', 'group'); opts.setAttribute('aria-labelledby', 'vp-font');
  var btns = [['pt', 'PT Root — как сейчас'], ['din', 'DIN Pro']].map(function (o) {
    var b = el('button', '', o[1]); b.type = 'button'; b.dataset.val = o[0]; opts.appendChild(b); return b;
  });
  var hint = el('p', 'vpanel__hint', 'Нажмите — шрифт на всём сайте меняется сразу и сохраняется при переходе по страницам.');
  var warn = el('p', 'vpanel__warn', 'DIN Pro не установлен на этом устройстве, поэтому браузер показывает PT Root и разницы не видно. Чтобы DIN Pro видели все, нужны файлы шрифта.');
  [label, opts, hint, warn].forEach(function (n) { body.appendChild(n); });
  box.appendChild(toggle); box.appendChild(body);

  function sync() {
    var cur = root.getAttribute('data-font') === 'din' ? 'din' : 'pt';
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.val === cur)); });
    warn.hidden = !(cur === 'din' && !hasDin());
  }
  btns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.val === 'din') root.setAttribute('data-font', 'din'); else root.removeAttribute('data-font');
      store.set('ka_font', b.dataset.val);
      sync();
    });
  });
  function setPanel(open, save) {
    toggle.setAttribute('aria-expanded', String(open)); body.hidden = !open;
    if (save) store.set('ka_vpanel', open ? '1' : '0');
  }
  toggle.addEventListener('click', function () { setPanel(toggle.getAttribute('aria-expanded') !== 'true', true); });
  body.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setPanel(false, true); toggle.focus(); } });

  setPanel(store.get('ka_vpanel') === '1', false);
  // пока видна плашка cookie (тоже внизу слева), панель стоит над ней
  var cookie = document.getElementById('cookie');
  function lift() {
    box.style.bottom = cookie && !cookie.hidden ? 'calc(' + Math.ceil(cookie.getBoundingClientRect().height) + 'px + 2 * var(--space-md))' : '';
  }
  if (cookie) {
    new MutationObserver(lift).observe(cookie, { attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('resize', lift);
    setTimeout(lift, 0);
  }
  sync();
  document.body.appendChild(box);
})();
