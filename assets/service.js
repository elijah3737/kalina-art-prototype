// Услуга, «Подбор за минуту»: «Показать работы» открывает галерею с выбранными фильтрами (?pomeshchenie=…&interer=…&cena=…),
// «Отправить Татьяне» подставляет выбор в тему заявки — общий диалог заявки читает data-lead при клике.
(function () {
  'use strict';
  var form = document.querySelector('[data-quick]');
  if (!form) return;
  var lead = form.querySelector('[data-quick-lead]'), base = lead.getAttribute('data-lead');
  function picked() {
    var st = {};
    Array.prototype.forEach.call(form.querySelectorAll('input:checked'), function (i) { (st[i.name] = st[i.name] || []).push(i.value); });
    return st;
  }
  function sync() {
    var st = picked(), parts = [];
    Object.keys(st).forEach(function (k) { parts.push(st[k].join(', ')); });
    lead.setAttribute('data-lead', base + (parts.length ? ': ' + parts.join('; ') : ''));
  }
  form.addEventListener('change', sync);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var st = picked(), p = new URLSearchParams();
    Object.keys(st).forEach(function (k) { p.set(k, st[k].join(',')); });
    var qs = p.toString();
    location.href = '/kalina-art-prototype/galereya/' + (qs ? '?' + qs : '');
  });
  sync();
})();
