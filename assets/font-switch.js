/* Прототип: переключатель шрифта сайта PT Root ⇄ DIN Pro. Выбор помнится между страницами (localStorage).
 * Файлов DIN Pro у нас нет: он показывается, только если установлен на устройстве — тогда об этом подсказка. */
(function () {
  var KEY = 'ka_font', root = document.documentElement;
  var names = { pt: 'PT Root', din: 'DIN Pro' };

  // есть ли DIN Pro на устройстве: ширина строки с ним отличается от запасного моноширинного
  function hasDin() {
    try {
      var x = document.createElement('canvas').getContext('2d'), s = 'Картина в интерьере 0123';
      x.font = '32px monospace'; var base = x.measureText(s).width;
      return ['"DIN Pro"', 'DINPro', '"DIN Pro Regular"'].some(function (f) { x.font = '32px ' + f + ', monospace'; return x.measureText(s).width !== base; });
    } catch (e) { return true; }
  }

  var box = document.createElement('div'); box.className = 'fontsw';
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fontsw__btn';
  var note = document.createElement('p'); note.className = 'fontsw__note'; note.hidden = true;
  note.textContent = 'DIN Pro не установлен на этом устройстве — браузер показывает PT Root. Чтобы DIN Pro видели все, нужны файлы шрифта.';
  box.appendChild(note); box.appendChild(btn);

  function render() {
    var cur = root.getAttribute('data-font') === 'din' ? 'din' : 'pt', next = cur === 'din' ? 'pt' : 'din';
    btn.textContent = '';
    btn.append('Шрифт: ');
    var b = document.createElement('b'); b.textContent = names[cur]; btn.appendChild(b);
    btn.append(' → ' + names[next]);
    btn.setAttribute('aria-label', 'Шрифт сайта: ' + names[cur] + '. Переключить на ' + names[next]);
    note.hidden = !(cur === 'din' && !hasDin());
  }
  btn.addEventListener('click', function () {
    var din = root.getAttribute('data-font') !== 'din';
    if (din) root.setAttribute('data-font', 'din'); else root.removeAttribute('data-font');
    try { localStorage.setItem(KEY, din ? 'din' : 'pt'); } catch (e) {}
    render();
  });
  render();
  document.body.appendChild(box);
})();
