/* Account dashboard: summary, usage breakdown and recent requests. */
(function (global) {
  'use strict';
  var U = global.U;
  var C = global.PagesCore;
  var h = C.h, section = C.section, card = C.card, pick = C.pick, arrOf = C.arrOf;
  var fallbackMoneyCNY = C.moneyCNY;
  var USAGE_PAGE_SIZE = 500;
  var USAGE_MAX_RECORDS = 100000;

  function number(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function money(value) {
    if (typeof U.moneyCNY === 'function') return U.moneyCNY(value);
    if (typeof fallbackMoneyCNY === 'function') return fallbackMoneyCNY(value);
    var n = number(value);
    return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function balanceMoney(value) { return money(value); }
  function token(value) { return U.tokens(number(value)); }
  // Today's token totals stay precise at compact units: 1M and 1B always show four decimals.
  function todayToken(value) {
    var n = Math.max(0, number(value));
    if (n >= 1e9) return (n / 1e9).toFixed(4) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(4) + 'M';
    return U.tokens(n);
  }
  function unwrapStats(value) {
    value = value || {};
    if (value.data && typeof value.data === 'object' && !Array.isArray(value.data)) value = value.data;
    if (value.stats && typeof value.stats === 'object') value = value.stats;
    return value;
  }
  function statCost(stats) {
    var value = pick(stats || {}, 'total_actual_cost', 'actual_cost', 'cost');
    if (value !== undefined && value !== null && value !== '' && isFinite(Number(value))) return Number(value);
    return number((stats || {}).quota) / 500000;
  }
  function optionalToken(loaded, value) {
    return loaded && value !== null && value !== undefined && isFinite(Number(value)) ? todayToken(value) : '—';
  }
  function dashboardTodayTokens(stats) {
    var value = stats && stats.total_tokens;
    if (value !== null && value !== undefined && value !== '' && isFinite(Number(value))) return Number(value);
    return number(stats && stats.total_input_tokens) + number(stats && stats.total_output_tokens);
  }
  function compactPercent(value) {
    return value === null || value === undefined || !isFinite(Number(value)) ? '—' : Number(value).toFixed(1) + '%';
  }
  function svg(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  function niceMax(value) {
    if (value <= 0) return 1;
    var magnitude = Math.pow(10, Math.floor(Math.log(value) / Math.LN10));
    var scaled = value / magnitude;
    return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * magnitude;
  }

  function fetchUsageRecords(range, current) {
    var records = [], seen = Object.create(null), expected = null, scanned = 0;
    var startDate = range.wholeDays ? range.startDate : U.ymd(new Date(range.start.getTime() - 86400000));
    var endDate = range.wholeDays ? range.endDate : U.ymd(new Date(range.endExclusive.getTime() + 86400000));
    function fetchPage(page) {
      if (current && !current()) return Promise.reject(new Error('查询已取消'));
      return Promise.resolve(Api.usageLogs({
        page: page,
        page_size: USAGE_PAGE_SIZE,
        start_date: startDate,
        end_date: endDate
      })).then(function (data) {
        var rows = arrOf(data);
        var totalValue = pick(data, 'total', 'total_count', 'count');
        var total = totalValue === undefined ? null : Number(totalValue);
        var size = Number(pick(data, 'page_size', 'pageSize')) || USAGE_PAGE_SIZE;
        if (total !== null && (!Number.isSafeInteger(total) || total < 0)) throw new Error('调用记录分页信息不完整');
        if (!Number.isSafeInteger(size) || size < 1) size = USAGE_PAGE_SIZE;
        if (total !== null && total > USAGE_MAX_RECORDS) {
          throw new Error('所选时段记录过多，请缩小时间范围');
        }
        if (expected === null && total !== null) expected = total;
        if (expected !== null && total !== null && total !== expected) throw new Error('记录在查询期间发生变化，请重新查询');
        if (expected !== null && scanned + rows.length > expected) throw new Error('调用记录分页信息不完整');
        rows.forEach(function (row) {
          if (!row || row.id == null || seen[String(row.id)]) throw new Error('调用记录不完整或重复，请重新查询');
          seen[String(row.id)] = true;
          var when = new Date(row.created_at).getTime();
          if (!row.created_at || !isFinite(when)) throw new Error('调用记录缺少有效时间，无法准确统计');
          if (when >= range.start.getTime() && when < range.endExclusive.getTime()) records.push(row);
        });
        scanned += rows.length;
        if ((expected !== null && scanned === expected) || !rows.length || rows.length < size) return records;
        if (scanned >= USAGE_MAX_RECORDS) throw new Error('所选时段记录过多，请缩小时间范围');
        return fetchPage(page + 1);
      });
    }
    return fetchPage(1);
  }

  function aggregateUsage(records, granularity) {
    var models = Object.create(null), buckets = Object.create(null);
    var totals = { total_requests: 0, total_actual_cost: 0, total_input_tokens: 0, total_output_tokens: 0, total_tokens: 0 };
    records.forEach(function (row) {
      var date = new Date(row.created_at);
      if (!isFinite(date.getTime())) throw new Error('调用记录时间无效');
      var bucket = U.ymd(date) + (granularity === 'hour' ? ' ' + String(date.getHours()).padStart(2, '0') + ':00' : '');
      var model = String(row.model || '未知模型');
      var input = Number(row.input_tokens || 0);
      var output = Number(row.output_tokens || 0);
      var tokens = Number(row.total_tokens);
      if (!isFinite(tokens)) tokens = input + output;
      var cost = Number(row.cost || 0);
      if (!models[model]) models[model] = { model: model, requests: 0, total_tokens: 0, actual_cost: 0 };
      if (!buckets[bucket]) buckets[bucket] = { date: bucket, cost: 0, tokens: 0 };
      models[model].requests++;
      models[model].total_tokens += tokens;
      models[model].actual_cost += cost;
      buckets[bucket].cost += cost;
      buckets[bucket].tokens += tokens;
      totals.total_requests++;
      totals.total_input_tokens += input;
      totals.total_output_tokens += output;
      totals.total_tokens += tokens;
      totals.total_actual_cost += cost;
    });
    records.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    return {
      stats: totals,
      trend: Object.keys(buckets).sort().map(function (key) { return buckets[key]; }),
      models: Object.keys(models).map(function (key) { return models[key]; }),
      records: records
    };
  }

  // ---------- donut ----------
  var DONUT_COLORS = ['#4f7cf7', '#22b07d', '#f0a03c', '#e5646b', '#8b6bf0', '#e268a8', '#2bb6c9', '#8fbf3f'];

  function shade(hex, amount) {
    var value = String(hex).replace('#', '');
    var rgb = [0, 2, 4].map(function (i) {
      var channel = parseInt(value.substr(i, 2), 16) / 255;
      channel = amount >= 0 ? channel + (1 - channel) * amount : channel * (1 + amount);
      return Math.round(Math.min(1, Math.max(0, channel)) * 255);
    });
    return '#' + rgb.map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('');
  }

  function donut(models, total) {
    var NS = 'http://www.w3.org/2000/svg';
    var R = 44, CX = 60, CY = 60;
    var ring = svg('svg', { viewBox: '0 0 120 120', class: 'dashboard-donut', role: 'img',
      'aria-label': '模型 Token 分布，共 ' + models.length + ' 个模型，总计 ' + U.num(total) + ' Tokens' });
    var defs = document.createElementNS(NS, 'defs');
    models.forEach(function (_, index) {
      var color = DONUT_COLORS[index % DONUT_COLORS.length];
      var gradient = svg('linearGradient', { id: 'donut-grad-' + index, x1: '0', y1: '0', x2: '1', y2: '1' });
      gradient.appendChild(svg('stop', { offset: '0%', 'stop-color': shade(color, 0.18) }));
      gradient.appendChild(svg('stop', { offset: '100%', 'stop-color': shade(color, -0.14) }));
      defs.appendChild(gradient);
    });
    var glow = svg('filter', { id: 'donut-glow', x: '-20%', y: '-20%', width: '140%', height: '140%' });
    glow.appendChild(svg('feDropShadow', { dx: '0', dy: '2', stdDeviation: '2.4', 'flood-color': '#0b1220', 'flood-opacity': '0.22' }));
    defs.appendChild(glow);
    ring.appendChild(defs);
    ring.appendChild(svg('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': 13 }));
    var slices = svg('g', { filter: 'url(#donut-glow)', class: 'dashboard-donut-slices' });
    var offset = 0;
    var visible = models.filter(function (model) { return total && number(model.total_tokens) > 0; }).length;
    models.forEach(function (model, index) {
      var share = total ? Math.max(0, number(model.total_tokens)) / total * 100 : 0;
      if (share > 0) {
        // Leave a hairline gap between slices so neighbouring tones stay legible.
        var gap = visible > 1 ? Math.min(share * 0.4, share > 4 ? 0.8 : 0.45) : 0;
        slices.appendChild(svg('circle', { cx: CX, cy: CY, r: R, fill: 'none',
          stroke: 'url(#donut-grad-' + index + ')', 'stroke-width': 13, pathLength: 100,
          'data-share': Math.round(share * 1000) / 1000,
          'stroke-dasharray': (share - gap) + ' ' + (100 - share + gap), 'stroke-dashoffset': -(offset + gap / 2),
          transform: 'rotate(-90 60 60)', class: 'dashboard-donut-segment' }));
      }
      offset += share;
    });
    ring.appendChild(slices);
    return ring;
  }
  function percentText(value) {
    return value === null || value === undefined || !isFinite(Number(value)) ? '未知' : Number(value).toFixed(1) + '%';
  }

  function chartDate(value) {
    var date = String(value || '');
    var match = date.match(/^\d{4}-(\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
    return match ? match[1] + (match[2] ? ' ' + match[2] : '') : date;
  }

  function metric(label, value, detail, icon, action, valueClass) {
    return h(action ? 'button' : 'div', { class: 'card dashboard-metric dashboard-quality-item', onclick: action || null },
      h('div', { class: 'dashboard-metric-label' }, h('i', { html: U.ic(icon, 16) }), label),
      h('strong', valueClass ? { class: valueClass } : null, value),
      h('div', { class: 'dashboard-metric-detail' }, (Array.isArray(detail) ? detail : [detail]).map(function (line) {
        return h('div', null, line);
      }))
    );
  }

  function renderDashboard() {
    if (!Api.AUTH.isLogged()) return global.PagesUser.needLogin();
    var account = Api.AUTH.context();
    var page = h('div', { class: 'page dashboard' });
    var summaryHost = h('div', { class: 'dashboard-summary' }, h('div', { class: 'dashboard-loading' }, '正在加载账户统计…'));
    var platformHost = h('div');
    var modelPreviewHost = h('div');
    var announcementHost = h('div');
    var trendHost = h('div');
    var modelHost = h('div');
    var recentHost = h('div');
    var end = new Date();
    var start = new Date();
    start.setDate(end.getDate() - 6);
    var startInput = U.dateTimeField({ kind: 'date', compact: true, value: U.ymd(start), label: '开始日期' });
    var endInput = U.dateTimeField({ kind: 'date', compact: true, value: U.ymd(end), label: '结束日期' });
    var startTime = U.dateTimeField({ kind: 'time', compact: true, value: '00:00', label: '开始时间' });
    var endTime = U.dateTimeField({ kind: 'time', compact: true, value: '23:59', label: '结束时间' });
    var granularity = U.store.get('dashboard_granularity:' + encodeURIComponent(account.id), 'day');
    if (granularity !== 'hour') granularity = 'day';
    var rangeMode = U.store.get('dashboard_range_mode:' + encodeURIComponent(account.id), '7d');
    if (['today', '7d', '30d', 'custom'].indexOf(rangeMode) < 0) rangeMode = '7d';
    var requestVersion = 0, summaryVersion = 0, platformVersion = 0, concurrencyVersion = 0, lastSummary = null;
    var lastChannels = null, lastPlaza = global.S.plaza || null, lastConcurrency = null;
    var appliedQuery = null, refreshedAt = Date.now(), refreshTimer = null;
    function current() { return Api.AUTH.matches(account) && App.isPageRetained(page); }
    var granularityControl = h('div', { class: 'seg dashboard-granularity', 'aria-label': '统计粒度' },
      ['day', 'hour'].map(function (value) {
        return h('button', { class: value === granularity ? 'active' : '', onclick: function () {
          granularity = value;
          U.store.set('dashboard_granularity:' + encodeURIComponent(account.id), granularity);
          Array.prototype.forEach.call(granularityControl.children, function (button, index) {
            button.className = index === (value === 'day' ? 0 : 1) ? 'active' : '';
          });
          loadCharts();
        } }, value === 'day' ? '按日' : '按小时');
      })
    );

    var advanced = h('div', { class: 'dashboard-controls dashboard-advanced' + (rangeMode === 'custom' ? '' : ' is-collapsed') },
      h('div', { class: 'dashboard-date-row' },
        h('label', null, '开始日期', startInput), h('label', null, '结束日期', endInput)),
      h('div', { class: 'dashboard-date-row dashboard-time-row' },
        h('label', null, '开始时间', startTime), h('label', null, '结束时间', endTime)),
      h('div', { class: 'dashboard-control-row' },
        h('span', { class: 'tiny muted dashboard-range-note' }, '按设备本地时间统计，包含结束分钟'),
        h('button', { class: 'btn btn-sm', onclick: loadCharts }, '应用日期')));
    var rangeControl = h('div', { class: 'seg dashboard-range-presets', 'aria-label': '统计时段' },
      [{ k: 'today', t: '今日' }, { k: '7d', t: '近 7 天' }, { k: '30d', t: '近 30 天' }, { k: 'custom', t: '自定义' }].map(function (item) {
        return h('button', { class: item.k === rangeMode ? 'active' : '', onclick: function () { applyPreset(item.k); } }, item.t);
      }));
    function applyPreset(mode) {
      rangeMode = mode;
      U.store.set('dashboard_range_mode:' + encodeURIComponent(account.id), mode);
      var last = new Date(), first = new Date();
      first.setDate(last.getDate() - (mode === '7d' ? 6 : mode === '30d' ? 29 : 0));
      startInput.value = U.ymd(first);
      endInput.value = U.ymd(last);
      startTime.value = '00:00';
      endTime.value = '23:59';
      Array.prototype.forEach.call(rangeControl.children, function (button) {
        button.className = button.textContent === ({ today: '今日', '7d': '近 7 天', '30d': '近 30 天', custom: '自定义' })[mode] ? 'active' : '';
      });
      advanced.classList.toggle('is-collapsed', mode !== 'custom');
      if (mode !== 'custom') loadCharts();
    }
    if (rangeMode !== 'custom') {
      var presetStart = new Date(), presetEnd = new Date();
      presetStart.setDate(presetEnd.getDate() - (rangeMode === '30d' ? 29 : rangeMode === '7d' ? 6 : 0));
      startInput.value = U.ymd(presetStart);
      endInput.value = U.ymd(presetEnd);
    }
    var dateControls = h('div', { class: 'dashboard-range-panel' },
      h('div', { class: 'dashboard-range-head' }, rangeControl,
        h('button', { class: 'icon-btn dashboard-more-range', title: '更多时间设置', 'aria-label': '更多时间设置', html: U.ic('calendar', 18), onclick: function () {
          if (rangeMode !== 'custom') {
            rangeMode = 'custom';
            Array.prototype.forEach.call(rangeControl.children, function (button) {
              button.className = button.textContent === '自定义' ? 'active' : '';
            });
          }
          advanced.classList.remove('is-collapsed');
          advanced.setAttribute('aria-hidden', 'false');
        } })),
      advanced);

    page.appendChild(summaryHost);
    page.appendChild(platformHost);
    page.appendChild(modelPreviewHost);
    page.appendChild(announcementHost);
    page.appendChild(section('用量分析', null, null, dateControls));
    page.appendChild(h('div', { class: 'dashboard-charts' }, modelHost, trendHost));
    page.appendChild(recentHost);
    page.appendChild(section('快捷操作', null, null, h('div', { class: 'dashboard-quick-actions' }, [
      { icon: 'key', label: '令牌', path: '#/keys' },
      { icon: 'chart', label: '用量', path: '#/usage' },
      { icon: 'card', label: '充值', path: '#/purchase' },
      { icon: 'gift', label: '兑换', path: '#/redeem' },
      { icon: 'bell', label: '公告', path: '#/announcements' },
      { icon: 'grid', label: '模型广场', path: '#/plaza' },
      { icon: 'activity', label: '渠道状态', path: '#/channel-status' }
    ].map(function (item) {
      return h('button', { class: 'quick', onclick: function () {
        App.go(item.path);
      } },
        h('i', { html: U.ic(item.icon, 18) }), h('span', { class: 'quick-label' }, item.label));
    }))));

    function renderSummary(stats) {
      stats = stats || {};
      var todayLoaded = stats._todayLoaded === true;
      var today = stats._today || {};
      var todayRequests = number(today.total_requests);
      var todayInput = number(today.total_input_tokens);
      var todayOutput = number(today.total_output_tokens);
      var todayTokens = dashboardTodayTokens(today);
      var todayCost = statCost(today);
      var todayQuality = global.UsageAnalysis.values({
        total_requests: today.total_requests,
        total_errors: pick(today, 'total_errors', 'error_count', 'errors', 'failed_requests', 'failed_count'),
        success_rate: pick(today, 'success_rate', 'request_success_rate'),
        success_requests: pick(today, 'success_requests', 'successful_requests'),
        status_known: pick(today, 'status_known')
      });
      var todaySuccess = todayLoaded ? todayQuality.successRate : null;
      var todayErrors = todayLoaded ? todayQuality.errors : null;
      var todayBreakdownKnown = todayLoaded && !(todayTokens > 0 && todayInput + todayOutput === 0);
      var todayCacheBase = todayInput + number(today.total_cache_creation_tokens) + number(today.total_cache_read_tokens);
      var todayCacheHit = todayCacheBase ? number(today.total_cache_read_tokens) / todayCacheBase * 100 : null;
      var totalRequests = number(stats.total_requests);
      var totalCost = statCost(stats);
      var totalTokens = stats.total_tokens === null || stats.total_tokens === undefined ? null : number(stats.total_tokens);
      summaryHost.innerHTML = '';
      var balanceValue = balanceMoney(C.balanceOf(global.S.user || Api.AUTH.user() || {}));
      var balanceCard = h('button', {
        class: 'card dashboard-metric dashboard-balance-block', type: 'button',
        onclick: function () { App.go('#/purchase'); }
      },
        h('span', { class: 'dashboard-metric-label' }, h('i', { html: U.ic('card', 16) }), '账户余额'),
        h('strong', { class: 'dashboard-balance-value' }, balanceValue));
      var overviewHead = h('div', { class: 'dashboard-overview-head' },
        h('div', { class: 'dashboard-eyebrow' }, '账户概览'),
        h('div', { class: 'dashboard-refresh-time' }, '更新于 ',
          h('time', { datetime: new Date(refreshedAt).toISOString() },
            new Date(refreshedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))));
      var liveQuality = h('div', { class: 'card dashboard-metric dashboard-quality-item dashboard-live-quality' },
        h('div', { class: 'dashboard-metric-label' }, h('i', { class: 'dashboard-live-mark' }, h('b')), '实时性能'),
        h('strong', null, U.num(today.rpm) + ' RPM'),
        h('div', { class: 'dashboard-metric-detail' },
          h('div', null, U.num(today.tpm) + ' TPM'),
          h('div', { class: 'dashboard-live-concurrency' },
            '当前并发 ' + (lastConcurrency === null ? '—' : U.num(lastConcurrency)) + ' 路'),
          h('div', null, '累计 ' + (totalTokens === null ? '—' : token(totalTokens)))));
      var qualityCard = h('section', { class: 'card dashboard-quality' },
        h('div', { class: 'dashboard-quality-head' },
          h('div', null, h('strong', null, '运行质量'), h('span', null, '请求、缓存与实时性能')),
          h('button', { class: 'dashboard-inline-action', onclick: function () { App.go('#/usage'); } }, '查看用量 ›')),
        h('div', { class: 'dashboard-quality-grid' },
          metric('今日请求', todayLoaded ? U.num(todayRequests) : '—',
            ['累计 ' + U.num(totalRequests), todayLoaded ? '今日记录' : '统计不可用'], 'chart'),
          metric('今日成功率', compactPercent(todaySuccess),
            [todayErrors != null ? '今日出错 ' + U.num(Math.min(todayErrors, todayRequests)) : '结果明细未提供',
             '累计请求 ' + U.num(totalRequests)], 'shield'),
          metric('今日缓存命中', compactPercent(todayCacheHit),
            ['读 ' + optionalToken(todayCacheBase > 0, today.total_cache_read_tokens),
             '写 ' + optionalToken(todayCacheBase > 0, today.total_cache_creation_tokens)], 'bolt'),
          liveQuality));
      var heroCard = h('section', { class: 'card dashboard-hero-card' },
        h('div', { class: 'dashboard-hero-top' },
          h('div', { class: 'dashboard-balance-wrap' }, overviewHead, balanceCard),
          h('div', { class: 'dashboard-hero-secondary' },
            metric('今日费用', money(todayCost), ['累计 ' + money(totalCost), '按实际用量结算'], 'card'),
            metric('今日 Tokens', optionalToken(todayLoaded, todayTokens),
              ['输入 ' + optionalToken(todayBreakdownKnown, todayInput),
               '输出 ' + optionalToken(todayBreakdownKnown, todayOutput)], 'bolt'))));
      summaryHost.appendChild(h('div', { class: 'dashboard-overview' }, heroCard, qualityCard));
      summaryHost.appendChild(h('div', { class: 'dashboard-overview-actions' },
        h('button', { class: 'btn', onclick: function () { App.go('#/keys'); } }, h('span', { html: U.ic('key', 16) }), '管理令牌'),
        h('button', { class: 'btn', onclick: function () { App.go('#/usage'); } }, h('span', { html: U.ic('chart', 16) }), '用量明细'),
        h('button', { class: 'btn', onclick: App.refreshPublic }, h('span', { html: U.ic('refresh', 16) }), '同步模型')));
    }

    function loading(host) {
      host.innerHTML = '';
      host.appendChild(h('div', { class: 'dashboard-loading' }, '加载中…'));
    }

    function showError(host, title, retry) {
      host.innerHTML = '';
      host.appendChild(h('div', { class: 'dashboard-error' }, title, ' ', h('button', { onclick: retry }, '重试')));
    }

    function loadConcurrency() {
      var version = ++concurrencyVersion;
      return Api.keys(1, 100).then(function (result) {
        if (!current() || version !== concurrencyVersion) return;
        var items = arrOf(result);
        var sum = 0, known = 0;
        global.S.keys = items;
        items.forEach(function (key) {
          var value = pick(key, 'current_concurrency');
          if (value === undefined || value === null || value === '' || !isFinite(Number(value)) || Number(value) < 0) return;
          sum += Number(value);
          known++;
        });
        lastConcurrency = items.length && known === items.length ? sum : null;
        if (lastSummary) renderSummary(lastSummary);
      }).catch(function () {
        if (!current() || version !== concurrencyVersion) return;
        lastConcurrency = null;
        if (lastSummary) renderSummary(lastSummary);
      });
    }

    function loadSummary(silent) {
      var version = ++summaryVersion;
      if (silent !== true || !lastSummary) loading(summaryHost);
      var totalRequest = Api.usageStats({ period: 'all' });
      var todayRequest = Api.usageStats({ period: 'today' });
      return Promise.all([
        totalRequest.catch(function () { return {}; }),
        todayRequest.catch(function () { return null; })
      ]).then(function (values) {
        if (!current() || version !== summaryVersion) return;
        if (values[1] === null && !lastSummary) {
          showError(summaryHost, '账户统计加载失败', loadSummary);
          return;
        }
        var total = unwrapStats(values[0]);
        var today = values[1] === null ? unwrapStats(lastSummary && lastSummary._today) : unwrapStats(values[1]);
        var hasTotal = !!(values[0] && Object.keys(total).length);
        var stats = Object.assign({}, hasTotal || !lastSummary ? total : lastSummary, {
          _today: today,
          _todayLoaded: values[1] !== null || !!(lastSummary && lastSummary._todayLoaded)
        });
        if (number(stats.total_requests) > 0 && number(stats.total_tokens) === 0) stats.total_tokens = null;
        lastSummary = stats;
        renderSummary(stats);
        if (platformHost.childNodes.length) renderPlatforms();
        loadConcurrency();
      }).catch(function () {
        if (current() && version === summaryVersion && (silent !== true || !lastSummary)) {
          showError(summaryHost, '账户统计加载失败', loadSummary);
        }
      });
    }

    function featureHead(icon, label) {
      return h('div', { class: 'home-platform-feature-head' },
        h('span', { class: 'home-platform-icon', html: U.ic(icon, 17) }),
        h('span', { class: 'home-platform-name' }, label),
        h('span', { class: 'home-platform-arrow', html: U.ic('chevron', 15) })
      );
    }

    function renderPlatforms() {
      var plaza = lastPlaza || global.S.plaza || {};
      var plazaStats = C.homePlazaSummary(plaza);
      var availability = C.availabilitySummary(lastChannels && lastChannels.items);
      var todayLoaded = !!(lastSummary && lastSummary._todayLoaded);
      var today = lastSummary && lastSummary._today || {};
      var usageValues = [
        ['今日费用', todayLoaded ? money(statCost(today)) : '—'],
        ['今日请求', todayLoaded ? U.num(number(today.total_requests)) : '—'],
        ['今日 Tokens', optionalToken(todayLoaded, dashboardTodayTokens(today))]
      ];
      var usageFeature = h('button', {
        class: 'home-platform-feature home-platform-usage dashboard-platform-feature',
        type: 'button', 'aria-label': '查看平台用量',
        onclick: function () { App.go('#/usage'); }
      },
        featureHead('chart', '平台用量'),
        h('div', { class: 'home-platform-usage-metrics' }, usageValues.map(function (item) {
          return h('div', { class: 'home-platform-usage-metric' },
            h('b', null, item[1]), h('span', null, item[0]));
        })),
        h('span', { class: 'home-platform-feature-meta' }, '账户今日实时用量'));
      var plazaFeature = h('button', {
        class: 'home-platform-feature dashboard-platform-feature',
        type: 'button', 'aria-label': '进入模型广场',
        onclick: function () { App.go('#/plaza'); }
      },
        featureHead('grid', '模型广场'),
        h('strong', { class: 'home-platform-feature-value' },
          plazaStats.models ? U.num(plazaStats.models) + ' 个模型' : (global.S.plazaLoading ? '同步中' : '等待数据')),
        h('span', { class: 'home-platform-feature-meta' },
          plazaStats.models ? plazaStats.groups + ' 个分组' +
            (plazaStats.vendors ? ' · ' + plazaStats.vendors + ' 个厂商' : '') : '查看分组、定价与上下文'));
      var channelValue = availability.failed ? availability.failed + ' 个异常'
        : availability.warning ? availability.warning + ' 个波动'
        : availability.total ? '运行正常' : '等待数据';
      var channelMeta = availability.total
        ? '平均可用率 ' + compactPercent(availability.average) + ' · ' + availability.total + ' 条线路'
        : '公开可用率暂未返回';
      var channelFeature = h('button', {
        class: 'home-platform-feature dashboard-platform-feature',
        type: 'button', 'aria-label': '查看渠道状态',
        onclick: function () { App.go('#/channel-status'); }
      },
        featureHead('activity', '渠道状态'),
        h('strong', { class: 'home-platform-feature-value' }, channelValue),
        h('span', { class: 'home-platform-feature-meta' }, channelMeta));
      platformHost.innerHTML = '';
      platformHost.appendChild(h('section', { class: 'section home-platform-section dashboard-platform-section' },
        h('div', { class: 'home-platform-head' },
          h('div', null,
            h('span', { class: 'home-platform-eyebrow' }, 'BEARLAB PULSE'),
            h('h2', null, '平台用量')),
          h('span', { class: 'home-platform-live' }, h('i', null), 'LIVE')),
        h('div', { class: 'home-platform-grid dashboard-platforms' },
          usageFeature, plazaFeature, channelFeature)));
    }

    function renderModelPreview() {
      var models = C.plazaModels(lastPlaza || global.S.plaza || {});
      var byName = Object.create(null);
      models.forEach(function (model) {
        if (model && model.name && !byName[model.name]) byName[model.name] = model;
      });
      var preview = Object.keys(byName).map(function (name) { return byName[name]; }).slice(0, 4);
      modelPreviewHost.innerHTML = '';
      if (!preview.length) {
        modelPreviewHost.appendChild(section('模型速览', null, null,
          h('div', { class: 'dashboard-empty' }, global.S.plazaLoading ? '正在同步模型目录…' : '模型目录暂未返回')));
        return;
      }
      modelPreviewHost.appendChild(section('模型速览', '全部模型', function () { App.go('#/plaza'); },
        card(preview.map(function (model) { return C.modelRow(model); }))));
    }

    function loadPlatforms(silent) {
      var version = ++platformVersion;
      if (silent !== true) loading(platformHost);
      return Promise.all([
        Api.plaza().catch(function () { return lastPlaza || global.S.plaza || null; }),
        Api.channelStatus().catch(function () { return null; })
      ]).then(function (values) {
        if (!current() || version !== platformVersion) return;
        lastPlaza = values[0] || lastPlaza;
        lastChannels = values[1] || lastChannels;
        renderPlatforms();
        renderModelPreview();
      }).catch(function () {
        if (!current() || version !== platformVersion) return;
        renderPlatforms();
        renderModelPreview();
      });
    }

    function loadAnnouncements() {
      return Api.announcements().then(function (list) {
        if (!current()) return;
        var items = arrOf(list).slice(0, 2);
        announcementHost.innerHTML = '';
        if (!items.length) {
          announcementHost.appendChild(section('Bear 公告', null, null,
            h('div', { class: 'dashboard-empty' }, '暂无公告')));
          return;
        }
        announcementHost.appendChild(section('Bear 公告', '全部公告', function () { App.go('#/announcements'); },
          card(items.map(function (item) {
            var date = C.announcementDate(item);
            return h('div', {
              class: 'dashboard-announcement',
              onclick: function () { App.go('#/announcements/' + (item.id || 0)); }
            },
              h('span', { class: 'dashboard-announcement-icon', html: U.ic('bell', 17) }),
              h('div', { class: 'dashboard-announcement-body' },
                h('strong', null, C.announcementTitle(item)),
                h('span', null, C.plainAnnouncementText(C.announcementContent(item)).slice(0, 120)),
                h('time', null, U.ago(date) || U.date(date))));
          }))));
      }).catch(function () {
        if (!current()) return;
        announcementHost.innerHTML = '';
        announcementHost.appendChild(section('Bear 公告', null, null,
          h('div', { class: 'dashboard-empty' }, '公告暂时无法加载')));
      });
    }

    function query() {
      return { start_date: startInput.value, end_date: endInput.value,
        start_time: startTime.value, end_time: endTime.value };
    }

    function renderTrend(data) {
      var trend = data && Array.isArray(data.trend) ? data.trend : [];
      trendHost.innerHTML = '';
      if (!trend.length) {
        trendHost.appendChild(section('Token 使用趋势', null, null, h('div', { class: 'dashboard-empty' }, '所选时段暂无用量')));
        return;
      }
      var tokenSeries = [{ key: 'tokens', label: 'Tokens', color: '#10b981' }];
      var series = tokenSeries;
      var rows = trend;
      var max = 0;
      rows.forEach(function (row) {
        series.forEach(function (item) { max = Math.max(max, number(row[item.key])); });
      });
      max = niceMax(max);
      var width = Math.max(360, Math.min(2400, 90 + Math.max(rows.length - 1, 1) * 36));
      var height = 220, left = 48, right = width - 38, top = 12, bottom = 181;
      var plotWidth = right - left, plotHeight = bottom - top;
      function xAt(index) { return rows.length === 1 ? (left + right) / 2 : left + index * plotWidth / (rows.length - 1); }
      function yAt(item, row) {
        var value = Math.max(0, number(row[item.key])) / max;
        return bottom - value * plotHeight;
      }
      var chart = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'none', class: 'dashboard-trend-svg',
        role: 'group', 'aria-label': 'Token 用量趋势图', style: width > 360 ? 'min-width:' + width + 'px' : '' });
      for (var tick = 0; tick <= 4; tick++) {
        var y = bottom - tick * plotHeight / 4;
        chart.appendChild(svg('line', { x1: left, y1: y, x2: right, y2: y, class: 'dashboard-chart-grid' }));
        var leftLabel = svg('text', { x: left - 5, y: y + 4, 'text-anchor': 'end', class: 'dashboard-chart-label' });
        leftLabel.textContent = token(max * tick / 4);
        chart.appendChild(leftLabel);
      }
      var steps = Math.max(1, Math.floor(plotWidth / 105));
      var labelStep = Math.max(1, Math.ceil((rows.length - 1) / steps));
      rows.forEach(function (row, index) {
        if (index !== 0 && index !== rows.length - 1 &&
            (index % labelStep !== 0 || right - xAt(index) < 65)) return;
        var label = svg('text', { x: xAt(index), y: bottom + 19,
          'text-anchor': index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle', class: 'dashboard-chart-label' });
        label.textContent = chartDate(row.date);
        chart.appendChild(label);
      });
      tokenSeries.forEach(function (item) {
        var path = rows.map(function (row, index) {
          return (index ? 'L' : 'M') + xAt(index).toFixed(2) + ' ' + yAt(item, row).toFixed(2);
        }).join(' ');
        chart.appendChild(svg('path', { d: path, fill: 'none', stroke: item.color, 'stroke-width': 2.5,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          class: 'dashboard-trend-line', 'data-series': item.key }));
      });
      var indicator = svg('g', { 'pointer-events': 'none' });
      chart.appendChild(indicator);
      var detail = h('div', { class: 'dashboard-chart-detail', 'aria-live': 'polite' });
      function selectRow(row, index) {
        detail.innerHTML = '';
        detail.appendChild(h('strong', null, chartDate(row.date)));
        detail.appendChild(h('div', { class: 'dashboard-detail-values' }, [
          ['Tokens', token(row.tokens)], ['费用', money(row.cost)]
        ].map(function (item) { return h('span', null, item[0] + ' ', h('b', null, item[1])); })));
        while (indicator.firstChild) indicator.removeChild(indicator.firstChild);
        indicator.appendChild(svg('line', { x1: xAt(index), y1: top, x2: xAt(index), y2: bottom, class: 'dashboard-chart-indicator' }));
        tokenSeries.forEach(function (item) {
          indicator.appendChild(svg('circle', { cx: xAt(index), cy: yAt(item, row), r: 3.5,
            fill: item.color, stroke: 'var(--surface)', 'stroke-width': 1.5 }));
        });
      }
      rows.forEach(function (row, index) {
        var start = index ? (xAt(index - 1) + xAt(index)) / 2 : left;
        var end = index < rows.length - 1 ? (xAt(index) + xAt(index + 1)) / 2 : right;
        var hit = svg('rect', { x: start, y: top, width: Math.max(1, end - start), height: plotHeight,
          fill: 'transparent', tabindex: 0, role: 'button', class: 'dashboard-trend-point',
          'aria-label': chartDate(row.date) + '，Tokens ' + U.num(number(row.tokens)) + '，费用 ' + money(row.cost) });
        hit.addEventListener('click', function () { selectRow(row, index); });
        hit.addEventListener('focus', function () { selectRow(row, index); });
        hit.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRow(row, index); } });
        chart.appendChild(hit);
      });
      selectRow(rows[rows.length - 1], rows.length - 1);
      trendHost.appendChild(section('用量趋势', null, null, h('div', { class: 'dashboard-chart' },
        h('div', { class: 'dashboard-chart-head' }, h('strong', null, 'Token 用量'),
          h('div', { class: 'dashboard-granularity-inline' }, granularityControl)),
        h('div', { class: 'dashboard-legend' }, series.map(function (item) {
          return h('span', null, h('i', { style: { background: item.color } }), item.label);
        })),
        h('div', { class: 'dashboard-chart-scroll' }, chart),
        detail
      )));
    }

    function renderModels(data) {
      var models = data && Array.isArray(data.models) ? data.models.slice() : [];
      modelHost.innerHTML = '';
      if (!models.length) {
        modelHost.appendChild(section('模型分布', null, null, h('div', { class: 'dashboard-empty' }, '所选时段暂无模型调用')));
        return;
      }
      models.sort(function (a, b) { return number(b.total_tokens) - number(a.total_tokens); });
      var colors = DONUT_COLORS;
      var total = models.reduce(function (sum, model) { return sum + Math.max(0, number(model.total_tokens)); }, 0);
      var shares = models.map(function (model) { return total ? Math.max(0, number(model.total_tokens)) / total * 100 : 0; });
      var ring = donut(models, total);
      var legend = h('div', { class: 'dashboard-donut-legend' }, models.slice(0, 4).map(function (model, index) {
        return h('div', { class: 'dashboard-donut-legend-row' },
          h('i', { style: { background: colors[index % colors.length] } }),
          h('span', { class: 'dashboard-donut-legend-name' }, model.model || '未知模型'),
          h('b', null, shares[index] >= 10 ? shares[index].toFixed(0) + '%' : shares[index] >= 0.1 ? shares[index].toFixed(1) + '%' : '<0.1%'));
      }).concat(models.length > 4 ? [h('div', { class: 'dashboard-donut-legend-more' }, '另有 ' + (models.length - 4) + ' 个模型')] : []));
      var head = h('thead', null, h('tr', null, ['模型', '请求', 'Token', '费用'].map(function (name) { return h('th', { scope: 'col' }, name); })));
      var body = h('tbody', null, models.map(function (model, index) {
        return h('tr', null,
          h('th', { scope: 'row' }, h('span', { class: 'dashboard-model-cell' },
            h('i', { style: { background: colors[index % colors.length] } }), h('span', null, model.model || '未知模型'))),
          h('td', { 'data-label': '请求' }, U.num(number(model.requests))),
          h('td', { 'data-label': 'Token' }, token(model.total_tokens)),
          h('td', { 'data-label': '费用', class: 'dashboard-model-actual' }, money(model.actual_cost)));
      }));
      modelHost.appendChild(section('模型分布', null, null, h('div', { class: 'dashboard-models' },
        h('div', { class: 'dashboard-donut-block' },
          h('div', { class: 'dashboard-donut-wrap' }, ring,
            h('div', { class: 'dashboard-donut-center', 'aria-hidden': 'true' }, h('strong', null, token(total)), h('span', null, '总 Tokens'))),
          legend),
        h('div', { class: 'dashboard-model-table-scroll' },
          h('table', { class: 'dashboard-model-table', 'aria-label': '模型调用明细' }, head, body))
      )));
    }

    function renderRecent(data, loadingState) {
      var records = arrOf(data).slice(0, 5);
      recentHost.innerHTML = '';
      recentHost.appendChild(section('最近调用', '全部记录', function () { App.go('#/usage'); }, loadingState
        ? h('div', { class: 'dashboard-empty' }, '正在加载最近调用…') : records.length
        ? h('div', { class: 'dashboard-recent' }, records.map(function (item) {
            var tok = global.UsageAnalysis.tokenBreakdown(item);
            var lat = global.UsageAnalysis.latency(item);
            var latLevels = global.UsageAnalysis.latencyLevels(lat);
            return h('div', { class: 'dashboard-recent-row' },
              h('div', { class: 'dashboard-recent-info' }, h('strong', null, item.model || '请求'),
                h('small', null, U.datetime(item.created_at)),
                h('small', { class: 'recent-tokens' }, '↓' + token(tok.input) + ' ↑' + token(tok.output)),
                lat && lat.total != null ? h('small', { class: 'recent-latency' },
                  h('span', { class: 'latency-' + (latLevels.total || 'unknown') },
                    '总耗时 ' + global.UsageAnalysis.ms(lat.total)),
                  lat.tps ? h('span', { class: 'usage-tps' }, ' · ' + lat.tps.toFixed(1) + ' tok/s') : null) : null),
              h('div', { class: 'dashboard-recent-price' }, h('b', null, money(item.cost))));
          })) : h('div', { class: 'dashboard-empty' }, '所选时段暂无调用记录')));
    }

    function loadCharts(silent) {
      var version = ++requestVersion;
      if (silent !== true) {
        try {
          appliedQuery = { range: global.UsageAnalysis.parseRange(startInput.value, startTime.value, endInput.value, endTime.value),
            query: query(), granularity: granularity };
        } catch (error) { U.toast(error.message, 'err'); return; }
      }
      if (!appliedQuery) return;
      var range = appliedQuery.range;
      var q = Object.assign({}, appliedQuery.query, {
        start_timestamp: Math.floor(range.start.getTime() / 1000),
        end_timestamp: Math.floor(range.endExclusive.getTime() / 1000)
      });
      var selectedGranularity = appliedQuery.granularity;
      if (silent !== true) { loading(trendHost); loading(modelHost); renderRecent([], true); }
      if (!range.wholeDays) {
        fetchUsageRecords(range, current).then(function (records) {
          if (!current() || version !== requestVersion) return;
          var result = aggregateUsage(records, selectedGranularity);
          renderTrend({ trend: result.trend });
          renderModels({ models: result.models });
          renderRecent(result.records);
        }).catch(function (error) {
          if (!current() || version !== requestVersion || silent === true) return;
          [trendHost, modelHost, recentHost].forEach(function (host) { showError(host, error.message || '时段统计加载失败', loadCharts); });
        });
        return;
      }
      Api.usageTrend(Object.assign({ granularity: selectedGranularity }, q)).then(function (data) {
        if (current() && version === requestVersion) renderTrend(data);
      }).catch(function () { if (current() && version === requestVersion && silent !== true) showError(trendHost, '趋势加载失败', loadCharts); });
      Api.usageModels(q).then(function (data) {
        if (current() && version === requestVersion) renderModels(data);
      }).catch(function () { if (current() && version === requestVersion && silent !== true) showError(modelHost, '模型分布加载失败', loadCharts); });
      Api.usageLogs({ page: 1, page_size: 5, start_timestamp: q.start_timestamp, end_timestamp: q.end_timestamp }).then(function (data) {
        if (current() && version === requestVersion) renderRecent(data);
      }).catch(function () { if (current() && version === requestVersion && silent !== true) showError(recentHost, '调用记录加载失败', loadCharts); });
    }

    function refreshCharts() {
      clearTimeout(refreshTimer);
      if (!current() || !App.isPageActive(page) || document.hidden) return;
      var version = ++requestVersion;
      var applied = appliedQuery;
      if (!applied || !applied.range.wholeDays) return;
      var q = Object.assign({}, applied.query, {
        granularity: applied.granularity,
        start_timestamp: Math.floor(applied.range.start.getTime() / 1000),
        end_timestamp: Math.floor(applied.range.endExclusive.getTime() / 1000)
      });
      Api.usageTrend(q).then(function (data) {
        if (current() && version === requestVersion) renderTrend(data);
      }).catch(function () {});
      Api.usageModels(applied.query).then(function (data) {
        if (current() && version === requestVersion) renderModels(data);
      }).catch(function () {});
      Api.usageLogs({ page: 1, page_size: 5, start_timestamp: applied.query.start_timestamp, end_timestamp: applied.query.end_timestamp }).then(function (data) {
        if (current() && version === requestVersion) renderRecent(data);
      }).catch(function () {});
    }

    function refreshVisible() {
      clearTimeout(refreshTimer);
      if (!current() || !App.isPageActive(page) || document.hidden) return;
      refreshedAt = Date.now();
      loadSummary(true);
      refreshCharts();
      loadPlatforms(true);
      refreshTimer = setTimeout(refreshVisible, 5000);
    }
    function scheduleRefresh() {
      clearTimeout(refreshTimer);
      if (!current() || !App.isPageActive(page) || document.hidden) return;
      var remaining = 5000 - Math.max(0, Date.now() - refreshedAt);
      if (remaining <= 0) refreshVisible();
      else refreshTimer = setTimeout(refreshVisible, remaining);
    }
    function userUpdated() {
      if (!current()) return;
      var balanceValue = summaryHost.querySelector('.dashboard-balance-value');
      var nextBalance = balanceMoney(C.balanceOf(global.S.user || Api.AUTH.user() || {}));
      if (balanceValue && balanceValue.textContent !== nextBalance) balanceValue.textContent = nextBalance;
    }
    function manualUpdated() {
      if (!current()) return;
      refreshedAt = Date.now();
      loadSummary(true);
      refreshCharts();
      loadPlatforms(true);
      loadAnnouncements();
    }
    function liveUpdated(event) {
      if (!current() || !event.detail || !event.detail.changed) return;
      var changed = event.detail.changed;
      if (changed.plaza) lastPlaza = changed.plaza;
      if (changed.channel) lastChannels = changed.channel;
      if (changed.plaza || changed.channel) {
        renderPlatforms();
        renderModelPreview();
      }
      if (changed.usage || changed.plaza || changed.channel) loadSummary(true);
    }
    function plazaUpdated(event) {
      if (!current() || !event.detail || !event.detail.plaza) return;
      lastPlaza = event.detail.plaza;
      renderPlatforms();
      renderModelPreview();
    }
    global.addEventListener('pp:user-updated', userUpdated);
    global.addEventListener('pp:live-refreshed', liveUpdated);
    global.addEventListener('pp:plaza-updated', plazaUpdated);
    page.addEventListener('pp:page-activate', function () {
      scheduleRefresh();
      loadPlatforms(true);
    });
    page.addEventListener('pp:page-deactivate', function () { clearTimeout(refreshTimer); });
    page.addEventListener('pp:page-refresh', function () {
      refreshedAt = Date.now();
      loadSummary(true);
      refreshCharts();
      loadPlatforms(true);
      loadAnnouncements();
      scheduleRefresh();
    });
    page.addEventListener('pp:page-dispose', function () {
      clearTimeout(refreshTimer);
      global.removeEventListener('pp:user-updated', userUpdated);
      global.removeEventListener('pp:live-refreshed', liveUpdated);
      global.removeEventListener('pp:plaza-updated', plazaUpdated);
    });
    renderPlatforms();
    loadSummary();
    loadPlatforms();
    loadAnnouncements();
    loadCharts();
    return page;
  }

  global.PagesDashboard = { renderDashboard: renderDashboard };
})(window);
