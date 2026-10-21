(function () {
  'use strict';

  var AUTHOR = 'Celia Jiménez';
  var PAGE = 24;
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var posts = window.POSTS || [];
  var state = { q: '', type: 'all', month: '', newest: true, shown: 0, list: [] };
  var $ = function (id) { return document.getElementById(id); };
  var feed = $('feed');

  // ---------- helpers ----------
  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(ts) {
    var d = ts.slice(0, 10).split('-');
    return parseInt(d[2], 10) + ' de ' + MONTHS[parseInt(d[1], 10) - 1] + ' de ' + d[0];
  }
  // WhatsApp-style formatting: *bold*, _italic_, ~strike~, links
  function format(text, q) {
    var h = esc(text);
    h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?:)]|$)/g, '$1<strong>$2</strong>');
    h = h.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,!?:)]|$)/g, '$1<em>$2</em>');
    h = h.replace(/(^|[\s(])~([^~\n]+)~(?=[\s.,!?:)]|$)/g, '$1<s>$2</s>');
    if (q) h = highlight(h, q);
    return h;
  }
  function highlight(html, q) {
    var words = q.split(/\s+/).filter(Boolean).map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    if (!words.length) return html;
    var re = new RegExp('(' + words.join('|') + ')', 'gi');
    return html.split(/(<[^>]+>)/).map(function (part) {
      return part.charAt(0) === '<' ? part : part.replace(re, '<mark>$1</mark>');
    }).join('');
  }
  function creditLabel(c) {
    if (c.kind === 'third') return 'Fuente: ' + c.source;
    if (c.kind === 'meme') return 'Meme · autor no identificado';
    return 'Autoría: ' + AUTHOR;
  }
  function creditHtml(c) {
    return '<span class="credit ' + c.kind + '">' + esc(creditLabel(c)) + '</span>';
  }
  function kindOf(p) {
    if (p.type === 'poll') return 'poll';
    if (p.media.some(function (m) { return m.kind === 'video'; })) return 'video';
    if (p.media.length) return 'image';
    return 'text';
  }

  // search index: caption + poll options + text read from the images
  posts.forEach(function (p) {
    var parts = [p.text];
    (p.options || []).forEach(function (o) { parts.push(o.text); });
    p.media.forEach(function (m) { parts.push(m.ocr || ''); });
    p._search = norm(parts.join(' '));
    p._kind = kindOf(p);
    p._month = p.ts.slice(0, 7);
  });

  // ---------- stats, months, sources ----------
  (function init() {
    var imgs = 0, vids = 0, polls = 0, sources = {};
    posts.forEach(function (p) {
      if (p.type === 'poll') polls++;
      p.media.forEach(function (m) {
        if (m.kind === 'video') vids++; else imgs++;
        if (m.credit.kind === 'third') sources[m.credit.source] = (sources[m.credit.source] || 0) + 1;
      });
    });
    var first = posts[0], last = posts[posts.length - 1];
    $('stats').textContent = posts.length + ' publicaciones · ' + imgs + ' imágenes · ' + vids + ' videos · ' + polls +
      ' encuestas · ' + (first ? fmtDate(first.ts) + ' – ' + fmtDate(last.ts) : '');

    var months = {};
    posts.forEach(function (p) { months[p._month] = (months[p._month] || 0) + 1; });
    var sel = $('month');
    Object.keys(months).sort().reverse().forEach(function (m) {
      var o = document.createElement('option');
      var parts = m.split('-');
      o.value = m;
      o.textContent = MONTHS[parseInt(parts[1], 10) - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + parts[0] + ' (' + months[m] + ')';
      sel.appendChild(o);
    });

    var names = Object.keys(sources).sort();
    if (names.length) {
      $('sources').innerHTML = '<p>Fuentes externas identificadas en las imágenes:</p><ul class="sources">' +
        names.map(function (n) { return '<li>' + esc(n) + ' (' + sources[n] + ')</li>'; }).join('') + '</ul>';
    }
  })();

  // ---------- rendering ----------
  function renderMedia(p) {
    var media = p.media;
    if (!media.length) return '';
    if (media.length === 1 && media[0].kind === 'video') {
      return '<div class="media n1"><video class="tile-video" controls preload="metadata" playsinline src="media/' +
        encodeURI(media[0].file) + '#t=0.1"></video></div>';
    }
    var max = Math.min(media.length, 4);
    var html = '<div class="media n' + max + '">';
    for (var i = 0; i < max; i++) {
      var m = media[i];
      html += '<button class="tile" data-post="' + p.id + '" data-i="' + i + '" aria-label="Ampliar imagen ' + (i + 1) + ' de ' + media.length + '">';
      if (m.kind === 'video') {
        html += '<video preload="metadata" muted playsinline src="media/' + encodeURI(m.file) + '#t=0.1"></video><span class="play"><span>▶</span></span>';
      } else {
        html += '<img loading="lazy" decoding="async" src="thumbs/' + encodeURI(m.thumb) + '" width="' + m.w + '" height="' + m.h + '" alt="' + esc((m.ocr || p.text || 'Imagen').replace(/\s+/g, ' ').slice(0, 140)) + '">';
      }
      if (i === max - 1 && media.length > max) html += '<span class="more">+' + (media.length - max) + '</span>';
      html += '</button>';
    }
    return html + '</div>';
  }

  function renderCredits(p) {
    if (!p.media.length) return '';
    var seen = {}, out = [];
    p.media.forEach(function (m) {
      var key = creditLabel(m.credit);
      if (!seen[key]) { seen[key] = 1; out.push(creditHtml(m.credit)); }
    });
    return '<div class="credits">' + out.join('') + '</div>';
  }

  function renderPoll(p) {
    var total = p.options.reduce(function (s, o) { return s + o.votes; }, 0);
    var best = Math.max.apply(null, p.options.map(function (o) { return o.votes; }));
    return '<div class="poll"><span class="poll-badge">Encuesta</span><h3>' + format(p.text, state.q) + '</h3>' +
      p.options.map(function (o) {
        var pct = total ? Math.round(o.votes * 100 / total) : 0;
        return '<div class="opt' + (o.votes === best && best > 0 ? ' win' : '') + '"><i class="bar" style="width:' + pct + '%"></i>' +
          '<span>' + format(o.text, state.q) + '</span><span>' + pct + '%</span></div>';
      }).join('') + '<p class="card-foot" style="padding:4px 0 0">' + total + ' votos</p></div>';
  }

  function renderCard(p) {
    var el = document.createElement('article');
    el.className = 'card';
    el.id = 'post-' + p.id;
    var html = '<div class="card-head"><a href="#post-' + p.id + '">' + fmtDate(p.ts) + '</a><span>' + p.ts.slice(11) + '</span></div>';
    if (p.type === 'poll') {
      html += renderPoll(p);
    } else {
      html += renderMedia(p) + renderCredits(p);
      if (p.text) {
        var long = p.text.length > 420 || p.text.split('\n').length > 9;
        html += '<div class="text' + (long ? ' clamp' : '') + '">' + format(p.text, state.q) + '</div>';
        if (long) html += '<button class="toggle">Ver más</button>';
      }
    }
    html += '<div class="card-foot">Publicado por ' + AUTHOR + '</div>';
    el.innerHTML = html;
    return el;
  }

  function apply() {
    var q = norm(state.q.trim());
    var words = q.split(/\s+/).filter(Boolean);
    state.list = posts.filter(function (p) {
      if (state.type !== 'all' && p._kind !== state.type) return false;
      if (state.month && p._month !== state.month) return false;
      return words.every(function (w) { return p._search.indexOf(w) !== -1; });
    });
    if (state.newest) state.list = state.list.slice().reverse();
    feed.innerHTML = '';
    state.shown = 0;
    $('count').textContent = state.list.length === posts.length
      ? 'Mostrando todas las publicaciones'
      : state.list.length + ' publicaciones encontradas';
    $('empty').hidden = state.list.length > 0;
    more();
  }

  function more() {
    var frag = document.createDocumentFragment();
    state.list.slice(state.shown, state.shown + PAGE).forEach(function (p) { frag.appendChild(renderCard(p)); });
    state.shown += PAGE;
    feed.appendChild(frag);
  }

  new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting && state.shown < state.list.length) more();
  }, { rootMargin: '1200px' }).observe($('sentinel'));

  // ---------- controls ----------
  var timer;
  $('q').addEventListener('input', function (e) {
    clearTimeout(timer);
    timer = setTimeout(function () { state.q = e.target.value; apply(); }, 180);
  });
  document.querySelectorAll('.chip').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      state.type = b.dataset.type;
      apply();
    });
  });
  $('month').addEventListener('change', function (e) { state.month = e.target.value; apply(); });
  $('sort').addEventListener('click', function (e) {
    state.newest = !state.newest;
    e.target.textContent = state.newest ? 'Más recientes' : 'Más antiguas';
    apply();
  });

  feed.addEventListener('click', function (e) {
    var t = e.target.closest('.toggle');
    if (t) {
      var txt = t.previousElementSibling;
      var open = txt.classList.toggle('clamp');
      t.textContent = open ? 'Ver más' : 'Ver menos';
      return;
    }
    var tile = e.target.closest('.tile');
    if (tile) openLb(+tile.dataset.post, +tile.dataset.i);
  });

  // ---------- lightbox ----------
  var lb = { post: null, i: 0 };
  var byId = {};
  posts.forEach(function (p) { byId[p.id] = p; });

  function showLb() {
    var m = lb.post.media[lb.i];
    $('lbMedia').innerHTML = m.kind === 'video'
      ? '<video controls autoplay playsinline src="media/' + encodeURI(m.file) + '"></video>'
      : '<img src="media/' + encodeURI(m.file) + '" alt="' + esc((m.ocr || '').replace(/\s+/g, ' ').slice(0, 140)) + '">';
    $('lbCredit').innerHTML = creditHtml(m.credit);
    $('lbPos').textContent = lb.post.media.length > 1 ? (lb.i + 1) + ' / ' + lb.post.media.length : '';
    $('lbPrev').disabled = lb.i === 0;
    $('lbNext').disabled = lb.i === lb.post.media.length - 1;
  }
  function openLb(id, i) {
    lb.post = byId[id];
    lb.i = i;
    showLb();
    $('lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
    $('lbClose').focus();
  }
  function closeLb() {
    $('lightbox').hidden = true;
    $('lbMedia').innerHTML = '';
    document.body.style.overflow = '';
  }
  function step(d) {
    var n = lb.i + d;
    if (n >= 0 && n < lb.post.media.length) { lb.i = n; showLb(); }
  }
  $('lbClose').addEventListener('click', closeLb);
  $('lbPrev').addEventListener('click', function () { step(-1); });
  $('lbNext').addEventListener('click', function () { step(1); });
  $('lightbox').addEventListener('click', function (e) { if (e.target.id === 'lightbox') closeLb(); });
  document.addEventListener('keydown', function (e) {
    if ($('lightbox').hidden) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  var touchX = null;
  $('lightbox').addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  $('lightbox').addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  });

  apply();

  // deep link to a post: render up to it, then scroll
  if (location.hash.indexOf('#post-') === 0) {
    var target = +location.hash.slice(6);
    var idx = state.list.findIndex(function (p) { return p.id === target; });
    while (idx >= state.shown && state.shown < state.list.length) more();
    var el = document.getElementById('post-' + target);
    if (el) el.scrollIntoView();
  }
})();
