// Журнал: вкладки рубрик (?r=Выставки) прячут чужие карточки; крупная первая карточка тоже подчиняется рубрике. Без JS видны все статьи.
(function () {
  'use strict';
  var root = document.querySelector('[data-journal]');
  if (!root) return;
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-rubric-tab]'));
  var cards = Array.prototype.slice.call(root.querySelectorAll('.post5c'));
  function show(r) {
    tabs.forEach(function (t) { var on = t.getAttribute('data-rubric-tab') === r; t.classList.toggle('is-current', on); if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
    cards.forEach(function (c) { c.hidden = !!r && c.getAttribute('data-rubric') !== r; });
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function (e) {
      e.preventDefault();
      var r = t.getAttribute('data-rubric-tab');
      history.replaceState(null, '', location.pathname + (r ? '?r=' + encodeURIComponent(r) : ''));
      show(r);
    });
  });
  show(new URLSearchParams(location.search).get('r') || '');
})();
