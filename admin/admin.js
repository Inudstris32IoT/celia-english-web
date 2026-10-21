(function () {
  'use strict';

  var AUTHOR = 'Celia Jiménez';
  var MAX_SIDE = 2000;          // longer side of uploaded images
  var THUMB_SIDE = 560;         // same size as the existing thumbnails
  var MAX_VIDEO = 25 * 1024 * 1024;
  var PAGE = 50;

  var $ = function (id) { return document.getElementById(id); };
  var session = null;           // {user, token}
  var posts = [];
  var shown = PAGE;
  var editing = null;           // post being edited (null = new)
  var items = [];               // media items in the editor

  // ---------- small helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function msg(boxId, kind, text) {
    $(boxId).innerHTML = text ? '<div class="msg ' + kind + '">' + esc(text) + '</div>' : '';
  }
  function busy(text) {
    $('busy').hidden = !text;
    if (text) $('busyText').textContent = text;
  }
  function creditLabel(c) {
    if (c.kind === 'third') return 'Fuente: ' + c.source;
    if (c.kind === 'meme') return 'Meme · ' + (c.source || 'autor no identificado');
    return 'Autoría: ' + AUTHOR;
  }
  function fmt(ts) { return ts.replace('T', ' '); }
  function nowLocal() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function ask(title, text) {
    return new Promise(function (resolve) {
      $('cmTitle').textContent = title;
      $('cmText').textContent = text;
      $('confirmModal').hidden = false;
      $('cmYes').onclick = function () { $('confirmModal').hidden = true; resolve(true); };
      $('cmNo').onclick = function () { $('confirmModal').hidden = true; resolve(false); };
    });
  }
  function view(name) {
    $('loginView').hidden = name !== 'login';
    $('panelView').hidden = name !== 'panel';
    $('editorView').hidden = name !== 'editor';
    window.scrollTo(0, 0);
  }

  // ---------- login ----------
  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var user = Admin.normUser($('lUser').value), pw = $('lPw').value;
    $('loginBtn').disabled = true;
    msg('loginMsg', 'info', 'Comprobando…');
    try {
      var cfg = await Admin.readConfig();
      if (!cfg || !cfg.users || !cfg.users.length) throw new Error('El panel aún no tiene usuarios. Configúralo en admin/setup.html.');
      var entry = cfg.users.find(function (u) { return u.user === user; });
      var token;
      try { token = await Admin.decryptToken(entry || cfg.users[0], pw); } catch (x) { token = null; }
      if (!entry || !token) throw new Error('Usuario o contraseña incorrectos.');
      await Admin.checkAccess(token);
      session = { user: user, token: token };
      Admin.saveSession(session);
      $('lPw').value = '';
      msg('loginMsg');
      await enterPanel();
    } catch (err) {
      msg('loginMsg', 'error', err.message);
    } finally {
      $('loginBtn').disabled = false;
    }
  });

  $('logoutBtn').addEventListener('click', function () {
    Admin.clearSession();
    session = null;
    posts = [];
    view('login');
  });

  async function enterPanel() {
    $('who').textContent = session.user;
    busy('Cargando fichas…');
    try {
      posts = await Admin.readPosts(session.token);
    } finally {
      busy();
    }
    renderList();
    view('panel');
  }

  // ---------- list ----------
  function matches(p, q, kind) {
    if (kind === 'third') {
      if (!p.media.some(function (m) { return m.credit.kind !== 'author'; })) return false;
    } else if (kind && p.type !== kind) return false;
    if (!q) return true;
    var hay = (p.id + ' ' + p.ts + ' ' + p.text + ' ' + (p.options || []).map(function (o) { return o.text; }).join(' ') + ' ' +
      p.media.map(function (m) { return (m.credit.source || '') + ' ' + m.file; }).join(' ')).toLowerCase();
    return q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function renderList() {
    var q = $('search').value.trim(), kind = $('kindFilter').value;
    var list = posts.filter(function (p) { return matches(p, q, kind); })
      .sort(function (a, b) { return a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : b.id - a.id; });
    $('listCount').textContent = list.length + ' fichas';
    $('list').innerHTML = '';
    list.slice(0, shown).forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'item';
      var first = p.media[0], thumb;
      if (first && first.thumb) thumb = '<img loading="lazy" src="../thumbs/' + encodeURI(first.thumb) + '" alt="" onerror="this.outerHTML=\'<div class=ph>🖼️</div>\'">';
      else thumb = '<div class="ph">' + (first ? '🎬' : p.type === 'poll' ? '📊' : '📝') + '</div>';
      var seen = {}, chips = '';
      p.media.forEach(function (m) {
        var l = creditLabel(m.credit);
        if (!seen[l]) { seen[l] = 1; chips += '<span class="credit ' + m.credit.kind + '">' + esc(l) + '</span>'; }
      });
      li.innerHTML = thumb +
        '<div class="body"><div class="snip">' + esc(p.text || (p.type === 'poll' ? 'Encuesta' : '(sin texto)')) + '</div>' +
        '<div class="meta">#' + p.id + ' · ' + fmt(p.ts) + ' · ' + (p.media.length ? p.media.length + ' archivo(s)' : p.type === 'poll' ? 'encuesta' : 'texto') + '</div>' +
        '<div>' + chips + '</div></div>' +
        '<div class="actions"><button class="btn small" data-act="edit">Editar</button><button class="btn small danger" data-act="del">Eliminar</button></div>';
      li.querySelector('[data-act=edit]').onclick = function () { openEditor(p); };
      li.querySelector('[data-act=del]').onclick = function () { removePost(p); };
      $('list').appendChild(li);
    });
    $('moreBtn').hidden = list.length <= shown;
  }
  $('search').addEventListener('input', function () { shown = PAGE; renderList(); });
  $('kindFilter').addEventListener('change', function () { shown = PAGE; renderList(); });
  $('moreBtn').addEventListener('click', function () { shown += PAGE; renderList(); });

  // ---------- editor ----------
  $('newBtn').addEventListener('click', function () { openEditor(null); });
  $('cancelBtn').addEventListener('click', function () { cleanupPreviews(); view('panel'); });

  function openEditor(p) {
    editing = p;
    $('edTitle').textContent = p ? 'Editar ficha #' + p.id : 'Nueva ficha';
    $('edTs').value = p ? p.ts : nowLocal();
    $('edType').value = p ? p.type : 'media';
    $('edText').value = p ? p.text : '';
    $('edConfirm').checked = false;
    $('deleteBtn').hidden = !p;
    items = p ? p.media.map(function (m) {
      return { m: JSON.parse(JSON.stringify(m)), orig: JSON.stringify(m.credit) };
    }) : [];
    $('opts').innerHTML = '';
    var opts = p && p.options && p.options.length ? p.options : [{ text: '', votes: 0 }, { text: '', votes: 0 }];
    opts.forEach(addOption);
    msg('edMsg');
    syncType();
    renderItems();
    view('editor');
  }

  function syncType() {
    var t = $('edType').value;
    $('pollSection').hidden = t !== 'poll';
    $('mediaSection').hidden = t !== 'media';
    $('edTextLabel').textContent = t === 'poll' ? 'Pregunta de la encuesta' : t === 'text' ? 'Texto' : 'Texto (opcional)';
  }
  $('edType').addEventListener('change', syncType);

  function addOption(o) {
    var row = document.createElement('div');
    row.className = 'opt-row';
    row.innerHTML = '<input type="text" placeholder="Opción" class="o-text"><input type="number" min="0" class="o-votes" title="Votos"><button class="btn small" type="button">✕</button>';
    row.querySelector('.o-text').value = o.text || '';
    row.querySelector('.o-votes').value = o.votes || 0;
    row.querySelector('button').onclick = function () { row.remove(); };
    $('opts').appendChild(row);
  }
  $('addOpt').addEventListener('click', function () { addOption({ text: '', votes: 0 }); });

  function isNew(it) { return !!it.upload; }
  function creditTouched(it) { return isNew(it) || JSON.stringify(it.m.credit) !== it.orig; }

  function renderItems() {
    $('mediaList').innerHTML = '';
    items.forEach(function (it, idx) {
      var m = it.m, c = m.credit;
      var box = document.createElement('div');
      box.className = 'media-ed';
      var src = it.preview || (m.kind === 'video' ? '../media/' + encodeURI(m.file) : '../thumbs/' + encodeURI(m.thumb));
      var prev = m.kind === 'video' ? '<video src="' + src + '" muted preload="metadata"></video>' : '<img src="' + src + '" alt="">';
      var name = 'cr' + idx + '_' + Math.random().toString(36).slice(2, 6);
      box.innerHTML =
        '<div class="prev">' + prev + '<div class="tag">' + esc(isNew(it) ? 'Nuevo: ' + it.origName : m.file) + '</div></div>' +
        '<div>' +
        '<div class="radio-row">' +
        '<label><input type="radio" name="' + name + '" value="author">Propia (Celia Jiménez)</label>' +
        '<label><input type="radio" name="' + name + '" value="third">De otro autor o institución</label>' +
        '<label><input type="radio" name="' + name + '" value="meme">Meme o escena de película/serie</label>' +
        '</div>' +
        '<div class="src-fields">' +
        '<label class="field"><span class="src-label"></span><input type="text" class="src"></label>' +
        '<label class="field"><span>Enlace al autor o a la fuente (opcional)</span><input type="url" class="url" placeholder="https://"></label>' +
        '</div>' +
        '<label class="field"><span>Texto que aparece en la imagen (opcional, mejora el buscador)</span><textarea class="ocr" style="min-height:60px"></textarea></label>' +
        '<div class="row"><button class="btn small up" type="button">↑</button><button class="btn small down" type="button">↓</button>' +
        '<button class="btn small danger rm" type="button">Quitar archivo</button></div>' +
        '</div>';
      box.querySelector('input[value="' + c.kind + '"]').checked = true;
      box.querySelector('.src').value = c.source || '';
      box.querySelector('.url').value = c.url || '';
      box.querySelector('.ocr').value = m.ocr || '';
      function sync() {
        var k = box.querySelector('input[type=radio]:checked').value;
        box.querySelector('.src-fields').hidden = k === 'author';
        box.querySelector('.src-label').textContent = k === 'meme'
          ? 'Película, serie o autor original del meme *'
          : 'Nombre del autor, cuenta o institución dueña *';
        box.querySelector('.src').placeholder = k === 'meme' ? 'Ej.: Los Simpson, Shrek, @cuenta' : 'Ej.: Cambridge English, @openenglish';
      }
      box.querySelectorAll('input[type=radio]').forEach(function (r) {
        r.onchange = function () { readItem(box, it); sync(); updateConfirm(); };
      });
      box.querySelector('.src').oninput = function () { readItem(box, it); updateConfirm(); };
      box.querySelector('.url').oninput = function () { readItem(box, it); };
      box.querySelector('.ocr').oninput = function () { it.m.ocr = this.value; };
      box.querySelector('.up').onclick = function () { move(idx, -1); };
      box.querySelector('.down').onclick = function () { move(idx, 1); };
      box.querySelector('.rm').onclick = function () {
        if (it.preview) URL.revokeObjectURL(it.preview);
        items.splice(idx, 1);
        renderItems();
      };
      sync();
      it.box = box;
      $('mediaList').appendChild(box);
    });
    updateConfirm();
  }
  function readItem(box, it) {
    var k = box.querySelector('input[type=radio]:checked').value;
    var c = { kind: k };
    if (k !== 'author') {
      var s = box.querySelector('.src').value.trim(), u = box.querySelector('.url').value.trim();
      if (s) c.source = s;
      if (u) c.url = u;
    }
    it.m.credit = c;
  }
  function move(idx, d) {
    var n = idx + d;
    if (n < 0 || n >= items.length) return;
    var t = items[idx]; items[idx] = items[n]; items[n] = t;
    renderItems();
  }
  function updateConfirm() {
    $('confirmRow').hidden = !items.some(creditTouched);
  }
  function cleanupPreviews() {
    items.forEach(function (it) { if (it.preview) URL.revokeObjectURL(it.preview); });
  }

  // ---------- adding files ----------
  var drop = $('drop');
  $('fileInput').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });

  function stamp() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function loadImage(url) {
    return new Promise(function (ok, fail) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { fail(new Error('No se pudo leer la imagen.')); };
      img.src = url;
    });
  }
  function toJpeg(img, maxSide, quality) {
    var s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';               // transparent PNGs get a white background
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Promise(function (ok) { c.toBlob(function (b) { ok({ blob: b, w: c.width, h: c.height }); }, 'image/jpeg', quality); });
  }
  async function blobB64(blob) { return Admin.b64(await blob.arrayBuffer()); }

  async function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList);
    if (!files.length) return;
    busy('Preparando archivos…');
    try {
      for (var i = 0; i < files.length; i++) {
        var f = files[i], ext = (f.name.split('.').pop() || '').toLowerCase();
        var base = 'ADM-' + stamp() + '-' + Math.random().toString(36).slice(2, 6);
        if (f.type.indexOf('video/') === 0) {
          if (f.size > MAX_VIDEO) { msg('edMsg', 'error', '«' + f.name + '» pesa más de 25 MB. Recórtalo o comprímelo antes de subirlo.'); continue; }
          var vext = ext === 'webm' ? 'webm' : 'mp4';
          items.push({
            m: { file: base + '.' + vext, kind: 'video', credit: { kind: 'author' } },
            upload: [{ path: 'media/' + base + '.' + vext, base64: await blobB64(f) }],
            preview: URL.createObjectURL(f), origName: f.name, orig: ''
          });
          continue;
        }
        if (f.type.indexOf('image/') !== 0) { msg('edMsg', 'error', '«' + f.name + '» no es una imagen ni un video.'); continue; }
        var url = URL.createObjectURL(f);
        var img = await loadImage(url);
        var keep = ['jpg', 'jpeg', 'png', 'webp'].indexOf(ext) !== -1 &&
          Math.max(img.naturalWidth, img.naturalHeight) <= MAX_SIDE && f.size <= 3 * 1024 * 1024;
        var main = keep ? { blob: f, w: img.naturalWidth, h: img.naturalHeight } : await toJpeg(img, MAX_SIDE, 0.88);
        var mext = keep ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg';
        var th = await toJpeg(img, THUMB_SIDE, 0.8);
        items.push({
          m: { file: base + '.' + mext, kind: 'image', credit: { kind: 'author' }, ocr: '', w: main.w, h: main.h, thumb: base + '.jpg' },
          upload: [
            { path: 'media/' + base + '.' + mext, base64: await blobB64(main.blob) },
            { path: 'thumbs/' + base + '.jpg', base64: await blobB64(th.blob) }
          ],
          preview: url, origName: f.name, orig: ''
        });
      }
    } catch (err) {
      msg('edMsg', 'error', err.message);
    } finally {
      busy();
      renderItems();
    }
  }

  // ---------- validation and saving ----------
  function validate(type) {
    var errors = [];
    items.forEach(function (it) { if (it.box) it.box.classList.remove('invalid'); });
    if (!$('edTs').value) errors.push('Indica la fecha y hora.');
    if (type === 'text' && !$('edText').value.trim()) errors.push('Escribe el texto de la ficha.');
    if (type === 'poll') {
      if (!$('edText').value.trim()) errors.push('Escribe la pregunta de la encuesta.');
      var filled = Array.prototype.filter.call($('opts').querySelectorAll('.o-text'), function (i) { return i.value.trim(); });
      if (filled.length < 2) errors.push('La encuesta necesita al menos dos opciones.');
    }
    if (type === 'media') {
      if (!items.length) errors.push('Agrega al menos una imagen o video.');
      var missing = items.filter(function (it) {
        return it.m.credit.kind !== 'author' && !it.m.credit.source && creditTouched(it);
      });
      missing.forEach(function (it) { it.box.classList.add('invalid'); });
      if (missing.length) errors.push('Falta el nombre del dueño en ' + missing.length + ' archivo(s) marcados en rojo. Toda imagen que no sea de Celia debe llevar el crédito de su autor.');
      var badUrl = items.filter(function (it) { return it.m.credit.url && !/^https?:\/\/\S+$/.test(it.m.credit.url); });
      if (badUrl.length) errors.push('Revisa los enlaces: deben empezar con https://');
      if (items.some(creditTouched) && !$('edConfirm').checked) errors.push('Marca la casilla que confirma que los créditos son correctos.');
    }
    return errors;
  }

  function referencedElsewhere(file, exceptId) {
    return posts.some(function (p) {
      return p.id !== exceptId && p.media.some(function (m) { return m.file === file; });
    });
  }
  function filesOf(m) { return ['media/' + m.file].concat(m.thumb ? ['thumbs/' + m.thumb] : []); }

  $('edForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var type = $('edType').value;
    var errors = validate(type);
    if (errors.length) { msg('edMsg', 'error', errors.join(' ')); return; }

    var post = { ts: $('edTs').value, type: type, text: $('edText').value.trim(), media: [] };
    var uploads = [];
    if (type === 'media') {
      items.forEach(function (it) {
        var m = it.m;
        if (!m.ocr) delete m.ocr;
        post.media.push(m);
        if (it.upload) uploads = uploads.concat(it.upload);
      });
    }
    if (type === 'poll') {
      post.options = Array.prototype.map.call($('opts').querySelectorAll('.opt-row'), function (row) {
        return { text: row.querySelector('.o-text').value.trim(), votes: Math.max(0, parseInt(row.querySelector('.o-votes').value, 10) || 0) };
      }).filter(function (o) { return o.text; });
    }
    // files that were in the post before and are no longer used anywhere
    var deletions = [];
    if (editing) {
      var kept = post.media.map(function (m) { return m.file; });
      editing.media.forEach(function (m) {
        if (kept.indexOf(m.file) === -1 && !referencedElsewhere(m.file, editing.id)) deletions = deletions.concat(filesOf(m));
      });
    }

    var editId = editing ? editing.id : null, newId = null;
    var message = (editId ? 'Edita la ficha #' + editId : 'Agrega una ficha') + ' (' + session.user + ')';
    $('saveBtn').disabled = true;
    try {
      var result = await Admin.commit(session.token, message, {
        uploads: uploads,
        deletions: deletions,
        onStep: busy,
        mutate: function (latest) {
          if (editId) {
            var i = latest.findIndex(function (p) { return p.id === editId; });
            if (i === -1) throw new Error('Esta ficha fue eliminada mientras la editabas.');
            post.id = editId;
            latest[i] = post;
          } else {
            newId = latest.reduce(function (mx, p) { return Math.max(mx, p.id); }, 0) + 1;
            post.id = newId;
            latest.push(post);
          }
          return latest;
        }
      });
      posts = result;
      cleanupPreviews();
      renderList();
      view('panel');
      msg('panelMsg', 'ok', (editId ? 'Ficha #' + editId + ' actualizada.' : 'Ficha #' + newId + ' agregada.') +
        ' La web pública se actualiza en 1–2 minutos.');
    } catch (err) {
      msg('edMsg', 'error', 'No se guardó: ' + err.message);
    } finally {
      busy();
      $('saveBtn').disabled = false;
    }
  });

  $('deleteBtn').addEventListener('click', function () { if (editing) removePost(editing); });

  async function removePost(p) {
    var ok = await ask('¿Eliminar la ficha #' + p.id + '?',
      'Se quitará de la web junto con sus ' + p.media.length + ' archivo(s). Queda en el historial de GitHub por si hay que recuperarla.');
    if (!ok) return;
    var deletions = [];
    p.media.forEach(function (m) { if (!referencedElsewhere(m.file, p.id)) deletions = deletions.concat(filesOf(m)); });
    try {
      posts = await Admin.commit(session.token, 'Elimina la ficha #' + p.id + ' (' + session.user + ')', {
        deletions: deletions,
        onStep: busy,
        mutate: function (latest) { return latest.filter(function (x) { return x.id !== p.id; }); }
      });
      renderList();
      view('panel');
      msg('panelMsg', 'ok', 'Ficha #' + p.id + ' eliminada. La web pública se actualiza en 1–2 minutos.');
    } catch (err) {
      msg($('editorView').hidden ? 'panelMsg' : 'edMsg', 'error', 'No se eliminó: ' + err.message);
    } finally {
      busy();
    }
  }

  // ---------- start ----------
  session = Admin.loadSession();
  if (session && session.token) {
    enterPanel().catch(function (err) {
      Admin.clearSession();
      session = null;
      view('login');
      msg('loginMsg', 'error', err.message);
    });
  } else {
    view('login');
  }
})();
