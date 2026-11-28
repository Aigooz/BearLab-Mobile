/* Shared UI pieces + 首页 / 模型广场 / 公告 / 关于 */
(function (global) {
  'use strict';
  var U = global.U;
  var S = global.S;

  function h(tag, attrs) {
    var kids = [];
    for (var i = 2; i < arguments.length; i++) {
      var a = arguments[i];
      if (Array.isArray(a)) kids = kids.concat(a);
      else kids.push(a);
    }
    return U.el(tag, attrs, kids);
  }

  function section(title, moreText, onMore, children) {
    if (!title) return h('div', { class: 'section' }, children);
    var head = h('div', { class: 'section-head' },
      h('h2', null, title),
      moreText ? h('button', { onclick: onMore }, moreText + ' ›') : null
    );
    return h('div', { class: 'section' }, head, children);
  }

  function listItem(icon, title, sub, tail, onClick) {
    return h('div', { class: 'list-item', onclick: onClick },
      icon ? h('span', { class: 'li-icon', html: U.ic(icon, 17) }) : null,
      h('div', { class: 'li-body' },
        h('div', { class: 'li-title' }, title),
        sub ? h('div', { class: 'li-sub' }, sub) : null
      ),
      tail ? h('div', { class: 'li-tail' }, tail) : null
    );
  }

  function emptyState(title, sub, icon) {
    return h('div', { class: 'empty' },
      h('div', { html: U.ic(icon || 'sparkle', 38) }),
      h('p', null, title),
      sub ? h('small', null, sub) : null
    );
  }

  function card(kids, cls) {
    return h('div', { class: 'card ' + (cls || '') }, kids);
  }

  function arrOf(d, fallback) {
    if (Array.isArray(d)) return d;
    if (!d) return fallback || [];
    var keys = ['items', 'list', 'data', 'records', 'results', 'rows', 'orders', 'plans', 'keys', 'logs'];
    for (var i = 0; i < keys.length; i++) if (Array.isArray(d[keys[i]])) return d[keys[i]];
    return fallback || [];
  }

  function totalOf(d) {
    if (!d) return 0;
    var t = d.total || d.count || d.total_count || d.pagination && (d.pagination.total || d.pagination.total_count);
    return Number(t) || 0;
  }

  function pick(obj) {
    for (var i = 1; i < arguments.length; i++) {
      var k = arguments[i];
      if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    }
    return undefined;
  }

  var BRAND_NAME = 'BearLab AI';
  var DEFAULT_SUBTITLE = '统一模型接入，透明用量与计费';
  var LOGO_FALLBACK = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="14" fill="#1167d8"/>' +
    '<path d="M16 14h18c10 0 16 5 16 13 0 5-3 9-8 11 6 2 9 6 9 12 0 9-7 14-18 14H16V14zm12 10v9h6c4 0 6-2 6-5s-2-4-6-4h-6zm0 19v10h7c4 0 7-2 7-5s-3-5-7-5h-7z" fill="#fff"/>' +
    '</svg>'
  );

  function settings() {
    return global.S && global.S.settings || {};
  }

  function siteName() {
    return settings().site_name || BRAND_NAME;
  }

  function siteSubtitle() {
    return settings().site_subtitle || DEFAULT_SUBTITLE;
  }

  function absoluteSiteUrl(value) {
    if (!value) return '';
    try { return new URL(String(value), (Api.ORIGIN || '') + '/').href; }
    catch (e) { return String(value); }
  }

  function pricingUrl() {
    return absoluteSiteUrl('/pricing');
  }

  function logoUrl() {
    var configured = settings().logo;
    if (configured) return absoluteSiteUrl(configured);
    return 'img/bearlab-logo.jpg';
  }

  function brandLogo(size, style) {
    var image = h('img', {
      src: logoUrl(), width: String(size), height: String(size), alt: siteName(),
      style: Object.assign({ borderRadius: '8px' }, style || {})
    });
    image.addEventListener('error', function () {
      if (image.getAttribute('src') !== LOGO_FALLBACK) image.src = LOGO_FALLBACK;
    });
    return image;
  }

  function numericValue(value) {
    if (value === null || value === undefined || value === '') return null;
    var number = Number(value);
    return isFinite(number) ? number : null;
  }

  function firstNumber(objects, keys) {
    for (var i = 0; i < objects.length; i++) {
      var object = objects[i];
      if (!object || typeof object !== 'object') continue;
      for (var j = 0; j < keys.length; j++) {
        var value = numericValue(object[keys[j]]);
        if (value !== null) return value;
      }
    }
    return null;
  }

  function moneyCNY(value) {
    var number = numericValue(value);
    if (number === null) return '—';
    if (typeof U.moneyCNY === 'function') return U.moneyCNY(number);
    if (typeof U.currency === 'function') return U.currency(number);
    return '¥' + number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function quotaMoney(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof Api.formatQuota === 'function') return Api.formatQuota(value);
    if (typeof U.currency === 'function') return U.currency(value);
    var unit = numericValue(settings().quota_per_unit);
    return moneyCNY(numericValue(value) === null ? null : Number(value) / (unit && unit > 0 ? unit : 500000));
  }

  function languageMarkers(raw) {
    var source = String(raw || '');
    var marker = /<!--\s*lang\s*:\s*([a-z-]+)\s*-->/gi;
    var first = source.search(marker);
    var prefix = first > 0 ? source.slice(0, first).trim() : '';
    var blocks = {};
    var match;
    marker.lastIndex = 0;
    while ((match = marker.exec(source))) {
      var start = marker.lastIndex;
      var next = source.slice(start).search(/<!--\s*lang\s*:\s*[a-z-]+\s*-->/i);
      var end = next < 0 ? source.length : start + next;
      var text = source.slice(start, end).trim();
      var lang = String(match[1] || '').toLowerCase();
      if (text) blocks[lang] = text;
      marker.lastIndex = end;
    }
    return { prefix: prefix, blocks: blocks };
  }

  function localizedValue(raw) {
    var source = String(raw || '');
    var parsed = languageMarkers(source);
    if (parsed.blocks.zh) return parsed.blocks.zh;
    if (parsed.prefix) return parsed.prefix;
    if (parsed.blocks.en) return parsed.blocks.en;
    return source.replace(/<!--\s*lang\s*:\s*[a-z-]+\s*-->/gi, '').trim();
  }

  function absoluteContentUrls(html) {
    if (!global.DOMParser) return html;
    try {
      var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      ['href', 'src'].forEach(function (name) {
        Array.prototype.forEach.call(doc.querySelectorAll('[' + name + ']'), function (node) {
          var value = node.getAttribute(name);
          if (!value || /^(?:#|mailto:|tel:)/i.test(value)) return;
          node.setAttribute(name, absoluteSiteUrl(value));
        });
      });
      return doc.body.innerHTML;
    } catch (e) {
      return html;
    }
  }

  function richHtml(raw) {
    var source = localizedValue(raw);
    if (!source) return '';
    var rendered = source;
    if (typeof global.markdownit === 'function') {
      try { rendered = global.markdownit({ html: true, linkify: false, breaks: true }).render(source); }
      catch (e) {}
    }
    return U.cleanHtml(absoluteContentUrls(rendered));
  }

  function plainAnnouncementText(raw) {
    var source = localizedValue(raw);
    if (!source) return '';
    if (global.DOMParser) {
      try { source = new DOMParser().parseFromString(source, 'text/html').body.textContent || ''; }
      catch (e) {}
    }
    return source.replace(/[#*`>]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function announcementTitle(item) {
    return localizedValue(pick(item, 'title', 'name')) || '公告';
  }

  function announcementDate(item) {
    return pick(item, 'publishDate', 'published_at', 'created_at', 'updated_at');
  }

  function announcementContent(item) {
    return pick(item, 'content', 'body', 'summary') || '';
  }

  function footerNode(fallback) {
    var footer = settings().footer_html;
    if (footer) return h('div', { class: 'footer-note', html: richHtml(footer) });
    return h('div', { class: 'footer-note' }, fallback || siteName());
  }

  // ---------------- home ----------------
  function homePlazaSummary(plaza) {
    var groups = ((plaza && plaza.groups) || []).filter(function (group) {
      return group && Array.isArray(group.models) && group.models.length;
    });
    var models = Object.create(null);
    var vendors = Object.create(null);
    groups.forEach(function (group) {
      group.models.forEach(function (model) {
        if (!model || !model.name) return;
        models[model.name] = true;
        var vendor = String(model.vendor || group.platform || '').trim();
        if (vendor) vendors[vendor] = true;
      });
    });
    return {
      groups: groups.length,
      models: Object.keys(models).length,
      vendors: Object.keys(vendors).length
    };
  }

  function availabilitySummary(items) {
    var values = [];
    var normal = 0;
    var warning = 0;
    var failed = 0;
    (Array.isArray(items) ? items : []).forEach(function (item) {
      var value = numericValue(item && item.availability);
      if (value === null) return;
      values.push(value);
      if (value <= 0 || item.status === 'failed' || item.status === 'error') failed++;
      else if (value < 95 || item.status === 'degraded') warning++;
      else normal++;
    });
    return {
      total: values.length,
      average: values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : null,
      normal: normal,
      warning: warning,
      failed: failed
    };
  }

  function renderHome() {
    var S2 = global.S;
    var kids = [];
    var user = S2.user;
    var page = h('div', { class: 'page' });

    var heroRight, heroLabel, heroValue, heroSub;
    if (user) {
      heroLabel = '账户余额';
      heroSub = '余额与今日用量实时更新';
      heroValue = h('div', { class: 'hero-value' }, quotaMoney(user.quota));
      heroRight = h('button', {
        class: 'hero-chip', style: { border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.16)' },
        onclick: function () { App.go('#/purchase'); }
      }, '充值 +');
    } else {
      heroLabel = 'BearLab 模型服务';
      heroValue = h('div', { class: 'hero-value', style: { fontSize: '20px' } }, '登录后查看余额');
      heroRight = h('button', {
        class: 'hero-chip', onclick: function () { App.go('#/login'); }
      }, '登录 / 注册');
    }
    kids.push(h('div', {
      class: 'hero',
      onclick: function (e) {
        if (global.S.user) return;
        if (e.target && e.target.closest && e.target.closest('button')) return;
        App.go('#/login');
      }
    },
      h('div', { class: 'row', style: { gap: '10px' } },
        brandLogo(42, { borderRadius: '7px' }),
        h('div', null,
          h('h1', null, siteName()),
          h('p', null, siteSubtitle())
        )
      ),
      h('div', { class: 'hero-row' },
        h('div', null,
          h('div', { class: 'hero-label' }, heroLabel),
          heroValue,
          heroSub ? h('div', { class: 'hero-label' }, heroSub) : null
        ),
        heroRight
      )
    ));

    var quicks = user ? [
      { icon: 'key', label: '令牌', route: '#/keys' },
      { icon: 'chart', label: '用量', route: '#/usage' },
      { icon: 'card', label: '充值', route: '#/purchase' },
      { icon: 'gift', label: '兑换', route: '#/redeem' }
    ] : [
      { icon: 'grid', label: '模型广场', route: '#/plaza' },
      { icon: 'card', label: '官方定价', url: pricingUrl() },
      { icon: 'doc', label: '文档', url: absoluteSiteUrl(settings().docs_link || '/') },
      { icon: 'chat', label: '开始对话', route: '#/login' }
    ];
    kids.push(h('div', { class: 'section' }, h('div', { class: 'grid-4' },
      quicks.map(function (q) {
        return h('button', { class: 'quick', onclick: function () {
          if (q.url) open(q.url); else App.go(q.route);
        } },
          h('i', { html: U.ic(q.icon, 18) }), h('span', null, q.label));
      })
    )));

    function featureHead(icon, label) {
      return h('div', { class: 'home-platform-feature-head' },
        h('span', { class: 'home-platform-icon', html: U.ic(icon, 17) }),
        h('span', { class: 'home-platform-name' }, label),
        h('span', { class: 'home-platform-arrow', html: U.ic('chevron', 15) })
      );
    }

    function usageValue(label) {
      return h('div', { class: 'home-platform-usage-metric' },
        h('b', null, '—'), h('span', null, label));
    }
    var usageMetrics = h('div', { class: 'home-platform-usage-metrics' },
      usageValue('今日消耗'), usageValue('今日请求'), usageValue('今日 Tokens'));
    var usageFeature = h('button', {
      class: 'home-platform-feature home-platform-usage',
      type: 'button', 'aria-label': user ? '查看平台用量' : '登录后查看平台用量',
      onclick: function () { App.go(user ? '#/dashboard' : '#/login'); }
    },
      featureHead('chart', '平台用量'),
      usageMetrics,
      h('span', { class: 'home-platform-feature-meta' }, user ? '账户今日实时用量' : '登录后查看账户用量')
    );

    var plazaStats = homePlazaSummary(S2.plaza);
    var plazaValue = h('strong', { class: 'home-platform-feature-value' },
      plazaStats.models ? U.num(plazaStats.models) + ' 个模型' : (S2.plazaLoading ? '同步中' : '等待数据'));
    var plazaMeta = h('span', { class: 'home-platform-feature-meta' },
      plazaStats.models ? plazaStats.groups + ' 个分组' + (plazaStats.vendors ? ' · ' + plazaStats.vendors + ' 个厂商' : '') :
        '查看分组、定价与上下文');
    var plazaFeature = h('button', {
      class: 'home-platform-feature', type: 'button', 'aria-label': '进入模型广场',
      onclick: function () { App.go('#/plaza'); }
    }, featureHead('grid', '模型广场'), plazaValue, plazaMeta);

    var channelValue = h('strong', { class: 'home-platform-feature-value' }, '检查中');
    var channelMeta = h('span', { class: 'home-platform-feature-meta' }, '读取公开可用率');
    var channelFeature = h('button', {
      class: 'home-platform-feature', type: 'button', 'aria-label': '查看渠道状态',
      onclick: function () { App.go('#/channel-status'); }
    }, featureHead('activity', '渠道状态'), channelValue, channelMeta);

    kids.push(h('section', { class: 'section home-platform-section' },
      h('div', { class: 'home-platform-head' },
        h('div', null,
          h('span', { class: 'home-platform-eyebrow' }, 'BEARLAB PULSE'),
          h('h2', null, '平台总览')
        ),
        h('span', { class: 'home-platform-live' }, h('i', null), 'LIVE')
      ),
      h('div', { class: 'home-platform-grid' }, usageFeature, plazaFeature, channelFeature)
    ));

    var usageUpdatedAt = 0;
    var usageLoading = false;

    function paintUsage(stats) {
      stats = stats || {};
      var quota = Number(pick(stats, 'quota', 'total_actual_cost', 'total_cost', 'cost', 'credits_used', 'spend') || 0);
      var cost = quota / 500000;
      var requests = Number(pick(stats, 'total_requests', 'requests', 'request_count', 'rpm', 'count') || 0);
      var tokens = Number(pick(stats, 'total_tokens', 'tokens', 'token_used') || 0);
      var values = usageMetrics.querySelectorAll('.home-platform-usage-metric b');
      if (values[0]) values[0].textContent = moneyCNY(cost);
      if (values[1]) values[1].textContent = U.num(requests);
      if (values[2]) values[2].textContent = U.tokens(tokens);
    }

    function loadUsage(force) {
      if (!user) return Promise.resolve();
      if (usageLoading || (!force && usageUpdatedAt && Date.now() - usageUpdatedAt < 15000)) return Promise.resolve();
      usageLoading = true;
      return Api.usageStats({ period: 'today' }).then(function (stats) {
        if (!App.isPageRetained(page)) return;
        paintUsage(stats);
        usageUpdatedAt = Date.now();
      }).catch(function () {
        if (!App.isPageRetained(page)) return;
        paintUsage({});
      }).then(function () {
        usageLoading = false;
      });
    }

    function paintPlaza(plaza) {
      var next = homePlazaSummary(plaza);
      plazaValue.textContent = next.models ? U.num(next.models) + ' 个模型' :
        (S2.plazaLoading ? '同步中' : '等待数据');
      plazaMeta.textContent = next.models ? next.groups + ' 个分组' +
        (next.vendors ? ' · ' + next.vendors + ' 个厂商' : '') : '查看分组、定价与上下文';
    }

    function paintChannels(data) {
      var summary = availabilitySummary(data && data.items);
      if (!summary.total) {
        channelValue.textContent = '等待数据';
        channelMeta.textContent = '暂未返回公开可用率';
        return;
      }
      channelValue.textContent = summary.failed ? summary.failed + ' 个异常' :
        summary.warning ? summary.warning + ' 个波动' : '运行正常';
      channelMeta.textContent = '平均可用率 ' + summary.average.toFixed(1) + '%';
    }

    function loadChannels() {
      return Api.channelStatus().then(function (data) {
        if (App.isPageRetained(page)) paintChannels(data);
      }).catch(function () {
        if (!App.isPageRetained(page)) return;
        channelValue.textContent = '暂不可用';
        channelMeta.textContent = '点击进入渠道状态重试';
      });
    }

    function liveUpdated(event) {
      if (!App.isPageRetained(page) || !event.detail || !event.detail.changed) return;
      if (event.detail.changed.plaza) paintPlaza(event.detail.changed.plaza);
      if (event.detail.changed.channel) paintChannels(event.detail.changed.channel);
      loadUsage(true);
    }
    function plazaUpdated(event) {
      if (App.isPageRetained(page) && event.detail && event.detail.plaza) paintPlaza(event.detail.plaza);
    }
    function userUpdated() {
      if (!user || !App.isPageRetained(page)) return;
      heroValue.textContent = quotaMoney((global.S.user || user || {}).quota);
      loadUsage(true);
    }

    page.addEventListener('pp:page-activate', function () {
      loadUsage(false);
      loadChannels();
    });
    page.addEventListener('pp:page-refresh', function () {
      loadUsage(true);
      loadChannels();
    });
    page.addEventListener('pp:page-dispose', function () {
      global.removeEventListener('pp:live-refreshed', liveUpdated);
      global.removeEventListener('pp:plaza-updated', plazaUpdated);
      global.removeEventListener('pp:user-updated', userUpdated);
    });
    global.addEventListener('pp:live-refreshed', liveUpdated);
    global.addEventListener('pp:plaza-updated', plazaUpdated);
    global.addEventListener('pp:user-updated', userUpdated);
    loadUsage(false);
    loadChannels();

    var annHost = h('div', { class: 'section' });
    kids.push(annHost);
    Api.announcements().then(function (list) {
      var items = arrOf(list);
      if (!items.length) {
        annHost.appendChild(section('平台公告', '全部', function () { App.go('#/announcements'); },
          card([h('div', { style: { padding: '14px' } }, h('div', { class: 'small muted' }, '暂无公告'))])));
        return;
      }
      var first = items[0];
      annHost.appendChild(section('平台公告', '全部', function () { App.go('#/announcements'); },
        card([h('div', { class: 'list-item', style: { alignItems: 'flex-start' }, onclick: function () { App.go('#/announcements/' + (first.id || 0)); } },
          h('span', { class: 'li-icon', html: U.ic('bell', 17) }),
          h('div', { class: 'li-body' },
            h('div', { class: 'li-title' }, announcementTitle(first)),
            h('div', { class: 'li-sub', style: { display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' } },
              plainAnnouncementText(announcementContent(first)).slice(0, 120)),
            h('div', { class: 'li-sub', style: { marginTop: '4px' } },
              U.ago(announcementDate(first)) || U.date(announcementDate(first))))
        )])
      ));
    }).catch(function () {
      annHost.appendChild(section('平台公告', null, null,
        card([h('div', { style: { padding: '14px' } }, h('div', { class: 'small muted' }, '公告暂时无法加载'))])));
    });

    var plaza = S2.plaza;
    if (plaza && plaza.groups && plaza.groups.length) {
      var groups = plaza.groups.filter(function (g) { return g.models && g.models.length; });
      kids.push(section('模型分组', '模型广场', function () { App.go('#/plaza'); },
        h('div', { class: 'chips' }, groups.slice(0, 10).map(function (g) {
          return h('button', { class: 'chip', onclick: function () { global.S.plazaGroup = g.id; App.go('#/plaza'); } },
            g.name + ' · ' + (String(g.ratio).toLowerCase() === 'auto' ? '自动' : groupRate(g) + 'x'));
        }))
      ));

      var models = plazaModels(plaza);
      var byName = {};
      models.forEach(function (m) {
        var key = m.name;
        if (!byName[key]) byName[key] = m;
      });
      var hot = Object.keys(byName).map(function (key) { return byName[key]; }).sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name));
      }).slice(0, 6);
      kids.push(section('模型速览', '全部模型', function () { App.go('#/plaza'); },
        card(hot.length ? hot.map(modelRow) : [h('div', { class: 'small muted', style: { padding: '14px' } }, '暂无模型')])
      ));
    } else if (!S2.plazaLoading) {
      kids.push(h('div', { class: 'section' }, emptyState('模型目录加载失败', '请稍后刷新重试', 'alert')));
    }

    kids.push(footerNode());
    page.replaceChildren.apply(page, kids);
    return page;
  }

  function balanceOf(user) {
    var b = pick(user, 'quota', 'balance', 'credits', 'remaining_balance');
    if (typeof b === 'string') b = Number(b);
    return isFinite(b) ? b / 500000 : 0;
  }

  function groupRate(group) {
    var value = pick(group, 'user_rate_multiplier', 'rate_multiplier', 'ratio', 'standard_rate_multiplier');
    var number = numericValue(value);
    return number === null ? 1 : number;
  }
  function groupRateLabel(group) {
    var value = pick(group, 'user_rate_multiplier', 'rate_multiplier', 'ratio', 'standard_rate_multiplier');
    return /^auto$/i.test(String(value || '')) ? '自动' : groupRate(group) + 'x';
  }

  // ---------------- model helpers ----------------
  function perM(v, mult) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (!isFinite(n)) return null;
    return n * 1e6 * (isFinite(Number(mult)) ? Number(mult) : 1);
  }

  function platformKey(p) {
    var s = String(p || '').toLowerCase();
    if (s.indexOf('anthropic') >= 0 || s.indexOf('claude') >= 0) return { k: 'plat-anthropic', t: 'Claude' };
    if (s.indexOf('openai') >= 0 || s.indexOf('gpt') >= 0) return { k: 'plat-openai', t: 'OpenAI' };
    if (s.indexOf('google') >= 0 || s.indexOf('gemini') >= 0) return { k: 'plat-google', t: 'Gemini' };
    if (s.indexOf('deepseek') >= 0) return { k: 'plat-deepseek', t: 'DeepSeek' };
    return { k: 'plat-other', t: String(p || 'Model') };
  }

  function plazaModels(plaza) {
    var out = [];
    ((plaza && plaza.groups) || []).forEach(function (g) {
      var mult = groupRate(g);
      (g.models || []).forEach(function (m) {
        if (typeof m === 'string') m = { name: m };
        if (!m || !m.name) return;
        var p = m.pricing || {};
        var official = m.official_pricing || {};
        var modelRatio = numericValue(m.model_ratio);
        var modelPrice = numericValue(m.model_price);
        var expressionPricing = m.expression_pricing || null;
        var officialTokenInput = modelRatio === null ? null : modelRatio * 2;
        var officialTokenOutput = modelRatio === null ? null :
          modelRatio * 2 * Math.max(1, Number(m.completion_ratio || 1));
        var mode = m.mode || p.billing_mode || m.billing_mode || 'token';
        if (mode === 'tiered_expr') mode = modelPrice > 0 ? 'request' : 'token';
        if (mode === 'fixed') mode = 'request';
        var directInput = firstNumber([m, p], ['input']);
        var directOutput = firstNumber([m, p], ['output']);
        var directCacheRead = firstNumber([m, p], ['cache_read', 'cacheRead']);
        var directCacheWrite = firstNumber([m, p], ['cache_write', 'cacheWrite']);
        var directCacheWrite1h = firstNumber([m, p], ['cache_write_1h', 'cacheWrite1h']);
        var directImageInput = firstNumber([m, p], ['image_input', 'imageInput']);
        var directImageOutput = firstNumber([m, p], ['image_output', 'imageOutput']);
        var directPerCall = firstNumber([m], ['price_per_call', 'per_request_price', 'image_price', 'price', 'model_price']);
        var input = expressionPricing && expressionPricing.input !== null ? expressionPricing.input :
          directInput !== null ? directInput : modelRatio === null ? perM(p.input_price, mult) : officialTokenInput * mult;
        var output = expressionPricing && expressionPricing.output !== null ? expressionPricing.output :
          directOutput !== null ? directOutput : modelRatio === null ? perM(p.output_price, mult) : officialTokenOutput * mult;
        var cacheReadRatio = numericValue(m.cache_ratio);
        var cacheWriteRatio = numericValue(m.create_cache_ratio);
        var cacheRead = expressionPricing && expressionPricing.cacheRead !== null ? expressionPricing.cacheRead :
          directCacheRead !== null ? directCacheRead :
          cacheReadRatio === null ? perM(p.cache_read_price, mult) : officialTokenInput * cacheReadRatio * mult;
        var cacheWrite = expressionPricing && expressionPricing.cacheWrite !== null ? expressionPricing.cacheWrite :
          directCacheWrite !== null ? directCacheWrite :
          cacheWriteRatio === null ? perM(p.cache_write_price, mult) : officialTokenInput * cacheWriteRatio * mult;
        var cacheWrite1h = expressionPricing && expressionPricing.cacheWrite1h !== null ? expressionPricing.cacheWrite1h :
          directCacheWrite1h !== null ? directCacheWrite1h : perM(p.cache_write_1h_price, mult);
        var imageInput = directImageInput !== null ? directImageInput : perM(p.image_input_price, mult);
        var imageOutput = directImageOutput !== null ? directImageOutput : perM(p.image_output_price, mult);
        var officialInput = firstNumber([m, official], ['official_input', 'officialInput', 'input']);
        var officialOutput = firstNumber([m, official], ['official_output', 'officialOutput', 'output']);
        if (officialInput === null) officialInput = perM(official.input_price, 1);
        if (officialOutput === null) officialOutput = perM(official.output_price, 1);
        if (modelRatio !== null) {
          officialInput = officialTokenInput;
          officialOutput = officialTokenOutput;
        }
        var callMultiply = mode === 'image' && g.image_rate_independent && Number.isFinite(Number(g.image_rate_multiplier))
          ? Number(g.image_rate_multiplier)
          : mode === 'video' && g.video_rate_independent && Number.isFinite(Number(g.video_rate_multiplier))
            ? Math.max(0, Number(g.video_rate_multiplier)) : mult;
        var pricePerCall = modelPrice && mode !== 'token' ? modelPrice :
          directPerCall !== null ? directPerCall :
          pick(p, 'price_per_call', 'per_request_price', 'image_price', 'price');
        out.push({
          name: m.name,
          platform: m.vendor || m.owned_by || m.platform || g.platform,
          groupPlatform: g.platform,
          group: g.name || '默认分组',
          groupId: g.id,
          subscription: g.subscription_type === 'subscription',
          exclusive: !!(g.is_exclusive || g.exclusive),
          mode: mode,
          dynamicBilling: m.dynamic_billing === true,
          billingExpr: m.billing_expr || '',
          hasPricing: !m.dynamic_billing && ([input, output, cacheRead, cacheWrite, cacheWrite1h, imageInput, imageOutput].some(function (value) {
            return value !== null && value !== undefined;
          }) || pricePerCall !== null && pricePerCall !== undefined),
          input: input,
          output: output,
          cacheRead: cacheRead,
          cacheWrite: cacheWrite,
          cacheWrite1h: cacheWrite1h,
          imageInput: imageInput,
          imageOutput: imageOutput,
          officialInput: officialInput,
          officialOutput: officialOutput,
          officialCacheRead: firstNumber([official], ['cache_read', 'cacheRead']) !== null
            ? firstNumber([official], ['cache_read', 'cacheRead']) : perM(official.cache_read_price, 1),
          officialCacheWrite: firstNumber([official], ['cache_write', 'cacheWrite']) !== null
            ? firstNumber([official], ['cache_write', 'cacheWrite']) : perM(official.cache_write_price, 1),
          officialCacheWrite1h: firstNumber([official], ['cache_write_1h', 'cacheWrite1h']) !== null
            ? firstNumber([official], ['cache_write_1h', 'cacheWrite1h']) : perM(official.cache_write_1h_price, 1),
          pricePerCall: pricePerCall,
          officialPerCall: pick(official, 'price_per_call', 'per_request_price', 'image_price', 'price'),
          unit: p.unit || m.unit || '',
          context: pick(m, 'context', 'context_length', 'max_context_tokens', 'context_window') || pick(p, 'context_length'),
          desc: m.description || '',
          groupDesc: g.description || '',
          mult: mult,
          callMult: modelPrice > 0 || directPerCall !== null ? 1 : callMultiply,
          pricing: Object.assign({}, p, {
            billing_expr: m.billing_expr || p.billing_expr || '',
            billing_mode: m.billing_mode || p.billing_mode || ''
          }),
          officialPricing: official,
          timePricing: m.time_pricing,
          priceSource: m.priceSource || m.price_source || p.source || '',
          groupData: g,
          availability: m.availability,
          billing_expr: m.billing_expr || '',
          dynamic_billing: m.dynamic_billing === true,
          expression_pricing: m.expression_pricing || null
        });
      });
    });
    return out;
  }

  function priceLabel(m) {
    if (m.dynamicBilling) return '分时/分段计费';
    if (m.mode === 'token') return priceText(m.input) + ' / ' + priceText(m.output);
    return '官网定价';
  }

  function priceText(value) {
    if (value === null || value === undefined || !isFinite(Number(value))) return '—';
    var text = Number(Number(value).toPrecision(10)).toString();
    if (text.indexOf('e') < 0) {
      var decimals = text.indexOf('.') < 0 ? 0 : text.length - text.indexOf('.') - 1;
      if (decimals < 2) text += (decimals === 0 ? '.' : '') + new Array(3 - decimals).join('0');
    }
    return '¥' + text;
  }

  function modelRow(m) {
    var pl = platformKey(m.platform);
    var hasPrice = hasModelPricing(m);
    return h('div', {
      class: 'model-row',
      onclick: function () { showModelDetail(m); }
    },
      h('div', { class: 'model-avatar ' + pl.k }, (m.name || '?').slice(0, 2)),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { class: 'model-name nowrap' }, m.name),
        h('div', { class: 'model-sub nowrap' }, (m.group || '模型') + (m.context ? ' · ' + U.tokens(m.context) + ' ctx' : ''))
      ),
      h('div', { class: 'price' },
        m.dynamicBilling ? h('div', { class: 'tiny' }, '官网定价')
          : !hasPrice ? h('div', { class: 'tiny' }, '官网定价')
          : m.mode === 'token'
          ? [h('div', null, '入 ', h('b', null, priceText(m.input))), h('div', null, '出 ', h('b', null, priceText(m.output)))]
          : h('div', null, h('b', null, '官网定价'))
      )
    );
  }

  function showModelDetail(m) {
    var pl = platformKey(m.platform);
    var body = h('div', null,
      h('div', { class: 'row', style: { marginBottom: '12px' } },
        h('div', { class: 'model-avatar ' + pl.k, style: { width: '44px', height: '44px', fontSize: '14px' } }, (m.name || '?').slice(0, 2)),
        h('div', null,
          h('div', { style: { fontWeight: '700', fontSize: '15px' } }, m.name),
          h('div', { class: 'tiny muted' }, m.group + ' · 倍率 ' + groupRateLabel(m.groupData))
        )
      ),
      m.dynamicBilling ? dynamicPricingNotice(m) : m.mode === 'token' ? modelPricing(m) : officialPerCallNotice(m),
      m.context ? h('div', { class: 'kv' }, h('span', null, '上下文'), h('b', null, U.tokens(m.context) + ' tokens')) : null,
      hasModelPricing(m) && !m.dynamicBilling ? h('div', { class: 'kv' }, h('span', null, '计费方式'), h('b', null, m.mode === 'token' ? '按 Token' : m.mode)) : null,
      m.desc ? h('div', { class: 'small', style: { marginTop: '12px', whiteSpace: 'pre-wrap' } }, m.desc) : null,
      m.groupDesc ? h('div', { style: { marginTop: '12px' } },
        h('div', { class: 'tiny muted', style: { marginBottom: '4px' } }, '分组说明'),
        h('div', { class: 'small', style: { whiteSpace: 'pre-wrap' } }, m.groupDesc)) : null,
      h('button', {
        class: 'btn btn-block', type: 'button', style: { marginTop: '14px' },
        onclick: function () { open(pricingUrl()); }
      }, '查看官网定价'),
      h('div', { style: { marginTop: '14px' } },
        h('button', {
          class: 'btn btn-primary btn-block',
          onclick: function () {
            global.S.chatModel = m.name;
            global.S.useSelectedChatModel = true;
            U.closeOverlay();
            if (global.S.user || Api.AUTH.isLogged()) App.go('#/chat');
            else App.go('#/login');
          }
        }, '用它对话'))
    );
    U.sheet({ title: '模型详情', body: body, actions: [{ label: '关闭', onClick: function () {} }] });
  }

  function numberOrNull(value, mult) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return isFinite(n) ? n * mult : null;
  }

  function modelPricing(m) {
    if (!hasModelPricing(m)) return officialPricingNotice();
    var pricing = m.pricing || {};
    var rows = [
      ['输入', m.input, m.officialInput], ['输出', m.output, m.officialOutput],
      ['缓存写入', m.cacheWrite, m.officialCacheWrite], ['缓存写入 1 小时', m.cacheWrite1h, m.officialCacheWrite1h],
      ['缓存读取', m.cacheRead, m.officialCacheRead],
      ['图片输入', m.imageInput, perM((m.officialPricing || {}).image_input_price, 1)],
      ['图片输出', m.imageOutput, perM((m.officialPricing || {}).image_output_price, 1)]
    ].filter(function (row, index) { return index < 2 || row[1] !== null || row[2] !== null; });
    var intervals = Array.isArray(pricing.intervals) ? pricing.intervals : [];
    var efforts = pricing.reasoning_effort_multipliers || {};
    var time = m.timePricing || {};
    var periods = Array.isArray(time.periods) ? time.periods : [];
    function tierPrice(tier, field) {
      if (tier[field] !== null && tier[field] !== undefined) return tier[field];
      var multiplier = tier[field.replace('_price', '_multiplier')];
      return pricing[field] == null ? null : Number(pricing[field]) * (multiplier == null ? 1 : Number(multiplier));
    }
    return h('div', { class: 'model-pricing' },
      h('div', { class: 'model-pricing-head' }, h('span', null, '¥ / 百万 tokens'), h('span', null, '实际价'), h('span', null, '官方价')),
      rows.map(function (row) {
        return h('div', { class: 'model-pricing-row' }, h('span', null, row[0]), h('b', null, priceText(row[1])), h('span', null, priceText(row[2])));
      }),
      intervals.length ? h('div', { class: 'model-tier-list' }, h('strong', null, '分段价格'), intervals.map(function (tier) {
        var label = tier.tier_label || (tier.max_tokens == null ? '>' + U.tokens(tier.min_tokens || 0) : '≤' + U.tokens(tier.max_tokens));
        return h('div', { class: 'model-tier' }, label + ' · 输入 ' + priceText(perM(tierPrice(tier, 'input_price'), m.mult)) +
          ' · 输出 ' + priceText(perM(tierPrice(tier, 'output_price'), m.mult)) +
          (tier.cache_read_price != null || tier.cache_read_multiplier != null ? ' · 缓存读 ' + priceText(perM(tierPrice(tier, 'cache_read_price'), m.mult)) : '') +
          (tier.cache_write_price != null || tier.cache_write_multiplier != null ? ' · 缓存写 ' + priceText(perM(tierPrice(tier, 'cache_write_price'), m.mult)) : ''));
      })) : null,
      periods.length ? h('div', { class: 'model-tier-list' }, h('strong', null, '时段价格'),
        h('div', null, (time.weekdays_only ? '仅工作日' : '每天') + (time.timezone ? ' · ' + time.timezone : '')),
        periods.map(function (period) {
          return h('div', { class: 'model-tier' }, (period.start_time || '') + '–' + (period.end_time || '') +
            ' · 倍率 ' + (Number(period.multiplier) * m.mult) + 'x · 输入 ' + priceText(perM(pricing.input_price, m.mult * Number(period.multiplier))) +
            ' · 输出 ' + priceText(perM(pricing.output_price, m.mult * Number(period.multiplier))));
        })) : null,
      Object.keys(efforts).length ? h('div', { class: 'model-tier-list' }, '推理倍率：' + Object.keys(efforts).map(function (key) { return key + ' ' + efforts[key] + 'x'; }).join(' · ')) : null
    );
  }

  function perCallPricing(m) {
    if (!hasModelPricing(m)) return officialPricingNotice();
    var pricing = m.pricing || {};
    var intervals = Array.isArray(pricing.intervals) ? pricing.intervals : [];
    return h('div', { class: 'model-pricing' },
      h('div', { class: 'model-pricing-head' }, h('span', null, m.mode === 'image' ? '¥ / 张' : '¥ / 次'), h('span', null, '实际价'), h('span', null, '官方价')),
      h('div', { class: 'model-pricing-row' }, h('span', null, '单价'),
        h('b', null, priceText(numberOrNull(m.pricePerCall, m.callMult))), h('span', null, priceText(numberOrNull(m.officialPerCall, 1)))),
      intervals.length ? h('div', { class: 'model-tier-list' }, h('strong', null, '分段价格'), intervals.map(function (tier) {
        var label = tier.tier_label || (tier.max_tokens == null ? '>' + U.tokens(tier.min_tokens || 0) : '≤' + U.tokens(tier.max_tokens));
        return h('div', { class: 'model-tier' }, label + ' · ' + priceText(numberOrNull(tier.per_request_price, m.callMult)));
      })) : null);
  }

  function hasModelPricing(m) {
    return !!(m && !m.dynamicBilling && (m.hasPricing || m.input != null || m.output != null ||
      m.cacheRead != null || m.cacheWrite != null || m.imageInput != null || m.imageOutput != null ||
      m.pricePerCall != null || m.pricing && m.pricing.billing_expr));
  }

  function dynamicPricingNotice(m) {
    return h('div', { class: 'model-pricing model-pricing-dynamic' },
      h('div', { class: 'model-pricing-head' }, h('span', null, '计费'), h('span', null, '价格类型'), h('span', null, '分组倍率')),
      h('div', { class: 'model-pricing-row' },
        h('span', null, '按条件计费'),
        h('b', null, '分时 / 分段'),
        h('span', null, (isFinite(Number(m.mult)) ? Number(m.mult) : 1).toFixed(2) + 'x')),
      h('div', { class: 'small muted', style: { marginTop: '8px' } },
        '该模型使用分时、长度分段或条件价格，一个固定单价会误导实际费用。请以官网定价页为准。'));
  }

  function officialPricingNotice() {
    return h('div', { class: 'small muted', style: { marginTop: '8px' } },
      '价格以官网为准 ',
      h('button', { class: 'btn btn-sm', type: 'button', onclick: function () { open(pricingUrl()); } }, '查看官网定价'));
  }

  function officialPerCallNotice(m) {
    return h('div', { class: 'model-pricing model-pricing-dynamic' },
      h('div', { class: 'model-pricing-head' }, h('span', null, '计费'), h('span', null, '价格类型'), h('span', null, '分组倍率')),
      h('div', { class: 'model-pricing-row' },
        h('span', null, '按次计费'),
        h('b', null, '官网定价'),
        h('span', null, groupRateLabel(m.groupData))),
      h('div', { class: 'small muted', style: { marginTop: '8px' } },
        '该分组的按次价格由官网计价规则确定，客户端不换算为固定人民币金额。请以官网定价页为准。'));
  }

  // ---------------- plaza ----------------
  function modelTabs(active) {
    return h('div', { class: 'model-tabs', role: 'group', 'aria-label': '模型页面' },
      h('button', { class: active === 'plaza' ? 'active' : '', 'aria-current': active === 'plaza' ? 'page' : null,
        onclick: function () { App.go('#/plaza'); } }, '模型广场'),
      h('button', { class: active === 'status' ? 'active' : '', 'aria-current': active === 'status' ? 'page' : null,
        onclick: function () { App.go('#/channel-status'); } }, '渠道状态'));
  }

  function renderPlaza() {
    var S2 = global.S;
    var plaza = S2.plaza;
    var search = '';
    var gid = S2.plazaGroup || 0;
    var rate = '';
    var onlyFavorites = false;
    var sortMode = U.store.get('plaza_sort_mode', 'recommended');
    if (['recommended', 'price', 'context'].indexOf(sortMode) < 0) sortMode = 'recommended';
    var accountKey = 'shared';
    try {
      accountKey = Api.AUTH && Api.AUTH.currentId ? String(Api.AUTH.currentId() || 'shared') : 'shared';
    } catch (e) {}
    var favoriteStoreKey = 'plaza_favorites:' + accountKey;
    var favorites = U.store.get(favoriteStoreKey, []);
    if (!Array.isArray(favorites)) favorites = [];
    var host = h('div', { class: 'page plaza-page' });
    host.appendChild(modelTabs('plaza'));

    var searchInput = h('input', {
      class: 'input', placeholder: '搜索模型名称或分组', type: 'search', 'aria-label': '搜索模型',
      oninput: function (e) { search = e.target.value.trim().toLowerCase(); paint(); }
    });

    var groupsRow = h('div', { class: 'chips' });
    var rateRow = h('div', { class: 'chips' });
    var listHost = h('div', { class: 'plaza-groups' });
    var statusByModel = Object.create(null), statusTimer = null, statusPending = false;
    var description = h('div', { class: 'plaza-description' });
    var overview = h('div', { class: 'plaza-overview' });
    var sortRow = h('div', { class: 'plaza-sort-row', role: 'group', 'aria-label': '模型排序' });
    var activeFilters = h('div', { class: 'plaza-active-filters' });
    var filterSheet = h('div', { class: 'plaza-filter-sheet' });
    var filterCount = h('span', { class: 'plaza-filter-count', hidden: true });
    var filterButton = h('button', {
      class: 'plaza-filter-button', type: 'button', 'aria-label': '筛选模型', title: '筛选模型',
      onclick: function () { openFilters(); }
    }, h('span', { html: U.ic('filter', 17) }), '筛选', filterCount);
    var expandedGroups = Object.create(null);

    function statusKey(model, group) { return JSON.stringify([String(model), String(group)]); }
    function favoriteKey(model, group) { return JSON.stringify([String(group), String(model)]); }
    function isFavorite(model, group) { return favorites.indexOf(favoriteKey(model, group)) >= 0; }
    function savePlazaStore() {
      U.store.set(favoriteStoreKey, favorites);
    }
    function toggleFavorite(model, group) {
      var key = favoriteKey(model, group);
      var index = favorites.indexOf(key);
      if (index >= 0) favorites.splice(index, 1);
      else favorites.unshift(key);
      savePlazaStore();
      paint();
      U.toast(index >= 0 ? '已取消收藏' : '已收藏模型', 'ok');
    }
    function updateStatusDots() {
      Array.prototype.forEach.call(listHost.querySelectorAll('.plaza-status'), function (dot) {
        var item = statusByModel[statusKey(dot.getAttribute('data-model'), dot.getAttribute('data-group'))];
        var state = item && global.PagesChannel && global.PagesChannel.statusInfo
          ? global.PagesChannel.statusInfo(item.status, item.availability)
          : { kind: 'unknown', label: '未知' };
        dot.className = 'plaza-status ' + state.kind;
        dot.setAttribute('data-status', state.kind);
        dot.setAttribute('title', '渠道状态：' + state.label);
        dot.setAttribute('aria-label', '渠道状态：' + state.label);
      });
    }
    function loadStatus() {
      if (statusPending || !Api.modelStatus) return;
      statusPending = true;
      Api.modelStatus().then(function (data) {
        if (!App.isPageRetained(host)) return;
        statusByModel = Object.create(null);
        var items = Array.isArray(data) ? data : arrOf(data);
        items.forEach(function (item) {
          if (!item || typeof item !== 'object') return;
          var model = item.model || item.model_name || item.name;
          var modelGroup = item.group || item.group_name || item.groupName;
          if (!model || !modelGroup) return;
          var key = statusKey(model, modelGroup);
          statusByModel[key] = Object.prototype.hasOwnProperty.call(statusByModel, key) ? false : item;
        });
        updateStatusDots();
      }).catch(function () {
        if (!App.isPageRetained(host)) return;
        statusByModel = Object.create(null);
        updateStatusDots();
      }).then(function () {
        statusPending = false;
        if (App.isPageActive(host)) statusTimer = setTimeout(loadStatus, 30000);
      });
    }
    loadStatus();

    function paintOverview(all) {
      var groups = (plaza && plaza.groups) || [];
      var priced = all.filter(function (model) { return model.mode === 'token' && model.input !== null && isFinite(model.input); });
      priced.sort(function (a, b) { return a.input - b.input; });
      var best = priced[0];
      var totalModels = groups.reduce(function (sum, group) { return sum + ((group.models || []).length); }, 0);
      var favoriteCount = all.filter(function (model) { return isFavorite(model.name, model.group); }).length;
      overview.innerHTML = '';
      overview.appendChild(h('div', { class: 'plaza-overview-copy' },
        h('span', { class: 'plaza-overview-eyebrow' }, 'LIVE MODEL CATALOG'),
        h('strong', null, totalModels + ' 个模型，一处接入'),
        h('span', null, '价格、上下文与渠道状态跟随网站实时同步')));
      var stats = h('div', { class: 'plaza-overview-stats' },
        h('div', null, h('b', null, String(groups.length)), h('span', null, '分组')),
        h('div', null, h('b', null, String(favoriteCount)), h('span', null, '收藏')),
        h('div', null, h('b', null, best ? priceText(best.input) : '—'), h('span', null, '最低输入')));
      overview.appendChild(stats);
    }

    function comparator(a, b) {
      if (sortMode === 'price') {
        var ap = a.mode === 'token' && a.input != null ? a.input : Number.MAX_SAFE_INTEGER;
        var bp = b.mode === 'token' && b.input != null ? b.input : Number.MAX_SAFE_INTEGER;
        return ap - bp || String(a.name).localeCompare(String(b.name));
      }
      if (sortMode === 'context') {
        return Number(b.context || 0) - Number(a.context || 0) || String(a.name).localeCompare(String(b.name));
      }
      return String(a.name).localeCompare(String(b.name));
    }

    function paintSort() {
      sortRow.innerHTML = '';
      [
        { key: 'recommended', label: '名称' },
        { key: 'price', label: '价格' },
        { key: 'context', label: '上下文' }
      ].forEach(function (item) {
        sortRow.appendChild(h('button', {
          type: 'button', class: item.key === sortMode ? 'active' : '', 'aria-pressed': item.key === sortMode ? 'true' : 'false',
          onclick: function () {
            sortMode = item.key;
            U.store.set('plaza_sort_mode', sortMode);
            paintSort();
            paint();
          }
        }, item.label, item.key === 'price' ? h('span', { class: 'plaza-sort-mark' }, '↑') : item.key === 'context' ? h('span', { class: 'plaza-sort-mark' }, '↓') : null));
      });
    }

    function chip(row, label, active, action) {
      row.appendChild(h('button', { class: 'chip' + (active ? ' active' : ''), onclick: action }, label));
    }

    function selectedFilterCount() {
      return (gid ? 1 : 0) + (rate !== '' ? 1 : 0) +
        (onlyFavorites ? 1 : 0);
    }

    function paintActiveFilters() {
      activeFilters.innerHTML = '';
      var items = [];
      if (gid) {
        var selectedGroup = ((plaza && plaza.groups) || []).filter(function (group) { return String(group.id) === String(gid); })[0];
        items.push({ label: selectedGroup ? selectedGroup.name : '分组 ' + gid, clear: function () { gid = 0; global.S.plazaGroup = 0; } });
      }
      if (rate !== '') items.push({ label: rate + 'x', clear: function () { rate = ''; } });
      if (onlyFavorites) items.push({ label: '仅看收藏', clear: function () { onlyFavorites = false; } });
      if (items.length) {
        activeFilters.appendChild(h('span', { class: 'tiny muted' }, '已筛选'));
        items.forEach(function (item) {
          activeFilters.appendChild(h('button', { class: 'plaza-active-filter', onclick: function () { item.clear(); paint(); } },
            item.label, h('span', { html: U.ic('close', 12), 'aria-hidden': 'true' })));
        });
      }
      var count = selectedFilterCount();
      filterCount.textContent = count ? String(count) : '';
      filterCount.hidden = !count;
      filterButton.classList.toggle('has-filters', !!count);
      filterButton.setAttribute('aria-label', count ? '筛选模型，已选择 ' + count + ' 项' : '筛选模型');
    }

    function filterPanel() {
      filterSheet.innerHTML = '';
      filterSheet.appendChild(h('div', { class: 'plaza-filter-group' }, h('strong', null, '分组'), groupsRow));
      filterSheet.appendChild(h('div', { class: 'plaza-filter-group' }, h('strong', null, '倍率'), rateRow));
      filterSheet.appendChild(h('label', { class: 'plaza-check-row' },
        h('input', { type: 'checkbox', checked: onlyFavorites, onchange: function (event) { onlyFavorites = event.target.checked; paint(); filterPanel(); } }),
        h('span', null, '仅显示收藏模型')));
      filterSheet.appendChild(h('div', { class: 'plaza-filter-actions' },
        h('button', { class: 'btn btn-sm', onclick: function () {
          gid = 0; global.S.plazaGroup = 0; rate = ''; onlyFavorites = false;
          paint(); filterPanel();
        } }, '重置'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: function () { U.closeOverlay(); } }, '查看结果')));
    }
    function openFilters() {
      filterPanel();
      U.sheet({ title: '筛选模型', body: filterSheet, actions: [{ label: '完成', kind: 'primary' }] });
    }

    function paint() {
      var groups = (plaza && plaza.groups) || [];
      groupsRow.innerHTML = '';
      rateRow.innerHTML = '';
      var rates = [];
      groups.forEach(function (g) {
        var value = groupRate(g);
        if (rates.indexOf(value) < 0) rates.push(value);
      });
      chip(groupsRow, '全部', !gid, function () { gid = 0; global.S.plazaGroup = 0; paint(); });
      groups.forEach(function (g) {
        chip(groupsRow, g.name, String(gid) === String(g.id), function () { gid = g.id; global.S.plazaGroup = g.id; paint(); });
      });
      chip(rateRow, '全部', rate === '', function () { rate = ''; paint(); });
      rates.sort(function (a, b) { return a - b; }).forEach(function (value) {
        chip(rateRow, value + 'x', rate === value, function () { rate = value; paint(); });
      });

      var all = plazaModels(plaza);
      paintOverview(all);
      var filtered = groups.filter(function (g) {
        var groupModels = all.filter(function (model) { return String(model.groupId) === String(g.id); });
        return groupModels.length && (!gid || String(gid) === String(g.id)) &&
          (rate === '' || String(groupRate(g)) === String(rate));
      }).map(function (g) {
        return { group: g, models: all.filter(function (m) {
          if (String(m.groupId) !== String(g.id) || (search && (m.name + ' ' + m.group).toLowerCase().indexOf(search) < 0)) return false;
          if (onlyFavorites && !isFavorite(m.name, m.group)) return false;
          return true;
        }).sort(comparator) };
      }).filter(function (item) { return item.models.length > 0; });
      filtered.sort(function (a, b) {
        if (sortMode === 'price') {
          var ac = a.models[0] && a.models[0].input != null ? a.models[0].input : Number.MAX_SAFE_INTEGER;
          var bc = b.models[0] && b.models[0].input != null ? b.models[0].input : Number.MAX_SAFE_INTEGER;
          return ac - bc || groupRate(a.group) - groupRate(b.group);
        }
        if (sortMode === 'context') {
          var ax = Math.max.apply(null, a.models.map(function (m) { return Number(m.context || 0); }).concat([0]));
          var bx = Math.max.apply(null, b.models.map(function (m) { return Number(m.context || 0); }).concat([0]));
          return bx - ax || groupRate(a.group) - groupRate(b.group);
        }
        return groupRate(a.group) - groupRate(b.group) || String(a.group.name).localeCompare(String(b.group.name));
      });
      listHost.innerHTML = '';
      paintActiveFilters();
      if (!plaza) {
        listHost.appendChild(S2.plazaLoading ? h('div', { class: 'dashboard-loading' }, '正在加载模型广场…') : emptyState('模型广场加载失败', '请点击右上角刷新重试', 'alert'));
        return;
      }
      if (!filtered.length) {
        listHost.appendChild(emptyState('没有匹配的模型', '换个关键词或分组试试', 'search'));
        return;
      }
      var count = filtered.reduce(function (sum, item) { return sum + item.models.length; }, 0);
      listHost.appendChild(h('div', { class: 'plaza-count' }, '共 ' + filtered.length + ' 个分组 · ' + count + ' 个模型'));
      filtered.forEach(function (item) {
        var group = item.group;
        var groupKey = String(group.id);
        var isExpanded = !!expandedGroups[groupKey] || Object.keys(expandedGroups).length === 0 && filtered.length === 1;
        var groupBody = h('div', { class: 'plaza-group-body', hidden: !isExpanded },
          group.peak_rate_enabled || group.image_rate_independent || group.video_rate_independent
            ? h('div', { class: 'plaza-group-description' },
                group.peak_rate_enabled ? h('p', null, '高峰 ' + (group.peak_start || '') + '–' + (group.peak_end || '') + ' · ' + group.peak_rate_multiplier + 'x') : null,
                group.image_rate_independent ? h('p', null, '图片倍率 ' + group.image_rate_multiplier + 'x') : null,
                group.video_rate_independent ? h('p', null, '视频倍率 ' + group.video_rate_multiplier + 'x') : null)
            : null,
          item.models.map(function (m) {
            var priced = hasModelPricing(m);
            var details = h('div', { class: 'plaza-model-details', hidden: true },
              m.desc ? h('p', { class: 'plaza-model-description' }, m.desc) : null,
              m.dynamicBilling ? dynamicPricingNotice(m) : m.mode === 'token' ? modelPricing(m) : officialPerCallNotice(m));
            var detailToggle = priced || m.dynamicBilling ? h('button', { class: 'plaza-model-detail-toggle', type: 'button', 'aria-expanded': 'false',
              onclick: function () {
                details.hidden = !details.hidden;
                detailToggle.setAttribute('aria-expanded', details.hidden ? 'false' : 'true');
                detailToggle.textContent = details.hidden ? '价格明细' : '收起价格';
              } }, '价格明细') : h('button', { class: 'plaza-model-detail-toggle', type: 'button',
                onclick: function () { open(pricingUrl()); } }, '官网定价');
            return h('div', { class: 'plaza-model' },
              h('div', { class: 'plaza-model-top' },
                h('div', { class: 'plaza-model-heading' },
                  h('span', { class: 'plaza-model-name' },
                    h('span', { class: 'plaza-status unknown', role: 'img', 'data-model': m.name, 'data-group': m.group,
                      title: '渠道状态：未知', 'aria-label': '渠道状态：未知' }),
                    h('button', { class: 'plaza-model-title', type: 'button', onclick: function () {
                      showModelDetail(m);
                    } }, m.name)),
                  m.context ? h('span', { class: 'plaza-model-context' }, U.tokens(m.context) + ' 上下文') : null),
                h('div', { class: 'plaza-model-actions' },
                  h('button', { class: 'plaza-model-favorite' + (isFavorite(m.name, m.group) ? ' active' : ''), type: 'button',
                    title: isFavorite(m.name, m.group) ? '取消收藏' : '收藏模型',
                    'aria-label': (isFavorite(m.name, m.group) ? '取消收藏 ' : '收藏 ') + m.name,
                    onclick: function (event) {
                      event.stopPropagation();
                      event.preventDefault();
                      toggleFavorite(m.name, m.group);
                    }, html: U.ic('star', 15) }),
                  h('button', { class: 'plaza-model-copy', type: 'button', title: '复制模型名称', 'aria-label': '复制模型名称 ' + m.name,
                    onclick: function (event) {
                      event.stopPropagation();
                      event.preventDefault();
                      U.copy(m.name);
                    }, html: U.ic('copy', 17) }))),
              h('div', { class: 'plaza-model-summary' },
                priced && m.mode === 'token' ? h('div', { class: 'plaza-price-pair' },
                  h('span', { class: 'plaza-price-chip plaza-price-input' }, h('small', null, '输入'), h('b', null, priceText(m.input))),
                  h('span', { class: 'plaza-price-chip plaza-price-output' }, h('small', null, '输出'), h('b', null, priceText(m.output)))) :
                  priced ? h('span', { class: 'plaza-price-chip plaza-price-single' }, m.mode === 'token' ? priceLabel(m) : '官网定价') :
                    m.dynamicBilling ? h('span', { class: 'plaza-price-chip plaza-price-single' }, '分时 / 分段') :
                    h('span', { class: 'tiny muted' }, '价格以官网为准'),
                detailToggle),
              details
            );
          }));
        var toggle = h('button', { class: 'plaza-group-toggle', type: 'button', 'aria-expanded': isExpanded ? 'true' : 'false',
          onclick: function () {
            expandedGroups[groupKey] = groupBody.hidden;
            groupBody.hidden = !groupBody.hidden;
            toggle.setAttribute('aria-expanded', groupBody.hidden ? 'false' : 'true');
            toggle.classList.toggle('expanded', !groupBody.hidden);
          } });
        listHost.appendChild(h('section', { class: 'plaza-group' + (isExpanded ? ' expanded' : '') },
          h('div', { class: 'plaza-group-head' },
            h('div', { class: 'plaza-group-head-main' },
              h('h2', null, group.name || '未命名分组'),
          h('div', { class: 'plaza-group-actions' }, h('span', { class: 'badge teal' }, groupRateLabel(group)), toggle)),
            h('div', { class: 'plaza-group-meta' },
              group.subscription_type === 'subscription' ? h('span', { class: 'badge warn' }, '订阅') : null,
              group.is_exclusive ? h('span', { class: 'badge' }, '专属') : null,
              h('span', null, item.models.length + ' 个模型')),
            group.description ? h('p', null, group.description) : null,
            group.peak_rate_enabled ? h('p', null, '高峰 ' + (group.peak_start || '') + '–' + (group.peak_end || '') + ' · ' + group.peak_rate_multiplier + 'x') : null,
            group.image_rate_independent ? h('p', null, '图片倍率 ' + group.image_rate_multiplier + 'x') : null,
            group.video_rate_independent ? h('p', null, '视频倍率 ' + group.video_rate_multiplier + 'x') : null),
          groupBody
        ));
      });
      updateStatusDots();
    }

    host.appendChild(description);
    host.appendChild(h('div', { class: 'plaza-search-row' }, h('div', { class: 'plaza-search-wrap' }, h('span', { class: 'plaza-search-icon', html: U.ic('search', 18) }), searchInput), filterButton));
    host.appendChild(sortRow);
    host.appendChild(overview);
    host.appendChild(activeFilters);
    host.appendChild(listHost);
    function updatePlaza() {
      plaza = S2.plaza;
      description.textContent = plaza && plaza.description || '';
      description.hidden = !description.textContent;
      paintOverview(plazaModels(plaza));
      paint();
    }
    host.addEventListener('pp:page-plaza-updated', updatePlaza);
    host.addEventListener('pp:page-activate', function () {
      if (String(gid) !== String(S2.plazaGroup || 0)) { gid = S2.plazaGroup || 0; paint(); }
      clearTimeout(statusTimer);
      loadStatus();
    });
    host.addEventListener('pp:page-deactivate', function () { clearTimeout(statusTimer); });
    host.addEventListener('pp:page-refresh', function () {
      clearTimeout(statusTimer);
      loadStatus();
      paint();
    });
    host.addEventListener('pp:page-dispose', function () { clearTimeout(statusTimer); });
    updatePlaza();
    paintSort();
    return host;
  }

  // ---------------- announcements ----------------
  function renderAnnouncements(id) {
    var page = h('div', { class: 'page' });
    var version = 0, timer = null, loaded = false;
    function load(silent) {
      var currentVersion = ++version;
      return Api.announcements().then(function (list) {
        if (currentVersion !== version) return;
        page.dataset.announcementVersion = String(currentVersion);
        var next = h('div', { class: 'page' });
        var items = arrOf(list);
        if (id) {
          var item = items.filter(function (a) { return String(a.id) === String(id); })[0] || items[0];
          if (item) {
            next.appendChild(h('div', { class: 'card pad' },
              h('h2', { style: { margin: '0 0 4px', fontSize: '18px' } }, announcementTitle(item)),
              h('div', { class: 'tiny muted', style: { marginBottom: '12px' } },
                U.datetime(announcementDate(item))),
              h('div', { class: 'announcement-body', html: richHtml(announcementContent(item)) })
            ));
          } else {
            next.appendChild(emptyState('公告不存在', '', 'bell'));
          }
        } else if (!items.length) {
          next.appendChild(emptyState('暂无公告', '平台有新动态时会显示在这里', 'bell'));
        } else {
          items.forEach(function (a) {
            next.appendChild(h('div', { class: 'card', style: { marginBottom: '10px' } },
              h('div', { class: 'list-item', onclick: function () { App.go('#/announcements/' + (a.id || 0)); } },
                h('span', { class: 'li-icon', html: U.ic('bell', 17) }),
                h('div', { class: 'li-body' },
                  h('div', { class: 'li-title' }, announcementTitle(a)),
                  h('div', { class: 'li-sub' }, U.date(announcementDate(a)))
                ),
                h('div', { class: 'li-tail', html: U.ic('chevron', 16) })
              )));
          });
        }
        page.replaceChildren.apply(page, Array.prototype.slice.call(next.childNodes));
        loaded = true;
      }).catch(function (e) {
        if (loaded || silent) return;
        page.replaceChildren(emptyState('公告加载失败', e.message, 'alert'));
      });
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        if (!page.isConnected || !App.isPageActive(page) || document.hidden) return;
        load(true).finally(schedule);
      }, 5000);
    }
    page.addEventListener('pp:page-activate', function () {
      clearTimeout(timer);
      load(true).finally(schedule);
    });
    page.addEventListener('pp:page-deactivate', function () { clearTimeout(timer); });
    page.addEventListener('pp:page-refresh', function () { load(true).finally(schedule); });
    page.addEventListener('pp:page-dispose', function () {
      clearTimeout(timer);
      version++;
    });
    load();
    return page;
  }

  // ---------------- about ----------------
  function renderAbout() {
    var page = h('div', { class: 'page' });
    var logoHost = h('div');
    var nameNode = h('h2', { style: { margin: '10px 0 2px' } });
    var subtitleNode = h('div', { class: 'small muted' });
    var versionNode = h('div', { class: 'tiny muted', style: { marginTop: '8px' } });
    var links = h('div', { class: 'list' });
    var footerHost = h('div');
    page.appendChild(h('div', { class: 'card pad', style: { textAlign: 'center' } },
      logoHost, nameNode, subtitleNode, versionNode
    ));
    page.appendChild(h('div', { class: 'section' }, links));
    var health = h('div', { class: 'section' }, h('div', { class: 'list' },
      h('div', { class: 'list-item' }, h('div', { class: 'li-body' }, h('div', { class: 'li-title' }, '接口状态'), h('div', { class: 'li-sub' }, '检测中…')))
    ));
    page.appendChild(h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, '接口连通性')), health));
    page.appendChild(footerHost);

    function contactUrl(value) {
      if (!value) return '';
      if (/^(?:mailto:|https?:\/\/)/i.test(value)) return value;
      if (value.indexOf('@') > 0) return 'mailto:' + value;
      return absoluteSiteUrl(value);
    }

    function applySettings(value) {
      var current = value && typeof value === 'object' ? value : {};
      logoHost.replaceChildren(brandLogo(54, { borderRadius: '8px' }));
      nameNode.textContent = current.site_name || BRAND_NAME;
      subtitleNode.textContent = current.site_subtitle || DEFAULT_SUBTITLE;
      versionNode.textContent = 'App ' + U.appVersion() +
        (current.version ? ' · API ' + current.version : '');
      links.innerHTML = '';
      links.appendChild(listItem('external', '访问官网', Api.ORIGIN, null, function () { open(Api.ORIGIN); }));
      if (current.docs_link) {
        links.appendChild(listItem('doc', '使用文档', String(current.docs_link), null,
          function () { open(absoluteSiteUrl(current.docs_link)); }));
      }
      if (current.contact_info) {
        links.appendChild(listItem('mail', '联系我们', String(current.contact_info), null,
          function () { open(contactUrl(String(current.contact_info))); }));
      }
      footerHost.replaceChildren(footerNode('本应用为 BearLab AI 的第三方客户端。'));
    }

    applySettings(settings());
    Api.settings().then(function (value) {
      if (App.isPageRetained(page)) applySettings(value);
    }).catch(function () {});
    checkHealth(health);
    return page;
  }

  function checkHealth(host) {
    var rows = [
      { name: '站点配置', fn: function () { return Api.settings(); } },
      { name: '模型与定价', fn: function () { return Api.plaza(); } }
    ];
    var list = host.firstChild;
    list.innerHTML = '';
    rows.forEach(function (r) {
      var value = h('span', { class: 'badge' }, '…');
      list.appendChild(h('div', { class: 'list-item' },
        h('div', { class: 'li-body' },
          h('div', { class: 'li-title', style: { fontSize: '13px' } }, r.name),
          h('div', { class: 'li-sub' }, Api.ORIGIN)),
        h('div', { class: 'li-tail' }, value)
      ));
      var t0 = Date.now();
      r.fn().then(function () {
        value.className = 'badge ok';
        value.textContent = (Date.now() - t0) + ' ms';
      }).catch(function (e) {
        value.className = 'badge danger';
        value.textContent = '异常';
        value.title = e.message;
      });
    });
  }

  function open(url) {
    if (global.Native && global.Native.open) { global.Native.open(url); return; }
    try { global.open(url, '_blank'); } catch (e) { location.href = url; }
  }

  global.PagesCore = {
    h: h, section: section, listItem: listItem, emptyState: emptyState, card: card,
    arrOf: arrOf, totalOf: totalOf, pick: pick, balanceOf: balanceOf,
    homePlazaSummary: homePlazaSummary, availabilitySummary: availabilitySummary,
    announcementTitle: announcementTitle, announcementDate: announcementDate,
    announcementContent: announcementContent, plainAnnouncementText: plainAnnouncementText,
    plazaModels: plazaModels, modelRow: modelRow, platformKey: platformKey,
    modelTabs: modelTabs,
    renderHome: renderHome, renderPlaza: renderPlaza, renderAnnouncements: renderAnnouncements,
    renderAbout: renderAbout, open: open, priceLabel: priceLabel
  };
})(window);
