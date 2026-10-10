/* Примерка «картина в интерьере». Грузится по первому клику на [data-room] (site.js), данные о картине берёт из кнопки:
   data-room-img (фото), data-room-w / -h (см), -t, -a, -s (стили интерьера), -start (комната).
   Комнаты — /data/interiors.json: size — размер фона, px_per_cm — масштаб на плоскости стены, hang — [центр x, низ картины y],
   wall — [x1, y1, x2, y2] куда можно двигать, shadow — [dx, dy, размытие, прозрачность]; всё в пикселях фона.
   «Своя стена»: фото не покидает браузер — уменьшаем до 2000 px, масштаб по двум точкам на предмете известной ширины. */
(function () {
  'use strict';
  var MAX_OWN = 2000;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var rooms = null, art = null, scene = null, own = null, dlg, el = {};

  var ICON = {
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  function icon(n) {
    return '<svg class="ic" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cm(n) { return String(n).replace('.', ','); }

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'room';
    dlg.setAttribute('aria-labelledby', 'room-h');
    dlg.innerHTML =
      '<div class="room__bar"><div class="room__head"><p class="room__h" id="room-h">Картина в интерьере</p><p class="room__sub" data-r="sub"></p></div>' +
      '<button class="room__x" type="button" data-r="close" aria-label="Закрыть">' + icon('close') + '</button></div>' +
      '<div class="room__body" data-r="body"><div class="room__stage" data-r="stage">' +
      '<img class="room__bg" data-r="bg" alt="" draggable="false">' +
      '<div class="room__art" data-r="art" tabindex="0" role="img"><img data-r="artimg" alt="" crossorigin="anonymous" draggable="false"></div>' +
      '<svg class="room__marks" data-r="marks" aria-hidden="true"></svg></div></div>' +
      '<div class="room__panel" data-r="panel">' +
      '<p class="room__note" data-r="note"></p>' +
      '<div class="room__calib" data-r="calib" hidden>' +
      '<p class="room__step">Отметьте на фото два края предмета известной ширины и укажите его ширину.</p>' +
      '<div class="room__known"><button type="button" class="room__chip" data-cm="80">Дверь — 80 см</button><button type="button" class="room__chip" data-cm="29.7">Лист А4 — 29,7 см</button>' +
      '<label class="room__cm">Ширина, см <input type="number" inputmode="decimal" min="1" max="2000" step="0.1" data-r="cm"></label></div>' +
      '<div class="room__calib-acts"><button type="button" class="btn btn--small" data-r="apply" disabled>Применить масштаб</button>' +
      '<button type="button" class="btn btn--ghost btn--small" data-r="skip">Без отметки</button><button type="button" class="room__link" data-r="reset" hidden>Отметить заново</button></div></div>' +
      '<label class="room__size" data-r="sizewrap" hidden>Размер картины на фото <input type="range" min="0.3" max="3" step="0.01" value="1" data-r="size"></label>' +
      '</div>' +
      '<div class="room__strip" data-r="strip" role="group" aria-label="Комнаты"></div>' +
      '<div class="room__acts"><button type="button" class="btn btn--small" data-r="dl">Скачать картинку</button>' +
      '<button type="button" class="btn btn--ghost btn--small" data-r="ask" data-lead-title="Спросить Татьяну">Спросить Татьяну<span class="room__wide"> об этой работе</span></button>' +
      '<p class="room__msg" data-r="msg" role="status"></p></div>' +
      '<input type="file" accept="image/*" data-r="file" hidden>';
    document.body.appendChild(dlg);
    Array.prototype.forEach.call(dlg.querySelectorAll('[data-r]'), function (n) { el[n.dataset.r] = n; });

    el.close.addEventListener('click', function () { dlg.close(); });
    el.dl.addEventListener('click', download);
    el.file.addEventListener('change', function () { if (el.file.files[0]) loadOwn(el.file.files[0]); el.file.value = ''; });
    el.size.addEventListener('input', function () { if (scene) { scene.k = Number(el.size.value); if (scene.own) own.k = scene.k; place(); } });
    el.cm.addEventListener('input', syncApply);
    dlg.querySelectorAll('[data-cm]').forEach(function (b) {
      b.addEventListener('click', function () { el.cm.value = b.dataset.cm; syncApply(); });
    });
    el.apply.addEventListener('click', applyCalib);
    el.skip.addEventListener('click', function () { endCalib(); note(); });
    el.reset.addEventListener('click', startCalib);
    el.stage.addEventListener('pointerdown', markPoint);
    dragArt();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(el.body);
    window.addEventListener('resize', fit);
  }

  function strip() {
    var pref = art.styles;
    var list = rooms.slice().sort(function (a, b) { return (pref.indexOf(a.style) === -1) - (pref.indexOf(b.style) === -1); });
    el.strip.innerHTML = list.map(function (r) {
      return '<button type="button" class="room__pick" data-id="' + esc(r.id) + '" aria-pressed="false"><img src="' + esc(r.thumb) + '" alt="" loading="lazy"><span>' + esc(r.title) + '</span></button>';
    }).join('') + '<button type="button" class="room__pick room__pick--own" data-id="own" aria-pressed="false"><span class="room__own-ic">' + icon('plus') + '</span><span>Своя стена</span></button>';
    el.strip.querySelectorAll('[data-id]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.id !== 'own') return show(b.dataset.id);
        if (own) show('own'); else el.file.click();
      });
    });
  }

  // ---------- сцена ----------
  function show(id) {
    var r = id === 'own' ? own : rooms.filter(function (x) { return x.id === id; })[0] || rooms[0];
    scene = {
      id: r.id, title: r.title, src: r.img, W: r.size[0], H: r.size[1], ppc: r.px_per_cm, wall: r.wall, shadow: r.shadow,
      floor: id === 'own' ? r.wall[3] : Math.min(r.wall[3], r.hang[1]), cx: r.hang[0], by: r.hang[1], k: r.k || 1, own: id === 'own'
    };
    el.strip.querySelectorAll('[data-id]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === (id === 'own' ? 'own' : r.id))); });
    el.stage.style.setProperty('--ar', scene.W / scene.H);
    // пока грузится новый фон, картину не показываем — иначе она мелькнёт на старой комнате в новом месте
    if (el.bg.getAttribute('src') !== scene.src) {
      el.stage.classList.add('is-loading');
      el.bg.onload = el.bg.onerror = function () { el.stage.classList.remove('is-loading'); };
      el.bg.src = scene.src;
    }
    el.sizewrap.hidden = !(scene.own && own.approx);
    el.size.value = scene.k;
    el.calib.hidden = true;
    el.marks.innerHTML = '';
    el.stage.classList.remove('is-calib');
    msg('');
    fit();
    place();
    note();
  }

  function note() {
    var t;
    if (!scene.own) t = 'Картина в реальном размере. Её можно передвинуть по стене.';
    else if (own.approx) t = 'Масштаб примерный: подгоните размер ползунком или <button type="button" class="room__link" data-act="calib">отметьте предмет известной ширины</button>.';
    else t = 'Масштаб по вашей отметке. Картину можно передвинуть.';
    if (scene.own) t += ' Фото остаётся на вашем устройстве и не загружается на сайт. <button type="button" class="room__link" data-act="file">Другое фото</button>';
    el.note.innerHTML = t;
    var c = el.note.querySelector('[data-act=calib]'), f = el.note.querySelector('[data-act=file]');
    if (c) c.addEventListener('click', startCalib);
    if (f) f.addEventListener('click', function () { el.file.click(); });
  }

  // размер сцены — вписываем фон в свободное место окна целиком
  function fit() {
    if (!scene || !dlg.open) return;
    var cs = getComputedStyle(el.body);
    var bw = el.body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var ar = scene.W / scene.H, w = Math.min(bw, el.body.clientHeight * ar);
    el.stage.style.width = Math.max(0, Math.floor(w)) + 'px';
    place();
  }

  function size() {
    return { w: art.w * scene.ppc * scene.k, h: art.h * scene.ppc * scene.k };
  }
  function clamp() {
    var s = size(), wl = scene.wall;
    var minX = wl[0] + s.w / 2, maxX = wl[2] - s.w / 2;
    scene.cx = minX > maxX ? (wl[0] + wl[2]) / 2 : Math.min(maxX, Math.max(minX, scene.cx));
    var minB = wl[1] + s.h, maxB = scene.floor;
    scene.by = minB > maxB ? minB : Math.min(maxB, Math.max(minB, scene.by));
  }
  function place() {
    if (!scene) return;
    clamp();
    var s = size(), st = el.art.style;
    st.left = (scene.cx - s.w / 2) / scene.W * 100 + '%';
    st.top = (scene.by - s.h) / scene.H * 100 + '%';
    st.width = s.w / scene.W * 100 + '%';
    st.height = s.h / scene.H * 100 + '%';
    var px = (el.stage.clientWidth || scene.W) / scene.W, sh = scene.shadow;
    st.boxShadow = (sh[0] * px).toFixed(1) + 'px ' + (sh[1] * px).toFixed(1) + 'px ' + (sh[2] * px).toFixed(1) + 'px rgba(0,0,0,' + sh[3] + ')';
  }

  // ---------- перетаскивание: мышь, палец, стрелки ----------
  function dragArt() {
    var start = null;
    el.art.addEventListener('pointerdown', function (e) {
      if (el.stage.classList.contains('is-calib')) return;
      e.preventDefault();
      el.art.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, cx: scene.cx, by: scene.by };
      el.art.classList.add('is-drag');
    });
    el.art.addEventListener('pointermove', function (e) {
      if (!start) return;
      var f = scene.W / el.stage.clientWidth;
      scene.cx = start.cx + (e.clientX - start.x) * f;
      scene.by = start.by + (e.clientY - start.y) * f;
      place();
    });
    var stop = function () { start = null; el.art.classList.remove('is-drag'); };
    el.art.addEventListener('pointerup', stop);
    el.art.addEventListener('pointercancel', stop);
    el.art.addEventListener('keydown', function (e) {
      var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      var step = 5 * scene.ppc; // 5 см
      scene.cx += d[0] * step;
      scene.by += d[1] * step;
      place();
    });
  }

  // ---------- своя стена ----------
  function loadOwn(file) {
    msg('Открываем фото…');
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      // браузер сам поворачивает снимок по EXIF и при показе, и при drawImage
      var k = Math.min(1, MAX_OWN / Math.max(img.naturalWidth, img.naturalHeight));
      var W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.getContext('2d').drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      c.toBlob(function (blob) {
        if (own && own.img) URL.revokeObjectURL(own.img);
        // по умолчанию картина — около пятой части ширины кадра, масштаб примерный
        own = {
          id: 'own', title: 'Своя стена', img: URL.createObjectURL(blob), size: [W, H], px_per_cm: W * 0.22 / Math.max(art.w, 1),
          hang: [W / 2, H * 0.55], wall: [0, 0, W, H], shadow: [W * 0.003, W * 0.005, W * 0.01, 0.3], approx: true, k: 1
        };
        show('own');
        startCalib();
      }, 'image/jpeg', 0.9);
    };
    img.onerror = function () { URL.revokeObjectURL(url); msg('Не удалось открыть фото. Попробуйте JPEG или PNG.'); };
    img.src = url;
  }

  var marks = [];
  function startCalib() {
    marks = [];
    el.marks.innerHTML = '';
    el.calib.hidden = false;
    el.reset.hidden = true;
    el.sizewrap.hidden = true;
    el.stage.classList.add('is-calib');
    el.note.textContent = 'Нажмите на фото два раза: на левый и на правый край предмета. Фото остаётся на вашем устройстве.';
    syncApply();
  }
  function endCalib() {
    el.calib.hidden = true;
    el.stage.classList.remove('is-calib');
    el.marks.innerHTML = '';
    el.sizewrap.hidden = !own.approx;
  }
  function markPoint(e) {
    if (!el.stage.classList.contains('is-calib')) return;
    var b = el.stage.getBoundingClientRect(), f = scene.W / b.width;
    if (marks.length === 2) marks = [];
    marks.push([(e.clientX - b.left) * f, (e.clientY - b.top) * f]);
    el.marks.setAttribute('viewBox', '0 0 ' + scene.W + ' ' + scene.H);
    var r = scene.W / 120;
    el.marks.innerHTML = (marks.length === 2 ? '<line x1="' + marks[0][0] + '" y1="' + marks[0][1] + '" x2="' + marks[1][0] + '" y2="' + marks[1][1] + '" stroke-width="' + r / 3 + '"/>' : '') +
      marks.map(function (m) { return '<circle cx="' + m[0] + '" cy="' + m[1] + '" r="' + r + '"/>'; }).join('');
    el.reset.hidden = marks.length === 0;
    syncApply();
  }
  function syncApply() {
    var v = parseFloat(String(el.cm.value).replace(',', '.'));
    el.apply.disabled = !(marks.length === 2 && v > 0);
  }
  function applyCalib() {
    var v = parseFloat(String(el.cm.value).replace(',', '.'));
    var d = Math.hypot(marks[1][0] - marks[0][0], marks[1][1] - marks[0][1]);
    if (!(v > 0) || d < 4) return;
    own.px_per_cm = scene.ppc = d / v;
    own.approx = false;
    own.k = scene.k = 1;
    endCalib();
    place();
    note();
  }

  // ---------- «Скачать»: фон + тень + картина + подпись ----------
  function loadImg(src, cors) {
    return new Promise(function (ok, fail) {
      var i = new Image();
      if (cors) i.crossOrigin = 'anonymous';
      i.onload = function () { ok(i); };
      i.onerror = fail;
      i.src = src;
    });
  }
  function download() {
    msg('Готовим картинку…');
    Promise.all([loadImg(scene.src, false), loadImg(art.img, true)]).then(function (im) {
      var W = scene.W, H = scene.H, cap = Math.round(W * 0.04);
      var c = document.createElement('canvas');
      c.width = W; c.height = H + cap;
      var x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, W, H + cap);
      x.drawImage(im[0], 0, 0, W, H);
      clamp();
      var s = size(), sh = scene.shadow;
      x.save();
      x.shadowOffsetX = sh[0]; x.shadowOffsetY = sh[1]; x.shadowBlur = sh[2]; x.shadowColor = 'rgba(0,0,0,' + sh[3] + ')';
      x.drawImage(im[1], scene.cx - s.w / 2, scene.by - s.h, s.w, s.h);
      x.restore();
      x.fillStyle = '#1a1a1a';
      x.font = Math.round(cap * 0.42) + 'px "PT Root UI", Arial, sans-serif';
      x.textBaseline = 'middle';
      x.fillText(caption() + (scene.own && own.approx ? ' · масштаб примерный' : ''), cap * 0.5, H + cap / 2);
      x.textAlign = 'right';
      x.fillText('kalina.art', W - cap * 0.5, H + cap / 2);
      c.toBlob(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'kalina-art-' + (art.t || 'kartina').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '') + '-' + scene.id + '.jpg';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        msg('Картинка сохранена.');
      }, 'image/jpeg', 0.9);
    }).catch(function () { msg('Не получилось собрать картинку. Попробуйте ещё раз.'); });
  }

  function caption() { return '«' + art.t + '», ' + art.a + ' · ' + cm(art.w) + '\u00a0×\u00a0' + cm(art.h) + '\u00a0см'; }
  function msg(t) { el.msg.textContent = t; }

  function getRooms() {
    if (rooms) return Promise.resolve(rooms);
    return fetch('/kalina-art-prototype/data/interiors.json', { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (d) { rooms = d; return d; });
  }

  function open(btn) {
    var d = btn.dataset;
    getRooms().then(function () {
      if (!dlg) build();
      var same = art && art.img === d.roomImg;
      art = { img: d.roomImg, w: Number(d.roomW), h: Number(d.roomH), t: d.roomT || '', a: d.roomA || '', styles: (d.roomS || '').split('|').filter(Boolean) };
      if (own && !same) own.px_per_cm = own.approx ? own.size[0] * 0.22 / art.w : own.px_per_cm;
      el.artimg.src = art.img;
      el.art.setAttribute('aria-label', caption() + '. Стрелки двигают картину по стене');
      el.sub.textContent = caption();
      el.ask.setAttribute('data-lead', '«' + art.t + '», ' + art.a + ' — примерка в интерьере');
      strip();
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      show(d.roomStart || el.strip.querySelector('[data-id]').dataset.id);
      el.close.focus({ preventScroll: true });
    }).catch(function () { alert('Примерка временно недоступна. Обновите страницу.'); });
  }

  window.kaRoom = { open: open };
})();
