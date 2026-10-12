/* Примерка «картина в интерьере». Грузится по первому клику на [data-room] или выбору фото в [data-room-own] (site.js).
   Данные о картине — из кнопки: data-room-img (фото), data-room-w / -h (см), -t, -a, -s (стили интерьера), -start (комната).

   Модель: у каждой сцены есть проекция H «плоскость стены в сантиметрах → пиксели фона». Картина — прямоугольник
   на стене (центр в см, размер в см), её углы проецируются через H; на экране — CSS matrix3d, в «Скачать» — сетка треугольников.
   - Комнаты (/data/interiors.json): H — просто масштаб px_per_cm; wall — где можно двигать, hang — [центр x, низ картины y], в px фона.
   - Своя стена: фото не покидает браузер (уменьшаем до 2000 px). Человек ставит 4 уголка на углы предмета известного
     размера на стене (лист А4, дверь, свой) — по ним считается H, и картина встаёт в настоящем размере и в перспективе стены.
     Лист А4 — ещё и метка места: картина встаёт центром на него. Без отметки — масштаб примерный, размер ползунком.
     Яркость картины подстраивается под освещённость стены на фото. */
(function () {
  'use strict';
  var MAX_OWN = 2000;
  var REFS = {
    a4: { w: 21, h: 29.7, label: 'Лист А4', hint: 'Приклейте лист А4 на стену туда, где хотите видеть картину, и сфотографируйте стену. Перетащите 4 уголка на углы листа.' },
    door: { w: 80, h: 200, label: 'Дверь', hint: 'Перетащите 4 уголка на углы двери (полотна без наличников). Обычная дверь — 80 × 200 см; если другая, укажите размер.' },
    custom: { w: 0, h: 0, label: 'Свой предмет', hint: 'Выберите плоский предмет на стене — рамку, зеркало, телевизор, окно. Укажите его ширину и высоту и перетащите уголки на его углы.' }
  };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var rooms = null, art = null, scene = null, own = null, dlg, el = {}, calib = null;

  var ICON = { close: '<path d="m6 6 12 12M18 6 6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>' };
  function icon(n) {
    return '<svg class="ic" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cm(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function num(v) { return parseFloat(String(v).replace(',', '.')); }

  // ---------- проекция по 4 точкам ----------
  // H = [a,b,c,d,e,f,g,h] (i = 1): (x, y) → ((a x + b y + c) / w, (d x + e y + f) / w), w = g x + h y + 1
  function homography(src, dst) {
    var A = [], B = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], u = dst[i][0], v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
    }
    return gauss(A, B);
  }
  function gauss(A, B) {
    var n = B.length, i, j, k;
    for (i = 0; i < n; i++) A[i].push(B[i]);
    for (i = 0; i < n; i++) {
      var p = i;
      for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
      var t = A[i]; A[i] = A[p]; A[p] = t;
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (j = i + 1; j < n; j++) {
        var f = A[j][i] / A[i][i];
        for (k = i; k <= n; k++) A[j][k] -= f * A[i][k];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = A[i][n];
      for (j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }
  function apply(H, p) {
    var w = H[6] * p[0] + H[7] * p[1] + 1;
    return [(H[0] * p[0] + H[1] * p[1] + H[2]) / w, (H[3] * p[0] + H[4] * p[1] + H[5]) / w];
  }
  function invert(H) {
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    // присоединённая матрица, нормированная так, чтобы последний элемент был 1
    var m = [e - f * h, c * h - b, b * f - c * e, f * g - d, a - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
    return m.slice(0, 8).map(function (v) { return v / m[8]; });
  }
  function scaleH(k) { return [k, 0, 0, 0, k, 0, 0, 0]; }
  // линейное приближение проекции в точке c (первый член разложения): масштаб, поворот и сжатие стены без схождения линий.
  // Нужна, когда картина намного больше отмеченного предмета: ошибка уголка в пиксель на маленьком листе
  // при полной перспективе разрастается на всю картину, а линейная — остаётся пропорциональной.
  function localAffine(H, c) {
    var w = H[6] * c[0] + H[7] * c[1] + 1, p = apply(H, c);
    var j00 = (H[0] - p[0] * H[6]) / w, j01 = (H[1] - p[0] * H[7]) / w, j10 = (H[3] - p[1] * H[6]) / w, j11 = (H[4] - p[1] * H[7]) / w;
    return [j00, j01, p[0] - j00 * c[0] - j01 * c[1], j10, j11, p[1] - j10 * c[0] - j11 * c[1], 0, 0];
  }
  function convex(q) {
    var sign = 0;
    for (var i = 0; i < 4; i++) {
      var a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
      var z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(z) < 1e-6) return false;
      if (sign && (z > 0) !== (sign > 0)) return false;
      sign = z;
    }
    return true;
  }

  // ---------- окно ----------
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'room';
    dlg.setAttribute('aria-labelledby', 'room-h');
    dlg.innerHTML =
      '<div class="room__bar"><div class="room__head"><p class="room__h" id="room-h">Картина в интерьере</p><p class="room__sub" data-r="sub"></p></div>' +
      '<button class="room__x" type="button" data-r="close" aria-label="Закрыть">' + icon('close') + '</button></div>' +
      '<div class="room__body" data-r="body"><div class="room__stage" data-r="stage">' +
      '<img class="room__bg" data-r="bg" alt="" draggable="false">' +
      '<div class="room__art" data-r="art" tabindex="0" role="img"><img data-r="artimg" alt="" crossorigin="anonymous" draggable="false"><i class="room__shade" data-r="shade"></i></div>' +
      '<svg class="room__quad" data-r="quad" aria-hidden="true"><polygon data-r="poly"/></svg>' +
      '<div class="room__handles" data-r="handles"></div>' +
      '<canvas class="room__loupe" data-r="loupe" width="240" height="240" hidden></canvas></div></div>' +
      '<div class="room__panel" data-r="panel">' +
      '<p class="room__note" data-r="note"></p>' +
      '<div class="room__calib" data-r="calib" hidden>' +
      '<div class="room__known" role="group" aria-label="Предмет известного размера" data-r="refs">' +
      Object.keys(REFS).map(function (k) { return '<button type="button" class="room__chip" data-ref="' + k + '" aria-pressed="false">' + REFS[k].label + (REFS[k].w ? ' <span class="room__chip-s">' + cm(REFS[k].w) + ' × ' + cm(REFS[k].h) + '</span>' : '') + '</button>'; }).join('') +
      '<button type="button" class="room__chip" data-ref="none">Без отметки</button></div>' +
      '<p class="room__step" data-r="step"></p>' +
      '<div class="room__calib-acts"><span class="room__dims" data-r="dims" hidden><label class="room__cm">Ширина, см <input type="text" inputmode="decimal" data-r="rw"></label>' +
      '<label class="room__cm">Высота, см <input type="text" inputmode="decimal" data-r="rh"></label></span>' +
      '<button type="button" class="btn btn--small" data-r="done" disabled>Готово</button></div><p class="room__warn" data-r="warn"></p></div>' +
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
    el.refs.querySelectorAll('[data-ref]').forEach(function (b) { b.addEventListener('click', function () { pickRef(b.dataset.ref); }); });
    [el.rw, el.rh].forEach(function (i) { i.addEventListener('input', syncDone); });
    el.done.addEventListener('click', finishCalib);
    dragArt();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(el.body);
    window.addEventListener('resize', fit);
  }

  function strip() {
    var pref = art.styles;
    var list = rooms.slice().sort(function (a, b) { return (pref.indexOf(a.style) === -1) - (pref.indexOf(b.style) === -1); });
    el.strip.innerHTML = list.map(function (r) {
      return '<button type="button" class="room__pick" data-id="' + esc(r.id) + '" aria-pressed="false"><img src="' + esc(r.thumb) + '" alt="" loading="lazy"><span>' + esc(r.title) + '</span></button>';
    }).join('') + '<button type="button" class="room__pick room__pick--own" data-id="own" aria-pressed="false">' +
      (own ? '<img src="' + esc(own.img) + '" alt="">' : '<span class="room__own-ic">' + icon('plus') + '</span>') + '<span>Своя стена</span></button>';
    el.strip.querySelectorAll('[data-id]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.id !== 'own') return show(b.dataset.id);
        if (own) show('own'); else el.file.click();
      });
    });
  }

  // ---------- сцена ----------
  function show(id) {
    var prev = scene;
    if (id === 'own' && own) {
      scene = { id: 'own', title: 'Своя стена', src: own.img, W: own.W, H: own.H, own: true, shadow: own.shadow, k: own.k };
      setOwnH();
      scene.c = own.pos ? own.pos.slice() : defaultPos();
    } else {
      var r = rooms.filter(function (x) { return x.id === id; })[0] || rooms[0];
      var p = r.px_per_cm;
      scene = {
        id: r.id, title: r.title, src: r.img, W: r.size[0], H: r.size[1], own: false, shadow: r.shadow, k: 1,
        Hm: scaleH(p), Hi: scaleH(1 / p),
        // границы в см: где можно двигать картину; низ — не ниже линии развески (над мебелью)
        box: [r.wall[0] / p, r.wall[1] / p, r.wall[2] / p, Math.min(r.wall[3], r.hang[1]) / p],
        c: [r.hang[0] / p, Math.max(r.hang[1], r.wall[1] + art.h * p) / p - art.h / 2]
      };
    }
    el.strip.querySelectorAll('[data-id]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === scene.id)); });
    var next = scene, token = ++showToken;
    if (el.bg.getAttribute('src') !== next.src && (next.own || !prev)) {
      // своё фото (уже в памяти) и первое открытие: картину прячем, пока фон не загрузится
      el.stage.classList.add('is-loading');
      el.bg.onload = el.bg.onerror = function () { el.stage.classList.remove('is-loading'); light(); };
      el.bg.src = next.src;
    } else if (el.bg.getAttribute('src') !== next.src) {
      // новый фон сначала грузим и декодируем в памяти, а меняем комнату, пропорции и место картины одним кадром:
      // иначе картина прыгала на новое место поверх старой комнаты, а фон догонял её позже
      scene = prev || scene;
      var pre = new Image(), done = false;
      var swap = function () {
        if (done || token !== showToken) return; // уже сменили или пока грузилось, выбрали другую комнату
        done = true;
        scene = next;
        el.bg.src = next.src;
        applyScene();
        light();
      };
      // загрузилось → ещё ждём декодирования, но не дольше 150 мс (decode() в скрытой вкладке может не завершиться)
      pre.onload = function () { if (pre.decode) pre.decode().then(swap, swap); setTimeout(swap, 150); };
      pre.onerror = swap;
      pre.src = next.src;
      return;
    }
    applyScene();
  }
  var showToken = 0;
  function applyScene() {
    el.stage.style.setProperty('--ar', scene.W / scene.H);
    el.sizewrap.hidden = !(scene.own && own.approx);
    el.size.value = scene.k;
    endCalib(true);
    msg('');
    fit();
    note();
    // фон уже загружен (та же сцена) — onload не придёт, яркость считаем сразу
    if (el.bg.complete && el.bg.naturalWidth) light();
  }

  // проекция своей стены: по отметке (в перспективе) или примерный масштаб (картина ~ пятая часть ширины кадра)
  function setOwnH() {
    if (own.approx) {
      var p = own.W * 0.22 / Math.max(art.w, 1);
      scene.Hm = scaleH(p);
      scene.Hi = scaleH(1 / p);
    } else {
      // картина больше предмета в 2+ раза — линейное приближение у центра предмета, иначе полная перспектива
      var far = Math.max(art.w / own.rw, art.h / own.rh) > 2;
      scene.Hm = far ? localAffine(own.Hm, [own.rw / 2, own.rh / 2]) : own.Hm;
      scene.Hi = invert(scene.Hm);
      scene.flat = far;
    }
    scene.box = null;
  }
  function defaultPos() {
    if (!own.approx && own.ref === 'a4') return [own.rw / 2, own.rh / 2]; // центром на лист
    var c = apply(scene.Hi, [scene.W / 2, scene.H * 0.45]);
    // у двери известен пол (низ двери): центр картины — на высоте 150 см
    if (!own.approx && own.ref === 'door') c[1] = own.rh - 150;
    return c;
  }

  function note() {
    var t;
    if (!scene.own) t = 'Картина в настоящем размере. Её можно передвинуть по стене.';
    else if (own.approx) t = 'Масштаб примерный: подгоните размер ползунком или <button type="button" class="room__link" data-act="calib">отметьте предмет известного размера</button> — тогда размер будет точным.';
    else t = 'Картина в настоящем размере' + (scene.flat ? '' : ' и с учётом наклона стены') + '. Передвиньте её пальцем или мышью. <button type="button" class="room__link" data-act="calib">Отметить заново</button>' +
      (scene.flat ? ' <span class="room__tip">Если снимали стену сбоку, отметьте предмет покрупнее — дверь или раму: так точнее перспектива.</span>' : '');
    if (scene.own) t += ' Фото остаётся на вашем устройстве и никуда не загружается. <button type="button" class="room__link" data-act="file">Другое фото</button>';
    el.note.innerHTML = t;
    var c = el.note.querySelector('[data-act=calib]'), f = el.note.querySelector('[data-act=file]');
    if (c) c.addEventListener('click', function () { startCalib(own.ref || 'a4'); });
    if (f) f.addEventListener('click', function () { el.file.click(); });
  }

  // размер сцены — вписываем фон в свободное место окна целиком
  function fit() {
    if (!scene || !dlg.open) return;
    var cs = getComputedStyle(el.body);
    var bw = el.body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var w = Math.min(bw, el.body.clientHeight * scene.W / scene.H);
    el.stage.style.width = Math.max(0, Math.floor(w)) + 'px';
    place();
    if (calib) drawHandles();
  }

  // углы картины в см на стене и в пикселях фона
  function artCm() {
    var w = art.w * scene.k, h = art.h * scene.k, c = scene.c;
    return [[c[0] - w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2], [c[0] - w / 2, c[1] + h / 2]];
  }
  function artPx() { return artCm().map(function (p) { return apply(scene.Hm, p); }); }

  function clamp() {
    var w = art.w * scene.k, h = art.h * scene.k, c = scene.c, b = scene.box;
    if (b) {
      var minX = b[0] + w / 2, maxX = b[2] - w / 2, minY = b[1] + h / 2, maxY = b[3] - h / 2;
      c[0] = minX > maxX ? (b[0] + b[2]) / 2 : Math.min(maxX, Math.max(minX, c[0]));
      c[1] = minY > maxY ? minY : Math.min(maxY, Math.max(minY, c[1]));
      return true;
    }
    // своё фото: центр картины не уходит за кадр
    var p = apply(scene.Hm, c);
    return p[0] >= 0 && p[0] <= scene.W && p[1] >= 0 && p[1] <= scene.H;
  }

  function place() {
    if (!scene || !el.stage.clientWidth) return;
    clamp();
    var f = el.stage.clientWidth / scene.W;
    var q = artPx().map(function (p) { return [p[0] * f, p[1] * f]; });
    var EW = 1000, EH = 1000 * art.h / art.w;
    var M = homography([[0, 0], [EW, 0], [EW, EH], [0, EH]], q);
    var st = el.art.style;
    if (!M) { st.visibility = 'hidden'; return; }
    st.visibility = '';
    st.width = EW + 'px';
    st.height = EH + 'px';
    st.transform = 'matrix3d(' + [M[0], M[3], 0, M[6], M[1], M[4], 0, M[7], 0, 0, 1, 0, M[2], M[5], 0, 1].join(',') + ')';
    // тень — в единицах элемента: ширина картины на экране / 1000
    var s = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) / EW, sh = scene.shadow;
    var u = function (v) { return (v * f / (s || 1)).toFixed(1) + 'px'; };
    st.boxShadow = u(sh[0]) + ' ' + u(sh[1]) + ' ' + u(sh[2]) + ' rgba(0,0,0,' + sh[3] + ')';
    el.shade.style.opacity = String(1 - (scene.light || 1));
  }

  // освещённость стены вокруг картины (своё фото): средняя яркость → картина темнее на тёмном снимке
  var lumCanvas = null;
  function light() {
    scene.light = 1;
    if (!scene.own || !el.bg.naturalWidth) return;
    try {
      if (!lumCanvas || lumCanvas.src !== scene.src) {
        var c = document.createElement('canvas'), k = 200 / scene.W;
        c.width = 200; c.height = Math.max(1, Math.round(scene.H * k));
        c.getContext('2d').drawImage(el.bg, 0, 0, c.width, c.height);
        lumCanvas = { c: c, k: k, src: scene.src };
      }
      var q = artPx(), xs = q.map(function (p) { return p[0]; }), ys = q.map(function (p) { return p[1]; });
      var k2 = lumCanvas.k, pad = 0.3;
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var dx = (x1 - x0) * pad, dy = (y1 - y0) * pad;
      var rx = Math.max(0, Math.floor((x0 - dx) * k2)), ry = Math.max(0, Math.floor((y0 - dy) * k2));
      var rw = Math.min(lumCanvas.c.width - rx, Math.ceil((x1 - x0 + 2 * dx) * k2)), rh = Math.min(lumCanvas.c.height - ry, Math.ceil((y1 - y0 + 2 * dy) * k2));
      if (rw < 1 || rh < 1) return;
      var d = lumCanvas.c.getContext('2d').getImageData(rx, ry, rw, rh).data, sum = 0;
      for (var i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      var L = sum / (d.length / 4);
      scene.light = Math.max(0.72, Math.min(1, 0.55 + 0.55 * L));
    } catch (e) { scene.light = 1; }
    place();
  }

  // ---------- перетаскивание картины: мышь, палец, стрелки — по плоскости стены ----------
  function stagePoint(e) {
    var b = el.stage.getBoundingClientRect(), f = scene.W / b.width;
    return [(e.clientX - b.left) * f, (e.clientY - b.top) * f];
  }
  function dragArt() {
    var start = null;
    el.art.addEventListener('pointerdown', function (e) {
      if (calib) return;
      e.preventDefault();
      el.art.setPointerCapture(e.pointerId);
      start = { p: apply(scene.Hi, stagePoint(e)), c: scene.c.slice() };
      el.art.classList.add('is-drag');
    });
    el.art.addEventListener('pointermove', function (e) {
      if (!start) return;
      var p = apply(scene.Hi, stagePoint(e)), prev = scene.c.slice();
      scene.c = [start.c[0] + p[0] - start.p[0], start.c[1] + p[1] - start.p[1]];
      if (!clamp()) scene.c = prev;
      place();
    });
    var stop = function () {
      if (!start) return;
      start = null;
      el.art.classList.remove('is-drag');
      if (scene.own) { own.pos = scene.c.slice(); light(); }
    };
    el.art.addEventListener('pointerup', stop);
    el.art.addEventListener('pointercancel', stop);
    el.art.addEventListener('keydown', function (e) {
      var d = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key]; // 5 см
      if (!d) return;
      e.preventDefault();
      var prev = scene.c.slice();
      scene.c = [prev[0] + d[0], prev[1] + d[1]];
      if (!clamp()) scene.c = prev;
      if (scene.own) own.pos = scene.c.slice();
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
        own = { img: URL.createObjectURL(blob), W: W, H: H, approx: true, k: 1, ref: null, pos: null,
          shadow: [W * 0.003, W * 0.005, W * 0.01, 0.3] };
        lumCanvas = null;
        strip();
        show('own');
        msg('');
        startCalib('a4');
      }, 'image/jpeg', 0.9);
    };
    img.onerror = function () { URL.revokeObjectURL(url); msg('Не удалось открыть фото. Попробуйте снимок в JPEG или PNG.'); };
    img.src = url;
  }

  // отметка: 4 уголка поверх фото — на углы предмета известного размера
  function startCalib(ref) {
    calib = { ref: null, pts: null, drag: -1 };
    // на время отметки — только фото и выбор предмета: лента комнат и кнопки скрыты, фото крупнее
    dlg.classList.add('is-calib');
    el.calib.hidden = false;
    el.sizewrap.hidden = true;
    el.stage.classList.add('is-calib');
    pickRef(ref);
  }
  function pickRef(ref) {
    if (ref === 'none') {
      own.approx = true;
      own.ref = null;
      own.pos = null;
      show('own');
      return;
    }
    var R = REFS[ref];
    calib.ref = ref;
    el.refs.querySelectorAll('[data-ref]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.ref === ref)); });
    el.step.textContent = R.hint;
    el.dims.hidden = ref === 'a4';
    if (ref === 'door') { el.rw.value = el.rw.value && own.ref === 'door' ? el.rw.value : '80'; el.rh.value = el.rh.value && own.ref === 'door' ? el.rh.value : '200'; }
    if (ref === 'custom' && own.ref !== 'custom') { el.rw.value = ''; el.rh.value = ''; }
    // уголки: прежняя отметка этого же предмета или прямоугольник в центре кадра в пропорциях предмета
    if (own.ref === ref && own.pts) {
      calib.pts = own.pts.map(function (p) { return p.slice(); });
    } else {
      var W = scene.W, H = scene.H, ar = ref === 'custom' ? 1.4 : R.w / R.h;
      var w = ref === 'door' ? W * 0.22 : W * 0.16, h = w / ar;
      if (h > H * 0.7) { h = H * 0.7; w = h * ar; }
      var cx = W / 2, cy = H * 0.45;
      calib.pts = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
    }
    drawHandles();
    syncDone();
  }
  var CORNER = ['левый верхний', 'правый верхний', 'правый нижний', 'левый нижний'];
  function drawHandles() {
    if (!calib || !calib.pts) return;
    var W = scene.W, H = scene.H;
    el.quad.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    el.quad.setAttribute('preserveAspectRatio', 'none');
    el.poly.setAttribute('points', calib.pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '));
    el.poly.style.strokeWidth = (W / el.stage.clientWidth * 2) + 'px';
    if (el.handles.children.length !== 4) {
      el.handles.innerHTML = calib.pts.map(function (p, i) {
        return '<button type="button" class="room__h-dot" data-i="' + i + '" aria-label="Уголок: ' + CORNER[i] + '. Стрелки двигают"></button>';
      }).join('');
      el.handles.querySelectorAll('[data-i]').forEach(bindHandle);
    }
    el.handles.querySelectorAll('[data-i]').forEach(function (b) {
      var p = calib.pts[Number(b.dataset.i)];
      b.style.left = p[0] / W * 100 + '%';
      b.style.top = p[1] / H * 100 + '%';
    });
  }
  function bindHandle(b) {
    var i = Number(b.dataset.i);
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      calib.drag = i;
      b.classList.add('is-drag');
      loupe(calib.pts[i]);
    });
    b.addEventListener('pointermove', function (e) {
      if (calib.drag !== i) return;
      var p = stagePoint(e);
      calib.pts[i] = [Math.max(0, Math.min(scene.W, p[0])), Math.max(0, Math.min(scene.H, p[1]))];
      drawHandles();
      loupe(calib.pts[i]);
      syncDone();
    });
    var up = function () { if (calib && calib.drag === i) { calib.drag = -1; b.classList.remove('is-drag'); el.loupe.hidden = true; } };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('keydown', function (e) {
      var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      var step = scene.W / 400 * (e.shiftKey ? 10 : 1);
      calib.pts[i] = [Math.max(0, Math.min(scene.W, calib.pts[i][0] + d[0] * step)), Math.max(0, Math.min(scene.H, calib.pts[i][1] + d[1] * step))];
      drawHandles();
      syncDone();
    });
  }
  // лупа: увеличенный кусок фото вокруг уголка, над пальцем (у верхнего края — под ним)
  function loupe(p) {
    var L = el.loupe, x = L.getContext('2d'), z = 3, R = L.width / 2;
    var f = el.stage.clientWidth / scene.W, src = R / z / f; // радиус в пикселях фона
    x.clearRect(0, 0, L.width, L.height);
    x.save();
    x.beginPath(); x.arc(R, R, R - 2, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#fff'; x.fillRect(0, 0, L.width, L.height);
    x.drawImage(el.bg, p[0] - src, p[1] - src, src * 2, src * 2, 0, 0, L.width, L.height);
    x.restore();
    x.strokeStyle = '#c8281e'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(R - 18, R); x.lineTo(R + 18, R); x.moveTo(R, R - 18); x.lineTo(R, R + 18); x.stroke();
    x.beginPath(); x.arc(R, R, R - 2, 0, Math.PI * 2); x.strokeStyle = '#fff'; x.lineWidth = 3; x.stroke();
    var size = L.getBoundingClientRect().width || 120, sx = p[0] * f, sy = p[1] * f;
    L.style.left = Math.max(0, Math.min(el.stage.clientWidth - size, sx - size / 2)) + 'px';
    L.style.top = (sy - size - 28 < 0 ? sy + 28 : sy - size - 28) + 'px';
    L.hidden = false;
  }
  function refSize() {
    if (!calib) return null;
    if (calib.ref === 'a4') return [REFS.a4.w, REFS.a4.h];
    var w = num(el.rw.value), h = num(el.rh.value);
    return w > 0 && h > 0 && w < 5000 && h < 5000 ? [w, h] : null;
  }
  function syncDone() {
    if (!calib || !calib.pts) return;
    var ok = convex(calib.pts), sz = refSize();
    el.done.disabled = !(ok && sz);
    el.warn.textContent = !ok ? 'Уголки перекрестились — расставьте их по углам по порядку.' : (!sz ? 'Укажите ширину и высоту предмета.' : '');
  }
  function finishCalib() {
    var sz = refSize();
    if (!sz || !convex(calib.pts)) return;
    var Hm = homography([[0, 0], [sz[0], 0], [sz[0], sz[1]], [0, sz[1]]], calib.pts);
    if (!Hm) { el.warn.textContent = 'Не получилось — передвиньте уголки.'; return; }
    own.Hm = Hm;
    own.approx = false;
    own.ref = calib.ref;
    own.rw = sz[0]; own.rh = sz[1];
    own.pts = calib.pts.map(function (p) { return p.slice(); });
    own.k = 1;
    own.pos = null;
    show('own');
  }
  function endCalib(silent) {
    calib = null;
    dlg.classList.remove('is-calib');
    el.calib.hidden = true;
    el.stage.classList.remove('is-calib');
    el.handles.innerHTML = '';
    el.poly.setAttribute('points', '');
    el.loupe.hidden = true;
    if (!silent) note();
  }

  // ---------- «Скачать»: фон + тень + картина в перспективе + подпись ----------
  function loadImg(src, cors) {
    return new Promise(function (ok, fail) {
      var i = new Image();
      if (cors) i.crossOrigin = 'anonymous';
      i.onload = function () { ok(i); };
      i.onerror = fail;
      i.src = src;
    });
  }
  // картина в четырёхугольник: сетка треугольников, у каждого — своё аффинное преобразование
  function warp(x, img, q) {
    var N = 18, iw = img.naturalWidth, ih = img.naturalHeight;
    var H = homography([[0, 0], [1, 0], [1, 1], [0, 1]], q);
    var P = function (u, v) { return apply(H, [u, v]); };
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N;
      tri(x, img, [[u0 * iw, v0 * ih], [u1 * iw, v0 * ih], [u1 * iw, v1 * ih]], [P(u0, v0), P(u1, v0), P(u1, v1)]);
      tri(x, img, [[u0 * iw, v0 * ih], [u1 * iw, v1 * ih], [u0 * iw, v1 * ih]], [P(u0, v0), P(u1, v1), P(u0, v1)]);
    }
  }
  function tri(x, img, s, d) {
    // клип чуть шире треугольника — без швов между соседними
    var cx = (d[0][0] + d[1][0] + d[2][0]) / 3, cy = (d[0][1] + d[1][1] + d[2][1]) / 3;
    var e = d.map(function (p) { var dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * 0.7, p[1] + dy / l * 0.7]; });
    var den = s[0][0] * (s[1][1] - s[2][1]) + s[1][0] * (s[2][1] - s[0][1]) + s[2][0] * (s[0][1] - s[1][1]);
    if (!den) return;
    var a = (d[0][0] * (s[1][1] - s[2][1]) + d[1][0] * (s[2][1] - s[0][1]) + d[2][0] * (s[0][1] - s[1][1])) / den;
    var b = (d[0][1] * (s[1][1] - s[2][1]) + d[1][1] * (s[2][1] - s[0][1]) + d[2][1] * (s[0][1] - s[1][1])) / den;
    var c = (d[0][0] * (s[2][0] - s[1][0]) + d[1][0] * (s[0][0] - s[2][0]) + d[2][0] * (s[1][0] - s[0][0])) / den;
    var dd = (d[0][1] * (s[2][0] - s[1][0]) + d[1][1] * (s[0][0] - s[2][0]) + d[2][1] * (s[1][0] - s[0][0])) / den;
    var ee = (d[0][0] * (s[1][0] * s[2][1] - s[2][0] * s[1][1]) + d[1][0] * (s[2][0] * s[0][1] - s[0][0] * s[2][1]) + d[2][0] * (s[0][0] * s[1][1] - s[1][0] * s[0][1])) / den;
    var ff = (d[0][1] * (s[1][0] * s[2][1] - s[2][0] * s[1][1]) + d[1][1] * (s[2][0] * s[0][1] - s[0][0] * s[2][1]) + d[2][1] * (s[0][0] * s[1][1] - s[1][0] * s[0][1])) / den;
    x.save();
    x.beginPath(); x.moveTo(e[0][0], e[0][1]); x.lineTo(e[1][0], e[1][1]); x.lineTo(e[2][0], e[2][1]); x.closePath(); x.clip();
    x.transform(a, b, c, dd, ee, ff);
    x.drawImage(img, 0, 0);
    x.restore();
  }
  function quadPath(x, q) {
    x.beginPath();
    q.forEach(function (p, i) { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); });
    x.closePath();
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
      var q = artPx(), sh = scene.shadow;
      x.save();
      x.shadowOffsetX = sh[0]; x.shadowOffsetY = sh[1]; x.shadowBlur = sh[2]; x.shadowColor = 'rgba(0,0,0,' + sh[3] + ')';
      x.fillStyle = '#808080';
      quadPath(x, q); x.fill();
      x.restore();
      warp(x, im[1], q);
      if ((scene.light || 1) < 1) { x.fillStyle = 'rgba(0,0,0,' + (1 - scene.light).toFixed(3) + ')'; quadPath(x, q); x.fill(); }
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

  function caption() { return '«' + art.t + '», ' + art.a + ' · ' + cm(art.w) + ' × ' + cm(art.h) + ' см'; }
  function msg(t) { el.msg.textContent = t; }

  var roomsReq = null;
  function getRooms() {
    if (rooms) return Promise.resolve(rooms);
    // один запрос на всех: прогрев страницы и клик не скачивают список дважды
    roomsReq = roomsReq || fetch('/kalina-art-prototype/data/interiors.json', { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (d) { rooms = d; return d; }, function (e) { roomsReq = null; throw e; });
    return roomsReq;
  }

  // прогрев: список комнат, фон первой комнаты и сама картина — заранее, пока человек смотрит страницу;
  // тогда окно по клику открывается сразу, а не после трёх запросов подряд
  var warmed = {};
  function warm(btn) {
    var d = btn.dataset;
    return getRooms().then(function () {
      var first = rooms.filter(function (r) { return r.id === d.roomStart; })[0] || rooms[0];
      [first && first.img, d.roomImg].forEach(function (src) {
        if (!src || warmed[src]) return;
        warmed[src] = new Image();
        warmed[src].src = src;
      });
    }).catch(function () { /* не страшно: загрузится по клику */ });
  }

  // открыть окно для картины из кнопки; file — сразу своё фото (кнопка «На своей стене» на странице работы)
  function open(btn, file) {
    var d = btn.dataset;
    return getRooms().then(function () {
      if (!dlg) build();
      var same = art && art.img === d.roomImg;
      art = { img: d.roomImg, w: Number(d.roomW), h: Number(d.roomH), t: d.roomT || '', a: d.roomA || '', styles: (d.roomS || '').split('|').filter(Boolean) };
      if (own && !same) own.pos = null; // другая картина — заново по центру отметки
      el.artimg.src = art.img;
      el.art.setAttribute('aria-label', caption() + '. Стрелки двигают картину по стене');
      el.sub.textContent = caption();
      el.ask.setAttribute('data-lead', '«' + art.t + '», ' + art.a + ' — примерка в интерьере');
      strip();
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      if (file) loadOwn(file);
      else show(d.roomStart || (own ? 'own' : el.strip.querySelector('[data-id]').dataset.id));
      el.close.focus({ preventScroll: true });
    }).catch(function () { alert('Примерка временно недоступна. Обновите страницу.'); });
  }

  window.kaRoom = {
    open: open,
    warm: warm,
    // для проверок: состояние сцены и отметки
    _state: function () { return { scene: scene, own: own, calib: calib, art: art, px: scene ? artPx() : null }; },
    _calib: function (pts) { calib.pts = pts; drawHandles(); syncDone(); }
  };
})();
