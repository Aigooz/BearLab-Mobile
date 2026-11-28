/* Transport + BearLab API client.
   Mobile shells use a native HTTPS bridge; plain browsers use fetch(). */
(function (global) {
  'use strict';

  var ORIGIN = 'https://bearlab.ai';
  var API = ORIGIN + '/api';
  var V1 = ORIGIN + '/v1';

  function browserUrl(url) {
    if (global.location.hostname !== '127.0.0.1') return url;
    if (url.indexOf(API + '/') === 0 || url.indexOf(V1 + '/') === 0) {
      return '/__proxy/bearlab' + url.slice(ORIGIN.length);
    }
    return url;
  }

  // ---------- base64 helpers ----------
  function dec(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var out = '';
    for (var j = 0; j < bytes.length; j++) out += String.fromCharCode(bytes[j]);
    return decodeURIComponent(escape(out));
  }

  // ---------- transport ----------
  var seq = 0;
  var pending = {};
  var streams = {};

  function nativeHttp(method, url, headers, body, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var id = 'r' + (++seq);
      var timer = setTimeout(function () {
        if (pending[id]) {
          delete pending[id];
          try { global.Native.abort(id); } catch (e) {}
          reject(mkErr(0, 'TIMEOUT', '请求超时，请检查网络'));
        }
      }, timeoutMs || 45000);
      pending[id] = function (status, text, hdrs) {
        clearTimeout(timer);
        delete pending[id];
        if (status === 0) {
          var msg = '网络连接失败';
          try { var h = JSON.parse(hdrs || '{}'); if (h.error) msg = h.error; } catch (e) {}
          reject(mkErr(0, 'NETWORK', msg));
          return;
        }
        resolve({ status: status, text: text, headers: hdrs });
      };
      try {
        global.Native.http(id, method, url, JSON.stringify(headers || {}), body || null);
      } catch (e) {
        clearTimeout(timer);
        delete pending[id];
        reject(mkErr(0, 'BRIDGE', String(e)));
      }
    });
  }

  function fetchHttp(method, url, headers, body) {
    var target = browserUrl(url);
    var requestHeaders = Object.assign({}, headers || {});
    if (target !== url) requestHeaders['X-Bearlab-Preview'] = '1';
    var opt = { method: method, headers: requestHeaders };
    if (body) opt.body = body;
    return fetch(target, opt).then(function (r) {
      return r.text().then(function (t) {
        return { status: r.status, text: t, headers: '{}' };
      });
    });
  }

  function request(method, url, headers, body, timeoutMs) {
    if (global.Native && global.Native.http) return nativeHttp(method, url, headers, body, timeoutMs);
    return fetchHttp(method, url, headers, body);
  }

  // Background route preloading can be invalidated before its fetch settles.
  // Chromium silently ignores that cancellation; WebKit reports it as an
  // access-control error even though no application request failed.
  function settlePreload(promise) {
    try {
      Promise.resolve(promise).catch(function () {});
    } catch (e) {}
    return promise;
  }

  var MSG_MAP = [
    ['invalid email or password', '邮箱或密码错误'],
    ['invalid credentials', '邮箱或密码错误'],
    ['email not verified', '邮箱尚未验证，请先完成邮箱验证'],
    ['email already', '该邮箱已注册'],
    ['user not found', '账号不存在'],
    ['account is disabled', '账号已被禁用'],
    ['account has been banned', '账号已被封禁'],
    ['invalid verification code', '验证码不正确'],
    ['verification code expired', '验证码已过期'],
    ['invalid or expired', '验证码无效或已过期'],
    ['too many requests', '请求过于频繁，请稍后再试'],
    ['rate limit', '请求过于频繁，请稍后再试'],
    ['insufficient balance', '余额不足，请先充值'],
    ['insufficient quota', '额度不足'],
    ['quota exceeded', '额度已用尽'],
    ['invalid token', '令牌无效或已停用'],
    ['token is disabled', '令牌已停用'],
    ['token expired', '令牌已过期'],
    ['not found', '资源不存在'],
    ['internal server error', '服务异常，请稍后再试']
  ];
  function localize(msg) {
    var raw = String(msg || '').trim();
    var low = raw.toLowerCase();
    for (var i = 0; i < MSG_MAP.length; i++) {
      if (low.indexOf(MSG_MAP[i][0]) >= 0) return MSG_MAP[i][1];
    }
    return raw;
  }

  function mkErr(status, code, message) {
    var e = new Error(message || '请求失败');
    e.status = status;
    e.code = code;
    e.message = message || '请求失败';
    return e;
  }

  // ---------- auth state ----------
  var secureMode = '';
  var secureValues = {};
  var secureSequence = 0;
  var persistQueue = Promise.resolve();
  var vault = { version: 1, activeId: '', accounts: [] };
  var authGeneration = 0;
  var sessionRevision = 0;
  var passwordRevision = -1;
  var lastPersistOk = null;
  try {
    if (global.Native && global.Native.secureMode) secureMode = global.Native.secureMode();
  } catch (e) { secureMode = 'unavailable'; }

  global.__nativeSecure = function (id, ok) {
    var pendingSecure = secureValues[id];
    if (!pendingSecure) return;
    delete secureValues[id];
    clearTimeout(pendingSecure.timer);
    pendingSecure.resolve(!!ok);
  };

  function parseVault(raw) {
    try {
      var value = JSON.parse(raw);
      if (value && value.version === 1 && Array.isArray(value.accounts)) {
        value.accounts = value.accounts.filter(function (a) { return a && typeof a.id === 'string' && typeof a.email === 'string'; });
        if (!value.accounts.some(function (a) { return a.id === value.activeId; })) value.activeId = '';
        return value;
      }
    } catch (e) {}
    return null;
  }

  function loadVault() {
    if (secureMode === 'sync' || secureMode === 'async') {
      try {
        var raw = global.Native.secureGet();
        if (raw === null || raw === undefined) { secureMode = 'unavailable'; return; }
        if (raw) {
          var parsed = parseVault(String(raw));
          if (!parsed) { secureMode = 'unavailable'; return; }
          vault = parsed;
        }
      } catch (e) { secureMode = 'unavailable'; }
    }
  }
  loadVault();

  function secureWrite(snapshot) {
    if (secureMode === 'sync') {
      try { return Promise.resolve(global.Native.secureSet(snapshot) === true); }
      catch (e) { return Promise.resolve(false); }
    }
    if (secureMode === 'async') {
      return new Promise(function (resolve) {
        var id = 'secure' + (++secureSequence);
        var timer = setTimeout(function () { delete secureValues[id]; resolve(false); }, 5000);
        secureValues[id] = { resolve: resolve, timer: timer };
        try { global.Native.secureSet(id, snapshot); }
        catch (e) { clearTimeout(timer); delete secureValues[id]; resolve(false); }
      });
    }
    return Promise.resolve(false);
  }

  function persistVault() {
    var snapshot = JSON.stringify(vault);
    persistQueue = persistQueue.catch(function () {}).then(function () { return secureWrite(snapshot); })
      .then(function (ok) { lastPersistOk = ok; return ok; });
    return persistQueue;
  }

  function account(id) {
    return vault.accounts.filter(function (item) { return item.id === id; })[0] || null;
  }
  function activeAccount() { return account(vault.activeId); }
  function accountId(email, user) {
    if (email) return 'email:' + String(email).trim().toLowerCase();
    if (user && user.id != null) return 'user:' + String(user.id);
    return '';
  }
  function authChanged(reason) {
    authGeneration++;
    if (typeof global.CustomEvent === 'function') {
      global.dispatchEvent(new CustomEvent('pp:auth-changed', { detail: { reason: reason } }));
    }
  }
  function expiredError() { return mkErr(401, 'UNAUTHORIZED', '登录已过期，请重新登录'); }
  function switchedError() { return mkErr(0, 'ACCOUNT_CHANGED', '账号已切换'); }
  function authContext() { return { id: vault.activeId, generation: authGeneration }; }
  function contextMatches(context) { return context.id === vault.activeId && context.generation === authGeneration; }

  function sanitizeUser(user) {
    if (!user || typeof user !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(user, function (key, value) {
        return /password|passwd|^pwd$/i.test(key) ? undefined : value;
      }));
    } catch (e) { return null; }
  }

  function applySession(item, data) {
    if (!data) return;
    sessionRevision++;
    if (data.access_token) item.token = String(data.access_token);
    if (data.refresh_token) item.refresh = String(data.refresh_token);
    if (data.access_expires_at != null) {
      var expires = Number(data.access_expires_at);
      item.expiresAt = expires > 100000000000 ? expires : expires * 1000;
    } else if (data.expires_in != null) {
      var ttl = Number(data.expires_in);
      item.expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : 0;
    }
    if (data.user) {
      var user = sanitizeUser(data.user);
      item.user = user;
      if (user && user.email) item.email = String(user.email);
    }
    if (data.session && data.session.sid) item.sessionSid = String(data.session.sid);
    item.systemToken = false;
    item.expired = false;
  }

  var AUTH = {
    token: function () { var a = activeAccount(); return a && a.token || ''; },
    refresh: function () { var a = activeAccount(); return a && a.refresh || ''; },
    user: function () { var a = activeAccount(); return a && a.user || null; },
    currentId: function () { return vault.activeId; },
    context: authContext,
    matches: contextMatches,
    accounts: function () {
      return vault.accounts.map(function (a) {
        var user = a.user && typeof a.user === 'object' ? a.user : {};
        return {
          id: a.id,
          email: a.email,
          active: a.id === vault.activeId,
          expired: !!a.expired || !a.token,
          systemToken: !!a.systemToken,
          name: user.name || user.display_name || user.nickname || '',
          username: user.username || '',
          rememberPassword: !!a.rememberPassword,
          hasPassword: a.rememberPassword && typeof a.savedPassword === 'string'
        };
      });
    },
    remembered: function (email) {
      var id = accountId(String(email || '').trim());
      var item = id && account(id);
      return item && item.rememberPassword && typeof item.savedPassword === 'string'
        ? { enabled: true, password: item.savedPassword } : { enabled: false, password: '' };
    },
    secureAvailable: function () { return secureMode === 'sync' || secureMode === 'async'; },
    storageWarning: function () {
      if (!AUTH.secureAvailable()) return '设备安全存储不可用，关闭应用后账号无法保留。';
      if (lastPersistOk === false) return '设备安全存储写入失败，账号更改可能不会在重启后保留。';
      return '';
    },
    isLogged: function () { return !!AUTH.token(); },
    sessionSid: function () { var a = activeAccount(); return a && a.sessionSid || ''; },
    commit: function (data, email, credentials) {
      var user = data && data.user || null;
      var address = String(user && user.email || email || '').trim();
      var id = accountId(address, user);
      if (!id || !data || !data.access_token) throw mkErr(0, 'BAD_SESSION', '登录结果缺少账号或会话信息');
      var existing = account(id);
      if (!existing) {
        existing = { id: id, email: address, token: '', refresh: '', user: null, expired: false };
        vault.accounts.push(existing);
      }
      existing.email = address || existing.email;
      existing.token = '';
      existing.refresh = '';
      existing.expiresAt = 0;
      applySession(existing, data);
      if (AUTH.secureAvailable() && credentials && credentials.rememberPassword && credentials.password) {
        existing.rememberPassword = true;
        existing.savedPassword = String(credentials.password);
      } else {
        existing.rememberPassword = false;
        delete existing.savedPassword;
      }
      vault.activeId = id;
      authChanged('commit');
      return persistVault();
    },
    commitSystemToken: function (token, user) {
      var value = String(token || '').trim();
      if (!/^nap_[A-Za-z0-9_-]{20,}$/.test(value)) {
        throw mkErr(0, 'BAD_TOKEN', '请输入 BearLab 系统访问令牌（nap_ 开头）');
      }
      var profile = sanitizeUser(user) || {};
      var address = String(profile.email || '').trim();
      var id = accountId(address, profile);
      if (!id) {
        var fingerprint = 0;
        for (var i = 0; i < value.length; i++) {
          fingerprint = (fingerprint * 31 + value.charCodeAt(i)) >>> 0;
        }
        id = 'system:' + fingerprint.toString(16);
      }
      var existing = account(id);
      if (!existing) {
        existing = { id: id, email: address, token: '', refresh: '', user: null, expired: false };
        vault.accounts.push(existing);
      }
      existing.systemToken = true;
      existing.refresh = '';
      existing.sessionSid = '';
      existing.expiresAt = 0;
      existing.expired = false;
      existing.token = value;
      existing.email = address || existing.email || 'BearLab 系统令牌';
      if (user) existing.user = profile;
      vault.activeId = id;
      authChanged('commit');
      return persistVault();
    },
    setUser: function (u, context) {
      if (!u || context && !contextMatches(context)) return Promise.resolve(false);
      var current = activeAccount();
      if (!current) return Promise.resolve(false);
      var previous = JSON.stringify(current.user || null);
      current.user = sanitizeUser(u);
      if (JSON.stringify(current.user || null) === previous) return Promise.resolve(true);
      return persistVault();
    },
    expire: function (id, reason, forgetPassword) {
      var item = account(id);
      if (!item) return Promise.resolve(false);
      item.token = '';
      item.refresh = '';
      item.expiresAt = 0;
      item.user = null;
      item.expired = true;
      if (item.systemToken) {
        item.token = '';
        item.systemToken = false;
      }
      if (reason === 'logout' || forgetPassword) {
        item.rememberPassword = false;
        delete item.savedPassword;
      }
      if (vault.activeId === id) { vault.activeId = ''; authChanged(reason || 'expired'); }
      return persistVault();
    },
    switchTo: function (id) {
      var item = account(id);
      if (!item || !item.token) return Promise.reject(mkErr(0, 'ACCOUNT_UNAVAILABLE', '该账号需要重新登录'));
      if (vault.activeId === id) return Promise.resolve(lastPersistOk !== false && AUTH.secureAvailable());
      vault.activeId = id;
      authChanged('switch');
      return persistVault();
    },
    remove: function (id) {
      var wasActive = vault.activeId === id;
      vault.accounts = vault.accounts.filter(function (item) { return item.id !== id; });
      if (wasActive) { vault.activeId = ''; authChanged('remove'); }
      return persistVault();
    },
    updateRememberedPassword: function (password, context) {
      if (!contextMatches(context)) return Promise.reject(switchedError());
      var item = activeAccount();
      if (!item || !item.rememberPassword) return Promise.resolve(true);
      item.savedPassword = String(password || '');
      return persistVault();
    },
    clear: function () { return AUTH.expire(vault.activeId); },
    markSystemProfile: function (user, context) {
      if (!contextMatches(context)) return Promise.resolve(false);
      var item = activeAccount();
      if (!item || !item.systemToken || !user || typeof user !== 'object') return Promise.resolve(false);
      item.user = sanitizeUser(user);
      if (user.email) item.email = String(user.email);
      return persistVault();
    }
  };

  var legacyToken = U.store.get('token', '');
  var legacyUser = U.store.get('user', null);
  var legacyEmail = legacyUser && legacyUser.email;
  if (legacyToken && legacyEmail && !U.store.get('chat_legacy_owner', '')) {
    U.store.set('chat_legacy_owner', accountId(legacyEmail, legacyUser));
  }
  if (legacyToken && legacyEmail && !vault.accounts.length) {
    var legacyId = accountId(legacyEmail, legacyUser);
    vault.accounts.push({ id: legacyId, email: legacyEmail, token: legacyToken, refresh: U.store.get('refresh', ''),
      user: sanitizeUser(legacyUser), expiresAt: U.store.get('expires_at', 0), expired: false });
    vault.activeId = legacyId;
    authChanged('migration');
    persistVault();
  }
  ['token', 'refresh', 'user', 'expires_at'].forEach(function (key) { U.store.del(key); });

  var refreshing = {};
  var passwordRelogins = {};
  var recovering = {};
  function reloginWithSavedPassword(context) {
    if (!contextMatches(context)) return Promise.reject(switchedError());
    var key = context.id + ':' + context.generation;
    if (passwordRelogins[key]) return passwordRelogins[key];
    var item = account(context.id);
    if (!item || !item.rememberPassword || !item.savedPassword) {
      return AUTH.expire(context.id).then(function () { throw expiredError(); });
    }
    var email = item.email;
    var password = item.savedPassword;
    passwordRelogins[key] = request('POST', API + '/user/login', {
      'Content-Type': 'application/json', 'Accept': 'application/json',
      'Accept-Language': 'zh', 'X-User-UI-Request': '1'
    }, JSON.stringify({ username: email, password: password })).then(function (res) {
      if (!contextMatches(context)) throw switchedError();
      if (res.status === 0) throw mkErr(0, 'NETWORK', '网络连接失败');
      if (res.status === 429 || res.status >= 500) throw mkErr(res.status, 'SERVER', '服务暂不可用，请稍后再试');
      var data = handle(res, parse(res));
      if (!data || !data.access_token) {
        return AUTH.expire(context.id).then(function () { throw expiredError(); });
      }
      // Renew the same account in place: do not reset pages or invalidate in-flight reads.
      item.token = '';
      item.refresh = '';
      item.expiresAt = 0;
      applySession(item, data);
      passwordRevision = sessionRevision;
      return persistVault().then(function () { return { password: true }; });
    }).then(function (result) {
      delete passwordRelogins[key];
      return result;
    }, function (error) {
      delete passwordRelogins[key];
      if (contextMatches(context) && error.code === 'LOGIN_AGREEMENT_REQUIRED') {
        return AUTH.expire(context.id, 'agreement').then(function () { throw error; });
      }
      if (contextMatches(context) && (error.status === 400 || error.status === 401 || error.status === 403)) {
        var badPassword = /invalid (email or password|username or password|credentials)|邮箱或密码错误|用户名或密码错误/i.test(error.message || '');
        return AUTH.expire(context.id, 'expired', badPassword).then(function () { throw expiredError(); });
      }
      throw error;
    });
    return passwordRelogins[key];
  }
  function refreshToken(context) {
    if (!contextMatches(context)) return Promise.reject(switchedError());
    var key = context.id + ':' + context.generation;
    if (refreshing[key]) return refreshing[key];
    var item = account(context.id);
    if (!item || item.systemToken) return Promise.reject(expiredError());
    var headers = {
      'Accept': 'application/json',
      'Accept-Language': 'zh',
      'X-User-UI-Request': '1'
    };
    if (item.sessionSid) headers['X-Auth-Session'] = item.sessionSid;
    refreshing[key] = request('POST', API + '/user/auth/refresh', headers, null).then(function (res) {
      if (!contextMatches(context)) throw switchedError();
      if (res.status === 0) throw mkErr(0, 'NETWORK', '网络连接失败');
      if (res.status === 429 || res.status >= 500) throw mkErr(res.status, 'SERVER', '服务暂不可用，请稍后再试');
      var j = parse(res);
      if (res.status === 400 || res.status === 401 || res.status === 403) throw expiredError();
      if (!j) throw mkErr(res.status, 'BAD_JSON', '刷新登录状态失败，请稍后再试');
      if ((j.code !== 0 && j.code !== 'SUCCESS' && j.code !== 200) &&
          /token|unauthorized|expired/i.test(String(j.code) + ' ' + String(j.message || j.error || ''))) throw expiredError();
      var refreshed = handle(res, j);
      if (!refreshed || !refreshed.access_token) throw mkErr(res.status, 'BAD_SESSION', '刷新登录状态失败，请稍后再试');
      applySession(item, refreshed);
      return persistVault().then(function () { return refreshed; });
    }).then(function (d) { delete refreshing[key]; return d; }, function (e) { delete refreshing[key]; throw e; });
    return refreshing[key];
  }

  function recoverSession(context, revision, passwordOnly) {
    if (!contextMatches(context)) return Promise.reject(switchedError());
    var key = context.id + ':' + context.generation;
    if (recovering[key]) return recovering[key];
    // A late 401 may belong to the token that another request already renewed.
    if (revision !== sessionRevision) return Promise.resolve({ password: passwordRevision === sessionRevision });
    var item = account(context.id);
    if (item && item.systemToken) {
      return AUTH.expire(context.id, 'expired').then(function () { throw expiredError(); });
    }
    var operation = passwordOnly ? reloginWithSavedPassword(context) : refreshToken(context).then(function () {
      return { password: false };
    }).catch(function (error) {
      if (!contextMatches(context)) throw switchedError();
      if (error.code !== 'UNAUTHORIZED') throw error;
      return reloginWithSavedPassword(context);
    });
    recovering[key] = operation.then(function (value) {
      delete recovering[key];
      return value;
    }, function (error) {
      delete recovering[key];
      throw error;
    });
    return recovering[key];
  }

  function parse(res) {
    try { return JSON.parse(res.text); } catch (e) { return null; }
  }

  // ---------- JSON API ----------
  function apiRequest(path, opts, unwrap) {
    opts = opts || {};
    var context = authContext();
    var tracked = opts.trackAuth !== false && opts.auth !== false;
    var method = opts.method || 'GET';
    var url = (opts.daycard ? ORIGIN : API) + path;
    if (opts.query) {
      var qs = [];
      Object.keys(opts.query).forEach(function (k) {
        var v = opts.query[k];
        if (v === undefined || v === null || v === '') return;
        qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      });
      if (qs.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
    }
    var headers = { 'Accept': 'application/json', 'Accept-Language': 'zh' };
    if (path.indexOf('/admin/') !== 0 && path !== '/admin') {
      headers['X-User-UI-Request'] = '1';
    }
    var body = null;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    if (opts.auth !== false) {
      var t = AUTH.token();
      if (t) headers['Authorization'] = 'Bearer ' + t;
      var current = activeAccount();
      if (current && current.systemToken && current.user && current.user.id != null) {
        headers['New-Api-User'] = String(current.user.id);
      }
    }
    if (opts.headers) Object.assign(headers, opts.headers);

    function attempt(retries, passwordAttempted) {
      var revision = sessionRevision;
      var attemptHeaders = Object.assign({}, headers);
      if (retries) attemptHeaders.Authorization = 'Bearer ' + AUTH.token();
      return request(method, url, attemptHeaders, body).then(function (res) {
        if (tracked && !contextMatches(context)) throw switchedError();
        var j = parse(res);
        if (res.status === 0) {
          var message = '网络连接失败';
          try { var errHeaders = JSON.parse(res.headers || '{}'); if (errHeaders.error) message = errHeaders.error; } catch (e) {}
          throw mkErr(0, 'NETWORK', message);
        }
        if (res.status === 401 && opts.auth !== false && context.id) {
          if (retries >= 2 || passwordAttempted) {
            if (revision !== sessionRevision) throw expiredError();
            return AUTH.expire(context.id).then(function () { throw expiredError(); });
          }
          return recoverSession(context, revision, retries > 0).then(function (recovery) {
            if (!contextMatches(context)) throw switchedError();
            return attempt(retries + 1, recovery.password);
          });
        }
        if (opts.daycard) return handleDaycard(res, j);
        return unwrap ? handleEnvelope(res, j) : handle(res, j);
      });
    }
    return attempt(0);
  }

  function api(path, opts) {
    return apiRequest(path, opts, false);
  }

  function apiEnvelope(path, opts) {
    return apiRequest(path, opts, true);
  }

  function handle(res, j) {
    if (!j) {
      if (res.status >= 400) throw mkErr(res.status, 'HTTP_' + res.status, '服务暂不可用 (' + res.status + ')');
      return {};
    }
    if (j.success === true) return j.data;
    if (j.code === 0 || j.code === 'SUCCESS' || j.code === 200) return j.data;
    var msg = j.message || j.error || j.msg || (typeof j.code === 'string' ? j.code : '请求失败');
    throw mkErr(res.status >= 400 ? res.status : 400, j.code, localize(msg));
  }

  function handleEnvelope(res, j) {
    if (!j || typeof j !== 'object' || Array.isArray(j)) {
      handle(res, j);
      throw mkErr(res.status >= 400 ? res.status : 400, 'BAD_ENVELOPE', '接口返回格式异常');
    }
    if (j.success === true || j.code === 0 || j.code === 'SUCCESS' || j.code === 200) return j;
    handle(res, j);
    throw mkErr(res.status >= 400 ? res.status : 400, 'BAD_ENVELOPE', '接口返回格式异常');
  }

  function handleDaycard(res, value) {
    if (res.status < 200 || res.status >= 300) {
      var message = value && (value.error || value.message);
      throw mkErr(res.status, 'DAYCARD_HTTP_' + res.status, localize(message) || '日卡服务暂不可用 (' + res.status + ')');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.error) {
      // The site answers business rejections (余额不足, 已持有订阅 …) with HTTP 200 + {error}.
      // Those are definite answers, so mark them as final instead of leaving the payment in doubt.
      var failure = mkErr(value && value.error ? 400 : res.status, 'DAYCARD_RESPONSE',
        localize(value && value.error) || '日卡服务返回不完整');
      failure.final = true;
      throw failure;
    }
    return value;
  }

  // ---------- public ----------
  var cache = {};
  var cacheGeneration = 0;
  function cached(key, ttl, loader) {
    var hit = cache[key];
    var now = Date.now();
    if (hit && now - hit.at < ttl) return Promise.resolve(hit.value);
    var generation = cacheGeneration;
    return loader().then(function (v) {
      if (generation === cacheGeneration) cache[key] = { at: now, value: v };
      return v;
    });
  }
  function clearCache() { cache = {}; cacheGeneration++; }

  function formatQuota(value) {
    var quota = Number(value);
    if (!isFinite(quota)) return '¥0.00';
    return '¥' + (quota / 500000).toFixed(2);
  }

  function groupId(name) {
    var text = String(name || '');
    return text === 'default' || text === '' ? 0 : text;
  }

  /* conditioning3: keep api contract parsing in one place. */
  function objectEntries(value) {
    if (Array.isArray(value)) return value.map(function (item, index) { return [String(index), item]; });
    return value && typeof value === 'object' ? Object.keys(value).map(function (key) { return [key, value[key]]; }) : [];
  }

  function finiteNumber(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    var number = Number(value);
    return isFinite(number) ? number : fallback;
  }

  function firstArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      try {
        var parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
      return value.split(',').map(function (item) { return item.trim(); }).filter(Boolean);
    }
    return [];
  }

  function availabilityMap(pricing) {
    var availability = pricing && pricing.availability;
    if (!availability || typeof availability !== 'object') return {};
    return availability.groups && typeof availability.groups === 'object' ? availability.groups : availability;
  }

  function pricingVendorMap(pricing) {
    var source = pricing && pricing.vendors;
    var output = {};
    objectEntries(source).forEach(function (entry) {
      var item = entry[1] && typeof entry[1] === 'object' ? entry[1] : {};
      var key = item.id === undefined ? entry[0] : item.id;
      if (key !== undefined && key !== null && item.name) output[String(key)] = String(item.name);
    });
    return output;
  }

  function pricingDescription(value) {
    var text = String(value || '').trim();
    return /^(?:tier|v\d*:|\s*\()/.test(text) ? '' : text;
  }

  function billingExpression(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function fixedBillingPrice(expression) {
    var match = billingExpression(expression).match(/^tier\s*\(\s*"[^"]*"\s*,\s*fixed\s*\(\s*([0-9]+(?:\.[0-9]+)?)\s*\)\s*\)$/i);
    return match ? Number(match[1]) : null;
  }

  function simpleBillingPrice(expression, groupRatio) {
    var match = billingExpression(expression).match(
      /^tier\s*\(\s*"[^"]*"\s*,\s*p\s*\*\s*([0-9]+(?:\.[0-9]+)?)(?:\s*\+\s*c\s*\*\s*([0-9]+(?:\.[0-9]+)?))?(?:\s*\+\s*cr\s*\*\s*([0-9]+(?:\.[0-9]+)?))?(?:\s*\+\s*cc\s*\*\s*([0-9]+(?:\.[0-9]+)?))?(?:\s*\+\s*cc1h\s*\*\s*([0-9]+(?:\.[0-9]+)?))?\s*\)$/i
    );
    if (!match) return null;
    var multiplier = Number.isFinite(Number(groupRatio)) ? Number(groupRatio) : 1;
    function coefficient(value) {
      return value == null ? null : Number(value) * multiplier;
    }
    return {
      input: coefficient(match[1]),
      output: coefficient(match[2]),
      cacheRead: coefficient(match[3]),
      cacheWrite: coefficient(match[4]),
      cacheWrite1h: coefficient(match[5])
    };
  }

  function dynamicBilling(expression) {
    var value = billingExpression(expression);
    return !!value && !fixedBillingPrice(value) && !simpleBillingPrice(value, 1);
  }

  /*
   * BearLab pricing.data is the authoritative catalog. Each row can target
   * several groups, so the raw row is expanded into (group, model) entries.
   * The group multiplier is applied by the display layer; model_ratio is an
   * official base ratio and model_price is a per-request value whose unit
   * varies by route. The billing expression is kept as a label fallback for
   * conditional formulas that cannot be represented by one fixed price.
   */
  function normalizePricingCatalog(pricing) {
    var source = pricing && pricing.data;
    if (!source || typeof source !== 'object') return [];
    var vendors = pricingVendorMap(pricing);
    var availability = availabilityMap(pricing);
    var listedGroups = pricing && pricing.group_ratio && typeof pricing.group_ratio === 'object'
      ? pricing.group_ratio : {};
    function availabilityFor(group, model) {
      var bucket = availability && availability[group];
      if (!bucket || typeof bucket !== 'object') return null;
      var value = bucket[model];
      return finiteNumber(value, null);
    }
    var output = [];
    objectEntries(source).forEach(function (entry) {
      var row = entry[1];
      if (!row || typeof row !== 'object') return;
      var name = String(row.model_name || row.name || row.model || row.id || '');
      if (!name) return;
      var groups = firstArray(row.enable_groups).map(String).filter(Boolean);
      if (!groups.length && row.group) groups = [String(row.group)];
      if (!groups.length) groups = ['default'];
      var endpoints = firstArray(row.supported_endpoint_types).map(String);
      var expression = billingExpression(row.billing_expr);
      var fixedPrice = fixedBillingPrice(expression);
      var perCall = finiteNumber(row.quota_type, 0) === 1 || fixedPrice !== null;
      var requestPrice = finiteNumber(row.model_price, 0);
      if (fixedPrice !== null) requestPrice = fixedPrice;
      var modelRatio = finiteNumber(row.model_ratio, 0);
      var completionRatio = finiteNumber(row.completion_ratio, 1);
      var cacheRatio = finiteNumber(row.cache_ratio, null);
      var createCacheRatio = finiteNumber(row.create_cache_ratio, null);
      var expressionPricing = !perCall && simpleBillingPrice(expression, 1);
      if (expressionPricing) {
        // BearLab expressions are expressed in CNY per million tokens.
        // Keep their coefficients separate from the ratio-based catalog.
        modelRatio = null;
        completionRatio = null;
        cacheRatio = null;
        createCacheRatio = null;
      }
      var mode = perCall ? (/image/i.test(name) ? 'image' : 'request') : 'token';
      groups.forEach(function (group) {
        var ratio = finiteNumber(listedGroups[group], 1);
        var groupExpressionPricing = expressionPricing ? simpleBillingPrice(expression, ratio) : null;
        output.push({
          id: name,
          name: name,
          group: group,
          group_ratio: ratio,
          mode: mode,
          quota_type: finiteNumber(row.quota_type, 0),
          model_ratio: modelRatio,
          model_price: requestPrice,
          completion_ratio: completionRatio,
          cache_ratio: cacheRatio,
          create_cache_ratio: createCacheRatio,
          context: finiteNumber(row.context_length || row.max_context_tokens || row.context_window, 0),
          vendor: vendors[String(row.vendor_id)] || String(row.owner_by || ''),
          endpoints: endpoints,
          billing_mode: String(row.billing_mode || ''),
          billing_expr: expression,
          dynamic_billing: dynamicBilling(expression),
          expression_pricing: groupExpressionPricing,
          pricing_version: String(row.pricing_version || ''),
          availability: availabilityFor(group, name),
          description: pricingDescription(row.description),
          icon: String(row.icon || ''),
          tags: firstArray(row.tags),
          raw: row
        });
      });
    });
    return output.filter(function (item, index, all) {
      return all.findIndex(function (candidate) {
        return candidate.group === item.group && candidate.name === item.name;
      }) === index;
    });
  }

  function normalizeModels(value) {
    var list = [];
    function add(item, fallbackGroup) {
      if (typeof item === 'string') list.push({ id: item, name: item, group: fallbackGroup || '', mode: 'token' });
      else if (item && typeof item === 'object') {
        var name = item.id || item.name || item.model || item.model_name;
        if (!name) return;
        list.push(Object.assign({}, item, {
          id: String(name),
          name: String(name),
          group: String(item.group || fallbackGroup || ''),
          mode: item.type || item.mode || 'token',
          context: Number(item.context_length || item.context_window || 0),
          ratio: Number(item.ratio || item.completion_ratio || item.ratio_model || 1),
          description: String(item.description || item.remark || '')
        }));
      }
    }
    if (Array.isArray(value)) {
      value.forEach(function (item) { add(item, ''); });
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (key) {
        var entry = value[key];
        if (Array.isArray(entry)) entry.forEach(function (item) { add(item, key); });
        else add({ id: key, group: key, ratio: entry }, key);
      });
    }
    return list.filter(function (item, index, all) {
      return all.findIndex(function (candidate) {
        return candidate.name === item.name && candidate.group === item.group;
      }) === index;
    });
  }

  function normalizeGroup(name, value) {
    var item = value && typeof value === 'object' ? value : {};
    var label = String(name || item.name || item.group || '默认分组');
    return {
      id: groupId(label),
      name: label,
      ratio: /^auto$/i.test(String(item.ratio || item.group_ratio || '')) ? 'auto' :
        finiteNumber(item.ratio || item.group_ratio, 1),
      auto_ratio: /^auto$/i.test(String(item.ratio || item.group_ratio || '')),
      desc: String(item.desc || item.description || '')
    };
  }

  var plazaRequest = null;
  function buildPlaza() {
    if (plazaRequest) return plazaRequest;
    plazaRequest = Promise.all([
      Api.groups().catch(function () { return {}; }),
      api('/user/models', { query: { grouped: true } }).catch(function () { return null; }),
      apiEnvelope('/pricing', { auth: false, query: { include_ratio: 1 } }).catch(function () { return null; })
    ]).then(function (values) {
      var rawGroups = values[0] || {};
      var groupedModels = values[1];
      var pricing = values[2];
      var catalog = normalizePricingCatalog(pricing);
      var catalogByName = {};
      catalog.forEach(function (item) { catalogByName[item.group + '\\u0000' + item.name] = item; });
      var groupEntries = Array.isArray(rawGroups)
        ? rawGroups.map(function (item) { return [item.name || item.id, item]; })
        : Object.keys(rawGroups || {}).map(function (name) { return [name, rawGroups[name]]; });
      var usable = pricing && pricing.usable_group && typeof pricing.usable_group === 'object'
        ? pricing.usable_group : {};
      var ratios = pricing && pricing.group_ratio && typeof pricing.group_ratio === 'object'
        ? pricing.group_ratio : {};
      var catalogGroups = {};
      catalog.forEach(function (item) {
        if (!catalogGroups[item.group]) catalogGroups[item.group] = { ratio: item.group_ratio, desc: '' };
      });
      objectEntries(usable).forEach(function (entry) {
        catalogGroups[entry[0]] = catalogGroups[entry[0]] || {};
        catalogGroups[entry[0]].ratio = finiteNumber(ratios[entry[0]], catalogGroups[entry[0]].ratio);
        if (typeof entry[1] === 'string') catalogGroups[entry[0]].desc = entry[1];
      });
      var groups = [];
      groupEntries.forEach(function (entry) {
        var name = String(entry[0] || '');
        if (!name) return;
        var config = entry[1] || {};
        var models = [];
        if (groupedModels && typeof groupedModels === 'object' && groupedModels[name]) {
          models = normalizeModels(groupedModels[name]);
        }
        var autoRatio = /^auto$/i.test(String(config.ratio || config.group_ratio || ratios[name] || ''));
        groups.push({
          id: groupId(name), name: name, platform: '',
          ratio: autoRatio ? 'auto' : finiteNumber(config.ratio || config.group_ratio, finiteNumber(ratios[name], 1)),
          auto_ratio: autoRatio,
          description: String(config.description || catalogGroups[name] && catalogGroups[name].desc || ''),
          subscription_type: config.subscription_type || '', models: models, updated_at: ''
        });
      });
      var known = {};
      groups.forEach(function (group) { known[group.name] = group; });
      Object.keys(catalogGroups).forEach(function (name) {
        if (known[name]) return;
        var catalogAuto = /^auto$/i.test(String(catalogGroups[name].ratio || ratios[name] || ''));
        known[name] = {
          id: groupId(name), name: name, platform: '',
          ratio: catalogAuto ? 'auto' : finiteNumber(catalogGroups[name].ratio, finiteNumber(ratios[name], 1)),
          auto_ratio: catalogAuto,
          description: String(catalogGroups[name].desc || ''), subscription_type: '', models: [], updated_at: ''
        };
        groups.push(known[name]);
      });
      groups.forEach(function (group) {
        var enriched = [];
        (group.models || []).forEach(function (model) {
          var row = catalogByName[group.name + '\\u0000' + model.name];
          enriched.push(row || model);
        });
        if (!group.models.length) {
          catalog.forEach(function (item) {
            if (item.group === group.name) enriched.push(item);
          });
        }
        group.models = enriched.filter(function (item, index, all) {
          return all.findIndex(function (candidate) { return candidate.name === item.name; }) === index;
        });
        if (group.description) group.desc = group.description;
      });
      var pricingModels = catalog;
      if (!groups.length && pricingModels.length) {
        groups.push({ id: 0, name: '默认分组', platform: '', ratio: 1, models: pricingModels, updated_at: '' });
      }
      return { groups: groups, models: pricingModels, updated_at: '', currency: 'CNY', quota_per_unit: 500000 };
    }).then(function (value) {
      plazaRequest = null;
      return value;
    }, function (error) {
      plazaRequest = null;
      throw error;
    });
    return plazaRequest;
  }

  function normalizeToken(raw) {
    var item = raw && typeof raw === 'object' ? raw : {};
    var status = Number(item.status || 1);
    return Object.assign({}, item, {
      id: item.id,
      key: String(item.key || ''),
      name: String(item.name || ''),
      status: status === 1 ? 'active' : status === 2 ? 'disabled' : status === 3 ? 'expired' : 'exhausted',
      status_code: status,
      current_concurrency: item.current_concurrency === undefined || item.current_concurrency === null
        ? null : Number(item.current_concurrency),
      expired_at: Number(item.expired_time || -1) > 0 ? Number(item.expired_time) * 1000 : 0,
      expired_time: Number(item.expired_time == null ? -1 : item.expired_time),
      remain_quota: Number(item.remain_quota || 0),
      unlimited_quota: item.unlimited_quota === true,
      used_quota: Number(item.used_quota || 0),
      group_id: groupId(item.group || item.group_name || 'default'),
      group_name: String(item.group || item.group_name || '默认分组'),
      model_limits_enabled: item.model_limits_enabled === true,
      model_limits: String(item.model_limits || ''),
      allow_ips: String(item.allow_ips || ''),
      cross_group_retry: item.cross_group_retry === true,
      created_at: Number(item.created_time || 0) * 1000,
      accessed_at: Number(item.accessed_time || 0) * 1000
    });
  }

  function tokenPayload(payload) {
    var item = payload || {};
    var status = Number(item.status_code || (item.status === 'active' ? 1 : item.status === 'disabled' ? 2 : 0));
    var output = {
      name: item.name == null ? '' : String(item.name),
      remain_quota: Number(item.remain_quota || 0),
      unlimited_quota: item.unlimited_quota === true,
      model_limits_enabled: item.model_limits_enabled === true,
      model_limits: String(item.model_limits || ''),
      allow_ips: String(item.allow_ips || ''),
      group: String(item.group || item.group_name || ''),
      expired_time: Number(item.expired_time == null ? -1 : item.expired_time)
    };
    if (item.expired_at) output.expired_time = Math.floor(Number(item.expired_at) / 1000);
    if (status) output.status = status;
    return output;
  }

  function unixSeconds(value) {
    var number = Number(value);
    if (!isFinite(number) || number <= 0) return 0;
    return number > 100000000000 ? Math.floor(number / 1000) : Math.floor(number);
  }

  function dateSeconds(value, endOfDay) {
    var text = String(value || '').trim();
    if (!text) return 0;
    var match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return unixSeconds(text);
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return isFinite(date.getTime()) ? Math.floor(date.getTime() / 1000) : 0;
  }

  function logQuery(query) {
    var input = query || {};
    var output = {};
    ['type', 'token_name', 'model_name', 'group', 'request_id', 'upstream_request_id', 'page', 'page_size'].forEach(function (name) {
      if (input[name] !== undefined && input[name] !== null && input[name] !== '') output[name] = input[name];
    });
    var start = input.start_timestamp || input.start || input.from;
    var end = input.end_timestamp || input.end || input.to;
    if (start) output.start_timestamp = unixSeconds(start);
    if (end) output.end_timestamp = unixSeconds(end);
    if (!output.start_timestamp && input.start_date) {
      output.start_timestamp = dateSeconds(input.start_date, false);
    }
    if (!output.end_timestamp && input.end_date) {
      output.end_timestamp = dateSeconds(input.end_date, true);
    }
    if (!start && input.range === 'today') {
      var now = new Date();
      output.start_timestamp = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
      output.end_timestamp = Math.floor(now.getTime() / 1000);
    }
    return output;
  }

  function logTimestamp(value) {
    var seconds = Number(value || 0);
    if (!isFinite(seconds) || seconds <= 0) return '';
    return new Date(seconds * 1000).toISOString();
  }

  function normalizeLog(raw) {
    var item = raw && typeof raw === 'object' ? raw : {};
    var prompt = finiteNumber(item.prompt_tokens, finiteNumber(item.input_tokens, 0));
    var completion = finiteNumber(item.completion_tokens, finiteNumber(item.output_tokens, 0));
    var tokens = prompt + completion;
    var cash = Number(item.quota || 0) / 500000;
    return Object.assign({}, item, {
      id: item.id,
      createdAt: Number(item.created_at || 0) * 1000,
      created_at: logTimestamp(item.created_at),
      type: Number(item.type || 0),
      model: String(item.model_name || ''),
      model_name: String(item.model_name || ''),
      prompt_tokens: prompt,
      completion_tokens: completion,
      input_tokens: prompt,
      output_tokens: completion,
      total_tokens: tokens,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      quota: Number(item.quota || 0),
      cost: cash,
      actual_cost: cash,
      total_cost: cash,
      duration: Number(item.use_time || 0),
      duration_ms: Number(item.use_time || 0) * 1000,
      use_time: Number(item.use_time || 0),
      is_stream: item.is_stream === true,
      token_name: String(item.token_name || ''),
      group: String(item.group || ''),
      group_name: String(item.group || ''),
      channel_id: item.channel,
      request_id: String(item.request_id || ''),
      upstream_request_id: String(item.upstream_request_id || ''),
      content: String(item.content || '')
    });
  }

  function normalizeRequestLog(raw) {
    var item = normalizeLog(raw);
    var prompt = finiteNumber(item.prompt_tokens, finiteNumber(item.input_tokens, 0));
    var completion = finiteNumber(item.completion_tokens, finiteNumber(item.output_tokens, 0));
    var tokens = Number(item.total_tokens || prompt + completion || 0);
    return Object.assign({}, item, {
      input_tokens: prompt,
      output_tokens: completion,
      total_tokens: tokens,
      pricing_model: String(item.model_name || item.model || '未知模型')
    });
  }

  function normalizeRequestLogs(raw) {
    var input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var items = Array.isArray(raw) ? raw : (Array.isArray(input.items) ? input.items : []);
    return {
      items: items.map(normalizeRequestLog),
      page: Number(input.page || 1),
      page_size: Number(input.page_size || items.length),
      total: Number(input.total == null ? items.length : input.total)
    };
  }

  function normalizeUsageRecords(raw) {
    var records = Array.isArray(raw) ? raw : [];
    return records.map(function (item) {
      var quota = Number(item.quota || 0);
      var date = new Date(Number(item.created_at || 0) * 1000);
      var model = String(item.model_name || item.model || '');
      return {
        date: isNaN(date.getTime()) ? '' : [
          date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')
        ].join('-'),
        model: model,
        count: Number(item.count || 0),
        requests: Number(item.count || 0),
        tokens: Number(item.token_used || item.tokens || 0),
        quota: quota,
        actual_cost: quota / 500000,
        cost: quota / 500000
      };
    });
  }

  function normalizeUsageTrend(raw) {
    var records = Array.isArray(raw) ? raw : [];
    var byDay = {};
    records.forEach(function (item) {
      var date = new Date(Number(item.created_at || 0) * 1000);
      var key = isNaN(date.getTime()) ? '' : [
        date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')
      ].join('-');
      var row = byDay[key] || (byDay[key] = { date: key, model: '', count: 0, requests: 0, tokens: 0, quota: 0,
        actual_cost: 0, cost: 0, records: 0 });
      row.count += Number(item.count || 0);
      row.requests += Number(item.count || 0);
      row.tokens += Number(item.token_used || 0);
      row.quota += Number(item.quota || 0);
      row.actual_cost += Number(item.quota || 0) / 500000;
      row.cost += Number(item.quota || 0) / 500000;
      row.records++;
    });
    return Object.keys(byDay).sort().map(function (key) { return byDay[key]; });
  }

  var agreementRequest = null, agreementConsent = U.store.get('bearlab_login_agreement_consent', '');
  function loginAgreement() {
    if (agreementRequest) return agreementRequest;
    agreementRequest = api('/status', { auth: false }).then(function (settings) {
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('条款配置不可用');
      if (settings.user_agreement_enabled !== true && settings.privacy_policy_enabled !== true) return null;
      var documents = [];
      if (settings.user_agreement_enabled === true) {
        documents.push({ id: 'terms', title: '用户协议', url: ORIGIN + '/user-agreement' });
      }
      if (settings.privacy_policy_enabled === true) {
        documents.push({ id: 'privacy', title: '隐私政策', url: ORIGIN + '/privacy-policy' });
      }
      var revision = [
        settings.version || '', settings.user_agreement_enabled ? 'terms' : '',
        settings.privacy_policy_enabled ? 'privacy' : ''
      ].join(':');
      return { revision: revision, updated: '', mode: 'checkbox', documents: documents };
    }).finally(function () { agreementRequest = null; });
    return agreementRequest;
  }

  var Api = {
    ORIGIN: ORIGIN, API: API, V1: V1, AUTH: AUTH, base: api, clearCache: clearCache,
    formatQuota: formatQuota, groupId: groupId,
    settings: function () {
      return cached('settings', 5 * 60e3, function () {
        return api('/status', { auth: false }).then(function (raw) {
          var status = raw && raw.data && typeof raw.data === 'object' ? raw.data : raw;
          return Object.assign({}, status || {}, {
            system_name: String(status && (status.system_name || status.systemName) || 'BearLab AI'),
            site_name: String(status && (status.site_name || status.system_name || status.systemName) || 'BearLab AI'),
            registration_enabled: !status || status.register_enabled !== false,
            quota_per_unit: Number(status && status.quota_per_unit || 500000),
            quota_display_type: 'CNY'
          });
        });
      });
    },
    loginAgreement: loginAgreement,
    hasLoginAgreement: function (agreement) { return !agreement || agreementConsent === agreement.revision; },
    acceptLoginAgreement: function (agreement) {
      if (!agreement || !agreement.revision) return;
      agreementConsent = agreement.revision;
      U.store.set('bearlab_login_agreement_consent', agreementConsent);
    },
    requireLoginAgreement: function () {
      return loginAgreement().then(function (agreement) {
        if (!Api.hasLoginAgreement(agreement)) {
          var error = mkErr(0, 'LOGIN_AGREEMENT_REQUIRED', '请先确认最新版服务条款');
          error.agreement = agreement;
          throw error;
        }
        return agreement;
      });
    },
    plaza: function (force) {
      if (force) {
        delete cache.plaza;
        return buildPlaza().then(function (value) { cache.plaza = { at: Date.now(), value: value }; return value; });
      }
      return cached('plaza', 10 * 60e3, buildPlaza);
    },
    channelStatus: function () {
      return Api.plaza().catch(function () { return null; }).then(function (plaza) {
        var items = [];
        ((plaza && plaza.groups) || []).forEach(function (group) {
          (group.models || []).forEach(function (model) {
            if (!model || model.availability === null || model.availability === undefined) return;
            var availability = Number(model.availability);
            if (!isFinite(availability)) return;
            items.push({
              model: model.name, group: group.name,
              vendor: model.vendor || '',
              status: availability <= 0 ? 'failed' : availability < 95 ? 'degraded' : 'operational',
              availability: availability, latency: null, ping: null, timeline: []
            });
          });
        });
        return { items: items, updatedAt: new Date().toISOString() };
      });
    },
    modelStatus: function () {
      return Api.channelStatus();
    },
    modelPlazaVersion: function () { return Api.plaza(true).then(function (plaza) {
      return JSON.stringify((plaza.groups || []).map(function (group) {
        return [group.id, group.name, group.platform, group.subscription_type || '', (group.models || []).map(function (model) {
          return model && (model.name || model.id);
        }).filter(Boolean).sort().join(',')].join(':');
      }).sort());
    }); },
    announcements: function () {
      return Api.settings().then(function (status) {
        var raw = status && Array.isArray(status.announcements) ? status.announcements : [];
        return raw.map(function (item) {
          return {
            id: item.id,
            title: item.title || '',
            content: item.content || '',
            extra: item.extra || '',
            type: item.type || 'default',
            category: item.category || '',
            published_at: item.publishDate || item.published_at || item.created_at || ''
          };
        });
      });
    },
    locale: function () { return Promise.resolve({ locale: 'zh' }); },

    login: function (email, password, extra, rememberPassword) {
      var body = Object.assign({ username: email, password: password }, extra || {});
      var context = authContext();
      return Api.requireLoginAgreement().then(function () {
        if (!contextMatches(context)) throw switchedError();
        return api('/user/login', { method: 'POST', body: body, auth: false, trackAuth: false });
      }).then(function (d) {
        if (d && d.require_verification) {
          var challenge = mkErr(200, 'TWO_FACTOR_REQUIRED', '该账号需要两步验证');
          challenge.verification = d;
          throw challenge;
        }
        if (!contextMatches(context)) throw switchedError();
        return AUTH.commit(d, email, { rememberPassword: !!rememberPassword, password: password }).then(function (saved) { return { data: d, saved: saved }; });
      }).then(function (result) {
        clearCache();
        return result;
      });
    },
    login2fa: function (payload, rememberPassword) {
      var context = authContext();
      if (!contextMatches(context)) return Promise.reject(switchedError());
      return api('/user/login/2fa', {
        method: 'POST',
        body: { flow_token: payload.flow_token, method: '2fa', code: payload.code },
        auth: false,
        trackAuth: false
      }).then(function (d) {
        if (!contextMatches(context)) throw switchedError();
        return AUTH.commit(d, payload.username || payload.email, { rememberPassword: !!rememberPassword, password: payload.password })
          .then(function (saved) { clearCache(); return { data: d, saved: saved }; });
      });
    },
    systemLogin: function (token) {
      var context = authContext();
      var value = String(token || '').trim();
      return request('GET', API + '/user/self', {
        'Accept': 'application/json', 'Accept-Language': 'zh',
        'Authorization': 'Bearer ' + value
      }, null).then(function (res) {
        var profile = handle(res, parse(res));
        if (!contextMatches(context)) throw switchedError();
        return AUTH.commitSystemToken(value, profile).then(function (saved) { clearCache(); return { data: profile, saved: saved }; });
      });
    },
    register: function (payload) {
      var context = authContext();
      return api('/user/register', {
        method: 'POST',
        body: {
          username: payload.email,
          password: payload.password,
          email: payload.email,
          verification_code: payload.verify_code
        },
        auth: false,
        trackAuth: false
      }).then(function (d) {
        if (!contextMatches(context)) throw switchedError();
        return AUTH.commit(d, payload.email).then(function (saved) { clearCache(); return { data: d, saved: saved }; });
      });
    },
    sendCode: function (payload) {
      return api('/verification', { query: { email: payload.email, purpose: 'register' }, auth: false });
    },
    forgot: function (payload) {
      return api('/reset_password', { query: { email: payload.email }, auth: false });
    },
    reset: function (payload) {
      return api('/user/reset', {
        method: 'POST',
        body: { email: payload.email, token: payload.verify_code, password: payload.new_password },
        auth: false
      });
    },
    me: function (options) {
      var context = authContext();
      return api('/user/self').then(function (u) {
        if (!contextMatches(context)) throw switchedError();
        if (options && options.balanceOnly) {
          var merged = Object.assign({}, AUTH.user() || {}, u);
          return (activeAccount() && activeAccount().systemToken ? AUTH.markSystemProfile(merged, context) : AUTH.setUser(merged, context))
            .then(function () { return merged; });
        }
        return (activeAccount() && activeAccount().systemToken ? AUTH.markSystemProfile(u, context) : AUTH.setUser(u, context))
          .then(function () { return u; });
      });
    },
    logout: function () {
      var context = authContext();
      api('/user/auth/logout', { method: 'POST' }).catch(function () {});
      return AUTH.expire(context.id, 'logout').then(function (saved) { return { saved: saved }; });
    },

    keys: function (page, size, filters) {
      var query = Object.assign({ p: page || 1, page_size: size || 50 }, filters || {});
      return api('/token/', { query: query }).then(function (data) {
        return {
          items: (data && data.items || []).map(normalizeToken),
          page: data && Number(data.page || query.p),
          page_size: data && Number(data.page_size || query.page_size),
          total: data && Number(data.total || 0)
        };
      });
    },
    keyCreate: function (payload) {
      return api('/token/', { method: 'POST', body: tokenPayload(payload) }).then(normalizeToken);
    },
    keyUpdate: function (id, payload) {
      var item = payload || {};
      var hasStatus = Object.prototype.hasOwnProperty.call(item, 'status') ||
        Object.prototype.hasOwnProperty.call(item, 'status_code');
      var fullUpdate = ['name', 'remain_quota', 'unlimited_quota', 'expired_time', 'expired_at',
        'group', 'group_name', 'model_limits_enabled', 'model_limits', 'allow_ips', 'cross_group_retry']
        .some(function (name) { return Object.prototype.hasOwnProperty.call(item, name); });
      if (hasStatus && !fullUpdate) {
        return api('/token/', {
          method: 'PUT',
          query: { status_only: 1 },
          body: { id: Number(id), status: item.status_code || (item.status === 'active' ? 1 : 2) }
        }).then(normalizeToken);
      }
      var body = Object.assign(tokenPayload(item), { id: Number(id) });
      delete body.status;
      return api('/token/', { method: 'PUT', body: body }).then(normalizeToken);
    },
    keyDelete: function (id) { return api('/token/' + encodeURIComponent(id), { method: 'DELETE' }); },
    keyReveal: function (id) {
      return api('/token/' + encodeURIComponent(id) + '/key', { method: 'POST' }).then(function (data) {
        var value = data && data.key || '';
        if (!value || String(value).indexOf('*') >= 0 || String(value).indexOf('•') >= 0) {
          throw mkErr(0, 'KEY_REVEAL_FAILED', '无法读取完整令牌，请在 BearLab 官网重新生成');
        }
        return value;
      });
    },
    resolveKey: function (key, options) {
      if (!key || !key.id) return Promise.reject(mkErr(0, 'KEY_REQUIRED', '请选择令牌'));
      if (key.key && String(key.key).indexOf('*') < 0 && String(key.key).indexOf('•') < 0) return Promise.resolve(String(key.key));
      if (key._reveal) return key._reveal;
      key._reveal = Api.keyReveal(key.id).then(function (value) {
        key._reveal = null;
        key.full = String(value || '');
        return key.full;
      }, function (error) {
        key._reveal = null;
        throw error;
      });
      return key._reveal;
    },
    groups: function () {
      return api('/user/self/groups').then(function (value) {
        if (Array.isArray(value)) return value.map(function (item) {
          return normalizeGroup(item.name || item.id || item.group, item);
        });
        var output = {};
        Object.keys(value || {}).forEach(function (name) { output[name] = normalizeGroup(name, value[name]); });
        return output;
      });
    },

    usageStats: function (query) {
      var input = query || {};
      var now = Math.floor(Date.now() / 1000);
      var statQuery = logQuery(input);
      var tokenId = input.api_key_id || input.token_id;
      if (tokenId !== undefined && tokenId !== null && tokenId !== '') {
        var tokenStart = statQuery.start_timestamp || now - 29 * 86400;
        var tokenEnd = statQuery.end_timestamp || now;
        return api('/data/self', {
          query: { start_timestamp: tokenStart, end_timestamp: tokenEnd }
        }).then(function (records) {
          var rows = (Array.isArray(records) ? records : []).filter(function (row) {
            return String(row && row.token_id) === String(tokenId);
          });
          var quota = rows.reduce(function (sum, row) { return sum + Number(row.quota || 0); }, 0);
          var requests = rows.reduce(function (sum, row) { return sum + Number(row.count || 0); }, 0);
          var tokens = rows.reduce(function (sum, row) { return sum + Number(row.token_used || 0); }, 0);
          return {
            quota: quota,
            total_requests: requests,
            total_tokens: tokens,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_actual_cost: quota / 500000,
            total_cost: quota / 500000,
            rpm: 0,
            tpm: 0
          };
        });
      }
    if (input.period === 'all') {
      return api('/user/self').then(function (user) {
        var quota = Number(user && user.used_quota || 0);
        return {
          quota: quota,
          total_requests: Number(user && user.request_count || 0),
          total_tokens: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_actual_cost: quota / 500000,
          total_cost: quota / 500000,
          rpm: 0,
          tpm: 0
        };
      });
    }
      var start = statQuery.start_timestamp || (input.period === 'all' ? 946684800 : input.period === 'today' ?
        unixSeconds(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) : now - 29 * 86400);
      var end = statQuery.end_timestamp || now;
      statQuery = Object.assign({}, statQuery, { start_timestamp: start, end_timestamp: end });
      return Promise.all([
        api('/log/self/stat', { query: statQuery }).then(function (data) {
          if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
          var items = Array.isArray(data.items) ? data.items : [];
          var quota = items.reduce(function (sum, item) {
            return sum + Number(item && item.quota || 0);
          }, 0);
          var requests = items.reduce(function (sum, item) {
            return sum + Number(item && (item.count || item.request_count) || 0);
          }, 0);
          var tokens = items.reduce(function (sum, item) {
            var direct = Number(item && (item.token_used || item.total_tokens) || 0);
            var input = Number(item && (item.prompt_tokens || item.input_tokens) || 0);
            var output = Number(item && (item.completion_tokens || item.output_tokens) || 0);
            return sum + (direct || input + output);
          }, 0);
          return {
            quota: Number(data.quota || 0) || quota,
            requests: Number(data.requests || data.request_count || data.total_requests || data.count || 0) || requests,
            tokens: Number(data.tokens || data.total_tokens || data.token_used || 0) || tokens,
            rpm: Number(data.rpm || 0),
            tpm: Number(data.tpm || 0)
          };
        }),
        api('/data/self', { query: { start_timestamp: start, end_timestamp: end } }).catch(function () { return []; })
      ]).then(function (values) {
        var data = values[0] || {};
        var aggregates = Array.isArray(values[1]) ? values[1] : [];
        var quota = Number(data.quota || 0);
        var requests = Number(data.requests || 0) || Number(aggregates.reduce(function (sum, row) {
          return sum + Number(row.count || 0);
        }, 0));
        var tokens = Number(data.tokens || 0) || Number(aggregates.reduce(function (sum, row) {
          return sum + Number(row.token_used || 0);
        }, 0));
        return {
          quota: quota,
          total_requests: requests,
          total_tokens: tokens,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_actual_cost: quota / 500000,
          total_cost: quota / 500000,
          rpm: Number(data.rpm || 0),
          tpm: Number(data.tpm || 0)
        };
      });
    },
    usageDashboard: function () {
      var now = Math.floor(Date.now() / 1000);
      return Promise.all([
        api('/user/self'),
        api('/data/self', { query: { start_timestamp: now - 29 * 86400, end_timestamp: now } }).catch(function () { return []; })
      ]).then(function (values) {
        var records = Array.isArray(values[1]) ? values[1] : [];
        return {
          quota: Number(values[0] && values[0].used_quota || 0),
          count: records.reduce(function (sum, item) { return sum + Number(item.count || 0); }, 0),
          tokens: records.reduce(function (sum, item) { return sum + Number(item.token_used || 0); }, 0),
          records: records
        };
      });
    },
    usageTrend: function (query) {
      var now = Math.floor(Date.now() / 1000);
      var range = query || {};
      var start = unixSeconds(range.start_timestamp || range.start || range.from);
      var end = unixSeconds(range.end_timestamp || range.end || range.to);
      if (!start && range.start_date) {
        start = Math.floor(new Date(range.start_date + 'T00:00:00').getTime() / 1000);
      }
      if (!end && range.end_date) {
        end = Math.floor(new Date(range.end_date + 'T23:59:59').getTime() / 1000);
      }
      return api('/data/self', {
        query: { start_timestamp: start || now - 29 * 86400, end_timestamp: end || now }
      }).then(normalizeUsageTrend);
    },
    usageModels: function (query) {
      var range = query || {};
      var now = Math.floor(Date.now() / 1000);
      var start = dateSeconds(range.start_date, false) || unixSeconds(range.start_timestamp || range.start || range.from);
      var end = dateSeconds(range.end_date, true) || unixSeconds(range.end_timestamp || range.end || range.to);
      return api('/data/self', {
        query: { start_timestamp: start || now - 29 * 86400, end_timestamp: end || now }
      }).then(normalizeUsageRecords).then(function (rows) {
        var byModel = {};
        rows.forEach(function (row) {
          var name = row.model || '未知模型';
          var item = byModel[name] || (byModel[name] = {
            model: name, count: 0, requests: 0, tokens: 0, quota: 0, actual_cost: 0, cost: 0
          });
          item.count += row.count;
          item.requests += row.requests;
          item.tokens += row.tokens;
          item.quota += row.quota;
          item.actual_cost += row.actual_cost;
          item.cost += row.cost;
        });
        return Object.keys(byModel).map(function (name) {
          var item = byModel[name];
          item.total_tokens = item.tokens;
          return item;
        });
      });
    },
    platformQuotas: function () { return Promise.resolve([]); },
    usageLogs: function (query, size, filters) {
      var input;
      if (query && typeof query === 'object') {
        input = Object.assign({}, query);
      } else {
        input = Object.assign({}, filters || {}, {
          page: query || 1,
          page_size: typeof size === 'number' ? size : 50
        });
      }
      var q = logQuery(input);
      q.p = q.page || 1;
      q.page_size = q.page_size || 50;
      delete q.page;
      return api('/log/self', { query: q }).then(normalizeRequestLogs);
    },
    usageErrors: function (query) { return Api.usageLogs(Object.assign({}, query || {}, { type: 5 })); },
    usageDetail: function (id) {
      return Api.usageLogs({ page: 1, page_size: 100 }).then(function (data) {
        return data.items.filter(function (item) { return String(item.id) === String(id); })[0] || null;
      });
    },

    profileUpdate: function (payload) { return api('/user/self', { method: 'PUT', body: payload }); },
    changePassword: function () {
      return Promise.reject(mkErr(0, 'OFFICIAL_ONLY', '修改密码需在 BearLab 官网完成安全验证'));
    },
    aff: function () {
      return Promise.all([
        api('/user/aff'),
        api('/user/self').catch(function () { return null; })
      ]).then(function (values) {
        var raw = values[0];
        var user = values[1] && typeof values[1] === 'object' ? values[1] : {};
        var code = typeof raw === 'string' ? raw : raw && (raw.code || raw.aff_code || raw.invite_code);
        return {
          code: String(code || user.aff_code || ''),
          count: Number(raw && typeof raw === 'object' && (raw.count != null ? raw.count : raw.aff_count) || user.aff_count || 0),
          quota: Number(raw && typeof raw === 'object' && (raw.quota != null ? raw.quota : raw.aff_quota) || user.aff_quota || 0),
          history_quota: Number(user.aff_history_quota || 0),
          raw: raw
        };
      });
    },
    affTransfer: function () { return api('/user/aff_transfer', { method: 'POST' }); },

    redeemHistory: function () { return Promise.resolve(null); },
    redeem: function (code) { return api('/user/topup', { method: 'POST', body: { key: code } }); },

    paymentConfig: function () { return Api.paymentInfo(); },
    paymentInfo: function () { return api('/user/topup/info'); },
    paymentAmount: function (amount) {
      return request('POST', API + '/user/amount', {
        'Authorization': 'Bearer ' + AUTH.token(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'zh'
      }, JSON.stringify({ amount: Number(amount) })).then(function (res) {
        var value = parse(res);
        if (!value || value.message !== 'success') {
          throw mkErr(res.status >= 400 ? res.status : 400, 'AMOUNT',
            localize(value && value.data || value && value.message || '应付金额计算失败'));
        }
        return value.data;
      });
    },
    createPayment: function (payload) {
      return request('POST', API + '/user/pay', {
        'Authorization': 'Bearer ' + AUTH.token(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'zh'
      }, JSON.stringify({ amount: Number(payload.amount), payment_method: payload.payment_method })).then(function (res) {
        var value = parse(res);
        if (!value || value.message !== 'success' || !value.url || !value.data) {
          throw mkErr(res.status >= 400 ? res.status : 400, 'PAYMENT',
            localize(value && value.data || value && value.message || '无法发起支付'));
        }
        return value;
      });
    },
    paymentForm: function (order) {
      if (global.Native && typeof global.Native.paymentForm === 'function') {
        try {
          return global.Native.paymentForm(JSON.stringify(order || {}));
        } catch (e) {
          return Promise.reject(mkErr(0, 'PAYMENT_BRIDGE', '无法打开支付页面'));
        }
      }
      if (global.Native && typeof global.Native.open === 'function') {
        global.Native.open(order.url);
        return true;
      }
      var form = document.createElement('form');
      form.method = 'POST';
      form.action = order.url;
      Object.keys(order.data || {}).forEach(function (name) {
        var input = document.createElement('input');
        input.type = 'hidden'; input.name = name; input.value = String(order.data[name]);
        form.appendChild(input);
      });
      form.style.display = 'none';
      document.body.appendChild(form);
      form.submit();
      return Promise.resolve(true);
    },
    topupHistory: function (query) { return api('/user/topup/self', { query: query }); },
    daycardInfo: function () { return Promise.resolve(null); },
    daycardBuy: function () {
      return Promise.reject(mkErr(0, 'UNSUPPORTED', 'BearLab 未提供日卡充值'));
    },

    subscriptions: function () { return Promise.resolve([]); },
    // ---- raw OpenAI-compatible calls (used by chat fallbacks & images) ----
    v1Post: function (path, key, payload, timeoutMs) {
      return request('POST', V1 + path, {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'zh',
        'X-User-UI-Request': '1',
        'Authorization': 'Bearer ' + key
      }, JSON.stringify(payload), timeoutMs || 120000).then(function (res) {
        var j = parse(res);
        if (res.status >= 400) throw mkErr(res.status, 'HTTP_' + res.status, readError(j, res.text));
        if (!j) throw mkErr(res.status, 'BAD_JSON', '接口返回无法解析：' + String(res.text || '').slice(0, 200));
        if (j.error && !j.choices && !j.data) throw mkErr(res.status, 'API_ERROR', readError(j, res.text));
        return j;
      });
    },
    chatOnce: function (key, payload) {
      var body = Object.assign({}, payload);
      body.stream = false;
      return Api.v1Post('/chat/completions', key, body, 150000);
    },
    generateImage: function (key, payload) {
      return Api.v1Post('/images/generations', key, payload, 180000);
    },
    modelsWithKey: function (key) {
      return request('GET', V1 + '/models', {
        'Authorization': 'Bearer ' + key, 'Accept': 'application/json',
        'Accept-Language': 'zh', 'X-User-UI-Request': '1'
      }, null)
        .then(function (res) {
          var j = parse(res);
          if (!j || res.status >= 400) throw mkErr(res.status, 'MODELS', (j && j.error && j.error.message) || '无法获取模型列表');
          return j.data || j;
        });
    }
  };

  // ---------- streaming (chat completions) ----------
  // Native bridge pushes base64 lines. Falls back to fetch streaming in browsers.
  function chatStream(payload, key, handlers) {
    handlers = handlers || {};
    var lifecycle = null;
    var watchdog = 0;
    var ctrl = null;
    var idleMs = Math.max(10000, Number(handlers.idleTimeoutMs) || 90000);
    var finished = false;

    function stopTransport() {
      try {
        if (global.Native && global.Native.stream) global.Native.abort(id);
        else if (ctrl) ctrl.abort();
      } catch (e) {}
      delete streams[id];
    }

    function armWatchdog() {
      if (finished || idleMs <= 0) return;
      clearTimeout(watchdog);
      watchdog = setTimeout(function () {
        if (finished) return;
        finished = true;
        stopTransport();
        if (handlers.onError) handlers.onError('流式响应超时，请重试', 0);
      }, idleMs);
    }

    function settle(kind, value) {
      if (finished) return;
      if (kind === 'error') {
        finished = true;
        clearTimeout(watchdog);
        stopTransport();
        if (handlers.onError) handlers.onError(value && value.message || value || '请求失败', value && value.status);
        return;
      }
      finished = true;
      clearTimeout(watchdog);
      if (kind === 'done' && handlers.onDone) handlers.onDone();
    }

    var id = 's' + (++seq);
    var headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Accept-Language': 'zh',
      'X-User-UI-Request': '1',
      'Authorization': 'Bearer ' + key
    };
    var parser = makeSseParser({
      onEvent: function (value) {
        if (finished) return;
        armWatchdog();
        if (handlers.onEvent) handlers.onEvent(value);
      },
      onDone: function () { settle('done'); },
      onError: function (message, status) { settle('error', { message: message, status: status }); }
    });
    streams[id] = parser;
    lifecycle = {
      abort: function () {
        finished = true;
        clearTimeout(watchdog);
        stopTransport();
      }
    };
    armWatchdog();

    if (!(global.Native && global.Native.stream)) {
      // browser fallback
      ctrl = new AbortController();
      var streamUrl = browserUrl(V1 + '/chat/completions');
      if (streamUrl !== V1 + '/chat/completions') headers['X-Bearlab-Preview'] = '1';
      fetch(streamUrl, {
        method: 'POST', headers: headers, body: JSON.stringify(payload), signal: ctrl.signal
      }).then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) {
            parser.error(t || ('HTTP ' + r.status), r.status);
          });
        }
        if (!r.body) throw new Error('接口未返回流式内容');
        var reader = r.body.getReader();
        var dec2 = new TextDecoder();
        function pump() {
          return reader.read().then(function (res) {
            if (res.done) { parser.push(dec2.decode()); parser.end(); return; }
            var chunk = dec2.decode(res.value, { stream: true });
            parser.push(chunk);
            return pump();
          });
        }
        return pump();
      }).catch(function (e) { if (e.name !== 'AbortError') parser.error(e.message); })
        .then(function () { delete streams[id]; });
      return {
        abort: function () {
          try { ctrl.abort(); } catch (e) {}
          if (lifecycle && lifecycle.abort) lifecycle.abort();
        }
      };
    }

    global.Native.stream(id, 'POST', V1 + '/chat/completions', JSON.stringify(headers), JSON.stringify(payload));
    return lifecycle;
  }

  function makeSseParser(h) {
    var buffer = '', finished = false;
    function line(text) {
      if (finished || text.indexOf('data:') !== 0) return;
      var data = text.slice(5).trim();
      if (data === '[DONE]') { end(); return; }
      try { var value = JSON.parse(data); } catch (e) { return; }
      if (h.onEvent) h.onEvent(value);
    }
    function end() {
      if (finished) return;
      finished = true;
      if (h.onDone) h.onDone();
    }
    return {
      push: function (chunk) {
        if (finished) return;
        buffer += chunk;
        var lines = buffer.split(/\n/);
        buffer = lines.pop();
        lines.forEach(function (part) { line(part.replace(/\r$/, '')); });
      },
      end: function () { if (buffer) line(buffer.replace(/\r$/, '')); end(); },
      error: function (msg, status) {
        if (finished) return;
        finished = true;
        if (h.onError) h.onError(msg, status);
      }
    };
  }

  global.__nativeHttp = function (id, status, b64, headers) {
    var cb = pending[id];
    if (!cb) return;
    var text = '';
    try { text = b64 ? dec(b64) : ''; } catch (e) {}
    cb(status, text, headers);
  };

  global.__nativeChunk = function (id, b64) {
    var s = streams[id];
    if (!s) return;
    var line;
    try { line = dec(b64); } catch (e) { return; }
    s.push(line + '\n');
  };

  global.__nativeEnd = function (id, err, status) {
    var s = streams[id];
    if (!s) return;
    delete streams[id];
    if (err) {
      var msg = err;
      try {
        var j = JSON.parse(err);
        if (j && (j.message || j.error)) msg = (j.error && j.error.message) || j.message;
      } catch (e) {}
      s.error(typeof msg === 'string' ? localize(msg) : '请求失败', status);
    } else {
      s.end();
    }
  };

  Api.chatStream = chatStream;
  function readError(j, raw) {
    var msg = '';
    if (j) {
      if (j.error) msg = typeof j.error === 'string' ? j.error : (j.error.message || j.error.msg || j.error.code || '');
      else msg = j.message || j.msg || '';
    }
    if (!msg) msg = String(raw || '').trim().slice(0, 300);
    return localize(msg) || ('请求失败 (' + (raw || '').slice(0, 80) + ')');
  }

  global.Api = Api;
  global.Api.dec = dec;
})(window);
