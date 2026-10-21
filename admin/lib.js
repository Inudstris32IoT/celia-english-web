// Shared helpers for the admin panel: token encryption and commits through the GitHub API.
var Admin = (function () {
  'use strict';

  var REPO = { owner: 'Inudstris32IoT', name: 'celia-english-web', branch: 'main' };
  var ITER = 600000;
  var CONFIG_PATH = 'data/admin-users.json';
  var POSTS_PATH = 'data/posts.json';
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  // ---------- base64 ----------
  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function normUser(u) { return (u || '').trim().toLowerCase(); }

  // ---------- token encryption (PBKDF2-SHA256 + AES-256-GCM) ----------
  async function deriveKey(password, salt, iter) {
    var base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptToken(user, password, token) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(password, salt, ITER);
    var data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: enc.encode(normUser(user)) }, key, enc.encode(token));
    return { user: normUser(user), iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) };
  }
  async function decryptToken(entry, password) {
    var key = await deriveKey(password, unb64(entry.salt), entry.iter || ITER);
    var plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(entry.iv), additionalData: enc.encode(entry.user) }, key, unb64(entry.data));
    return dec.decode(plain);
  }

  // ---------- GitHub API ----------
  function apiPath(p) { return '/repos/' + REPO.owner + '/' + REPO.name + p; }
  async function gh(token, method, path, body, raw) {
    var res = await fetch('https://api.github.com' + path, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
    if (!res.ok) {
      var msg = '';
      try { msg = (await res.json()).message || ''; } catch (e) { /* ignore */ }
      var err = new Error(describe(res.status, msg));
      err.status = res.status;
      throw err;
    }
    return raw ? res.text() : (res.status === 204 ? null : res.json());
  }
  function describe(status, msg) {
    if (status === 401) return 'La llave de GitHub no es válida o venció. Pide que la renueven en la página de configuración.';
    if (status === 403 || status === 404) return 'La llave de GitHub no tiene permiso de escritura en este repositorio. (' + msg + ')';
    if (status === 409 || status === 422) return 'Conflicto al guardar: ' + msg;
    return 'Error de GitHub (' + status + '): ' + msg;
  }

  async function checkAccess(token) {
    var repo = await gh(token, 'GET', apiPath(''));
    if (!repo.permissions || !repo.permissions.push) throw new Error('La llave no tiene permiso para escribir en el repositorio.');
    return repo;
  }

  async function headSha(token) {
    var ref = await gh(token, 'GET', apiPath('/git/ref/heads/' + REPO.branch));
    return ref.object.sha;
  }
  async function readText(token, path, ref) {
    return gh(token, 'GET', apiPath('/contents/' + path + '?ref=' + (ref || REPO.branch)), null, true);
  }
  async function readPosts(token) {
    return JSON.parse(await readText(token, POSTS_PATH));
  }
  async function readConfig() {
    var res = await fetch('../' + CONFIG_PATH + '?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  }

  function postsJson(posts) {
    // one post per line keeps the git history readable
    return '[\n' + posts.map(function (p) { return JSON.stringify(p); }).join(',\n') + '\n]\n';
  }

  /*
   * Make one commit on the branch.
   *   uploads:   [{path, base64}]  new binary files
   *   deletions: [path]            files to remove
   *   mutate:    function(posts) -> posts   applied to the latest data/posts.json (null to leave it)
   *   extra:     [{path, text}]    other text files to write
   * Retries if someone else committed in the meantime.
   */
  async function commit(token, message, opts) {
    var uploads = opts.uploads || [], deletions = opts.deletions || [], extra = opts.extra || [];
    var onStep = opts.onStep || function () {};
    var blobs = [];
    for (var i = 0; i < uploads.length; i++) {
      onStep('Subiendo archivo ' + (i + 1) + ' de ' + uploads.length + '…');
      var blob = await gh(token, 'POST', apiPath('/git/blobs'), { content: uploads[i].base64, encoding: 'base64' });
      blobs.push({ path: uploads[i].path, sha: blob.sha });
    }
    for (var attempt = 0; attempt < 3; attempt++) {
      onStep('Guardando cambios…');
      var head = await headSha(token);
      var base = await gh(token, 'GET', apiPath('/git/commits/' + head));
      var tree = blobs.map(function (b) { return { path: b.path, mode: '100644', type: 'blob', sha: b.sha }; });
      var result = null;
      if (opts.mutate) {
        result = opts.mutate(JSON.parse(await readText(token, POSTS_PATH, head)));
        tree.push({ path: POSTS_PATH, mode: '100644', type: 'blob', content: postsJson(result) });
      }
      extra.forEach(function (f) { tree.push({ path: f.path, mode: '100644', type: 'blob', content: f.text }); });
      deletions.forEach(function (p) { tree.push({ path: p, mode: '100644', type: 'blob', sha: null }); });
      var newTree = await gh(token, 'POST', apiPath('/git/trees'), { base_tree: base.tree.sha, tree: tree });
      var newCommit = await gh(token, 'POST', apiPath('/git/commits'), { message: message, tree: newTree.sha, parents: [head] });
      try {
        await gh(token, 'PATCH', apiPath('/git/refs/heads/' + REPO.branch), { sha: newCommit.sha, force: false });
        return result;
      } catch (e) {
        if (e.status !== 422 || attempt === 2) throw e; // 422: the branch moved; rebuild on top of it
      }
    }
  }

  // ---------- session ----------
  var KEY = 'celia-admin-session';
  function saveSession(s) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } }
  function loadSession() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } }
  function clearSession() { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  return {
    REPO: REPO, CONFIG_PATH: CONFIG_PATH, POSTS_PATH: POSTS_PATH,
    normUser: normUser, b64: b64,
    encryptToken: encryptToken, decryptToken: decryptToken,
    checkAccess: checkAccess, readPosts: readPosts, readConfig: readConfig, readText: readText,
    commit: commit,
    saveSession: saveSession, loadSession: loadSession, clearSession: clearSession
  };
})();
