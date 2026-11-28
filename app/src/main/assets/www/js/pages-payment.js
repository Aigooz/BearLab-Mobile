/* BearLab top-up and top-up history. */
(function (global) {
  'use strict';
  var U = global.U, C = global.PagesCore, h = C.h, section = C.section, pick = C.pick;
  var PAGE_SIZE = 20;
  var labels = {
    alipay: '支付宝',
    wxpay: '微信支付',
    stripe: '银行卡',
    creem: 'Creem',
    waffo: 'Waffo',
    waffo_pancake: 'Waffo',
    paypal: 'PayPal'
  };
  var statuses = {
    pending: { label: '待支付', tone: 'warn' },
    success: { label: '已到账', tone: 'ok' },
    failed: { label: '失败', tone: 'danger' }
  };

  function text(value) { return String(value === null || value === undefined ? '' : value).trim(); }
  function methodKey(value) { return text(value).toLowerCase(); }
  function methodLabel(value, info) {
    var key = methodKey(value);
    var list = info && Array.isArray(info.methods) ? info.methods : [];
    for (var i = 0; i < list.length; i++) {
      if (methodKey(list[i].key) === key) return list[i].label || labels[key] || list[i].key;
    }
    return labels[key] || key || '未标注';
  }
  function statusMeta(value) {
    var key = methodKey(value);
    return statuses[key] || { label: text(value) || '状态未知', tone: '' };
  }
  function money(value) {
    var n = Number(value);
    if (value === null || value === undefined || value === '' || !isFinite(n)) return '¥—';
    var output;
    if (typeof U.moneyCNY === 'function') output = U.moneyCNY(n);
    else output = n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    output = String(output === null || output === undefined ? '' : output).trim();
    if (!output) output = n.toFixed(2);
    return /^(?:¥|￥|CNY|人民币)/i.test(output) || /元$/.test(output) ? output : '¥' + output;
  }
  function quotaMoney(user) {
    var quota = pick(user || {}, 'quota');
    if (quota === null || quota === undefined || quota === '' || !isFinite(Number(quota))) return '¥—';
    if (typeof Api.formatQuota === 'function') {
      var formatted = Api.formatQuota(Number(quota));
      if (typeof formatted === 'number') return money(formatted);
      var output = text(formatted);
      return /^(?:¥|￥|CNY|人民币)/i.test(output) || /元$/.test(output) ? output : money(output);
    }
    return typeof U.moneyCNY === 'function' ? money(quota) : '¥—';
  }
  function requestMessage(error, fallback) {
    var message = text(error && (error.message || error));
    return /access control checks|aborterror|request was cancelled|request canceled|load failed|networkerror/i.test(message)
      ? '请求异常中断' : message || fallback;
  }
  function externalUrl(value) {
    try {
      var base = text(Api.ORIGIN) || 'https://bearlab.ai';
      var url = new URL(text(value), base);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
      return url.href;
    } catch (e) { return ''; }
  }
  function isFormData(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
  }
  function normalizeInfo(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('充值配置返回不完整');
    var seen = Object.create(null);
    var methods = [];
    var rawMethods = Array.isArray(raw.pay_methods) ? raw.pay_methods :
      (Array.isArray(raw.methods) ? raw.methods : []);
    rawMethods.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var key = text(item.type || item.key);
      if (!key || seen[methodKey(key)]) return;
      seen[methodKey(key)] = true;
      methods.push({ key: key, label: text(item.label || item.name) });
    });
    var min = Number(raw.min_topup != null ? raw.min_topup : raw.min_amount);
    var max = raw.max_amount === null || raw.max_amount === undefined || raw.max_amount === '' ? null : Number(raw.max_amount);
    var options = (Array.isArray(raw.amount_options) ? raw.amount_options : []).map(Number).filter(function (value) {
      return isFinite(value) && value > 0;
    });
    var discount = 0;
    if (raw.discount && typeof raw.discount === 'object') {
      var factors = Object.keys(raw.discount).map(function (amount) {
        var factor = Number(raw.discount[amount]);
        return { amount: Number(amount), factor: factor };
      }).filter(function (entry) {
        return isFinite(entry.amount) && entry.amount > 0 && isFinite(entry.factor) && entry.factor > 0 && entry.factor < 1;
      }).sort(function (a, b) { return a.amount - b.amount; });
      discount = factors.length ? factors[0].factor : 0;
    } else {
      discount = Number(raw.discount);
    }
    return {
      enabled: raw.enable_online_topup != null ? raw.enable_online_topup === true : raw.enabled === true,
      methods: methods,
      min_amount: isFinite(min) && min >= 0 ? min : 0,
      max_amount: isFinite(max) && max > 0 ? max : null,
      amount_options: options,
      discount: isFinite(discount) ? discount : 0,
      enable_redemption: raw.enable_redemption === true,
      topup_link: text(raw.topup_link)
    };
  }
  function actualPayment(result) {
    if (result === null || result === undefined) return null;
    if (typeof result !== 'object') {
      var primitive = Number(result);
      return isFinite(primitive) && primitive > 0 ? { amount: primitive, discount: null, payment_method: '' } : null;
    }
    var fields = ['actual_amount', 'amount', 'pay_amount', 'payable_amount'];
    var value;
    for (var i = 0; i < fields.length; i++) {
      if (result[fields[i]] !== null && result[fields[i]] !== undefined && result[fields[i]] !== '') {
        value = result[fields[i]];
        break;
      }
    }
    var amount = Number(value);
    if (!isFinite(amount) || amount <= 0) return null;
    var discount = Number(result.discount);
    return {
      amount: amount,
      discount: isFinite(discount) && discount > 0 && discount <= 1 ? discount : null,
      payment_method: methodKey(result.payment_method)
    };
  }
  function discountHint(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0 || n >= 1) return '';
    var percent = Math.round((1 - n) * 1000) / 10;
    return '预计享受 ' + String(percent).replace(/\.0$/, '') + '% 优惠';
  }
  function recordTime(item) {
    var value = item.created_at;
    if (!value && item.create_time !== null && item.create_time !== undefined) {
      value = Number(item.create_time);
      if (isFinite(value) && value < 1e12) value *= 1000;
    }
    return U.datetime(value);
  }

  function renderPurchase(initialView) {
    if (!Api.AUTH.isLogged()) return global.PagesUser.needLogin();
    var page = h('div', { class: 'page payment-page' });
    var balance = h('strong', null, '¥—');
    var productHost = h('div');
    var formHost = h('div');
    var historyHost = h('div');
    var amount = h('input', {
      class: 'input payment-amount', type: 'number', inputmode: 'decimal', min: '0.01', step: '0.01',
      placeholder: '输入充值金额', 'aria-label': '充值金额（元）'
    });
    var methodsHost = h('div', { class: 'payment-methods' });
    var totalHint = h('div', { class: 'payment-total' });
    var submit = h('button', {
      class: 'btn btn-primary btn-block', type: 'button', disabled: true, onclick: confirmOrder
    }, '加载中…');
    var account = Api.AUTH.context();
    var info = null, infoLoading = false, infoError = '', method = '', submitting = false;
    var historyItems = [], historyPage = 0, historyTotal = 0, historyLoading = false;
    var historyLoaded = false, historyError = '', historyRequest = null, historyRevision = 0;
    var paymentAttempted = false, resumedPaymentCheck = false;
    var view = initialView === 'orders' ? 'orders' : 'products';
    var viewTabs = h('div', {
      class: 'payment-view-tabs', role: 'tablist', 'aria-label': '充值中心视图',
      style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
    });

    page.appendChild(h('div', { class: 'card payment-account-strip' },
      h('div', { class: 'payment-balance' }, h('span', null, '账户余额'), balance),
      h('div', { class: 'payment-account-note' }, '充值到账后，余额将自动更新。请先核对充值金额与应付金额。')));
    page.appendChild(viewTabs);
    page.appendChild(h('div', { class: 'payment-view-body' },
      h('section', { class: 'payment-view-panel', 'data-view': 'products', id: 'payment-purchase-panel' },
        productHost, formHost),
      h('section', { class: 'payment-view-panel', 'data-view': 'orders', id: 'payment-history-panel', hidden: true },
        historyHost)));

    function current() { return Api.AUTH.matches(account); }
    function currentUser() { return Api.AUTH.user() || global.S.user || {}; }
    function paintBalance(user) { balance.textContent = quotaMoney(user || currentUser()); }
    function refreshBalance() {
      paintBalance();
      if (!global.App || typeof global.App.refreshUser !== 'function') return Promise.resolve(currentUser());
      return Promise.resolve().then(function () { return global.App.refreshUser(); }).then(function (user) {
        if (current()) paintBalance(user || currentUser());
      }).catch(function () {});
    }
    function routeView() {
      var match = text(global.location.hash).match(/^#\/(purchase|orders)(?:\/|$)/);
      return match ? (match[1] === 'orders' ? 'orders' : 'products') : null;
    }
    function paintViews() {
      var defs = [
        { key: 'products', label: '充值', panel: 'payment-purchase-panel' },
        { key: 'orders', label: '充值记录', panel: 'payment-history-panel' }
      ];
      viewTabs.innerHTML = '';
      defs.forEach(function (def) {
        viewTabs.appendChild(h('button', {
          type: 'button', role: 'tab', id: 'payment-tab-' + def.key, 'aria-controls': def.panel,
          'aria-selected': view === def.key ? 'true' : 'false', class: view === def.key ? 'active' : '',
          onclick: function () { showView(def.key, true); }
        }, def.label));
      });
      Array.prototype.forEach.call(page.querySelectorAll('.payment-view-panel'), function (panel) {
        panel.hidden = panel.getAttribute('data-view') !== view;
      });
    }
    function showView(next, updateRoute) {
      if (next !== 'products' && next !== 'orders') return;
      if (updateRoute) {
        var path = next === 'orders' ? '#/orders' : '#/purchase';
        if (global.location.hash !== path) global.history.replaceState(null, '', path);
      }
      if (view === next) {
        paintViews();
      } else {
        view = next;
        paintViews();
      }
      if (view === 'orders' && !historyLoaded && !historyLoading) loadHistory(true);
    }
    function syncRouteView() {
      var next = routeView();
      if (next) showView(next, false);
    }
    function activate() {
      syncRouteView();
      paintViews();
      paintBalance();
      refreshBalance();
      if (!info && !infoLoading) loadInfo();
      if (view === 'orders' && !historyLoaded && !historyLoading) loadHistory(true);
    }

    function paintServiceStrip() {
      productHost.innerHTML = '';
      if (!info) return;
      var available = info.enabled && info.methods.length > 0;
      productHost.appendChild(h('div', { class: 'payment-service-strip' },
        h('span', { class: 'payment-service-icon', html: U.ic('card', 17) }),
        h('div', null,
          h('strong', null, '充值 BearLab 账户余额'),
          h('span', null, !info.enabled ? '站内在线充值暂未开启' :
            info.methods.length ? '支持 ' + info.methods.length + ' 种在线支付方式' : '站点暂未配置支付方式')),
        h('span', { class: 'badge ' + (available ? 'ok' : 'warn') }, 'CNY')));
    }
    function officialButton() {
      var url = externalUrl(info && info.topup_link);
      if (!url) return null;
      return h('button', {
        class: 'btn btn-block', type: 'button', style: { marginTop: '10px' },
        html: U.ic('external', 16), onclick: function () { C.open(url); }
      }, '官网充值');
    }
    function amountOptions() {
      if (!info) return [];
      var max = info.max_amount;
      return info.amount_options.filter(function (value) {
        return value >= info.min_amount && (!max || value <= max);
      });
    }
    function setDefaultAmount() {
      if (text(amount.value) || !info) return;
      var options = amountOptions();
      if (options.length) amount.value = String(options[0]);
      else if (info.min_amount > 0) amount.value = String(info.min_amount);
    }
    function readAmount() {
      var raw = text(amount.value);
      if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw)) return NaN;
      var value = Number(raw);
      return isFinite(value) && value > 0 ? value : NaN;
    }
    function selectedMethodAvailable() {
      if (!info) return false;
      return info.methods.some(function (item) { return item.key === method; });
    }
    function validation() {
      if (!info) return '充值信息尚未加载';
      if (!info.enabled) return '站内在线充值暂未开启';
      if (!info.methods.length) return '当前没有可用的支付方式';
      if (!selectedMethodAvailable()) return '请选择支付方式';
      var value = readAmount();
      if (!isFinite(value)) return '请输入有效金额，最多保留两位小数';
      if (value < info.min_amount) return '单笔最低充值 ' + money(info.min_amount);
      if (info.max_amount && value > info.max_amount) return '单笔最高充值 ' + money(info.max_amount);
      return '';
    }
    function updateSubmit() {
      if (!info) {
        submit.disabled = true;
        submit.textContent = infoLoading ? '加载中…' : '确认充值';
        return;
      }
      var available = info.enabled && info.methods.length > 0;
      submit.disabled = !available || submitting || infoLoading;
      submit.textContent = submitting ? '正在处理…' :
        infoLoading ? '正在更新…' :
        !info.enabled ? '充值暂不可用' : !info.methods.length ? '暂无支付方式' : '确认充值';
    }
    function updateTotal() {
      var value = readAmount();
      if (!isFinite(value)) {
        totalHint.textContent = '请输入充值金额';
        return;
      }
      var hint = info ? discountHint(info.discount) : '';
      totalHint.textContent = '充值 ' + money(value) + ' · 应付金额将在确认时查询' + (hint ? ' · ' + hint : '');
    }
    function paintMethods() {
      methodsHost.innerHTML = '';
      if (!info) return;
      info.methods.forEach(function (item) {
        methodsHost.appendChild(h('label', { class: 'payment-choice' },
          h('input', {
            type: 'radio', name: 'payment-method', value: item.key, checked: item.key === method,
            onchange: function () {
              method = item.key;
              updateSubmit();
            }
          }),
          h('span', null, methodLabel(item.key, info))));
      });
    }
    function paintAmountPresets() {
      Array.prototype.forEach.call(formHost.querySelectorAll('.payment-amount-presets button'), function (button) {
        button.classList.toggle('active', Number(button.getAttribute('data-amount')) === readAmount());
      });
    }
    function appendOfficial(host) {
      var button = officialButton();
      if (button) host.appendChild(button);
    }
    function paintUnavailable(message) {
      formHost.innerHTML = '';
      if (infoError) formHost.appendChild(h('div', { class: 'notice warn section' }, '充值信息刷新失败：' + infoError));
      formHost.appendChild(h('div', { class: 'notice warn section' }, message));
      appendOfficial(formHost);
      updateSubmit();
    }
    function paintForm() {
      if (!info) return;
      paintServiceStrip();
      if (!info.enabled) {
        paintUnavailable('站内在线充值暂未开启。如站点提供官网充值入口，可从下方前往。');
        return;
      }
      if (!info.methods.length) {
        paintUnavailable('当前没有可用的在线支付方式，请稍后再试或前往官网充值。');
        return;
      }
      if (!selectedMethodAvailable()) method = info.methods[0].key;
      formHost.innerHTML = '';
      if (infoError) formHost.appendChild(h('div', { class: 'notice warn section' }, '充值信息刷新失败：' + infoError));
      amount.min = String(info.min_amount > 0 ? info.min_amount : 0.01);
      if (info.max_amount) amount.setAttribute('max', String(info.max_amount));
      else amount.removeAttribute('max');
      var options = amountOptions();
      var amountBody = h('div', null,
        amount,
        options.length ? h('div', { class: 'payment-amount-presets' }, options.map(function (value) {
          return h('button', {
            type: 'button', class: Number(amount.value) === value ? 'active' : '',
            'data-amount': String(value), onclick: function () {
              amount.value = String(value);
              updateTotal();
              paintAmountPresets();
            }
          }, money(value));
        })) : null,
        h('div', { class: 'tiny muted payment-limit' },
          '单笔最低 ' + money(info.min_amount > 0 ? info.min_amount : 0.01) +
          (info.max_amount ? ' · 最高 ' + money(info.max_amount) : '')));
      formHost.appendChild(section('充值金额（元）', null, null, amountBody));
      formHost.appendChild(section('支付方式', null, null, methodsHost));
      formHost.appendChild(totalHint);
      formHost.appendChild(submit);
      appendOfficial(formHost);
      paintMethods();
      updateTotal();
      updateSubmit();
    }

    function loadInfo() {
      if (infoLoading) return Promise.resolve(info);
      infoLoading = true;
      infoError = '';
      if (!info) {
        productHost.innerHTML = '';
        formHost.innerHTML = '';
        formHost.appendChild(h('div', { class: 'dashboard-loading' }, '正在加载充值信息…'));
      }
      updateSubmit();
      return Promise.resolve().then(function () { return Api.paymentInfo(); }).then(function (raw) {
        if (!current()) return;
        info = normalizeInfo(raw);
        if (!selectedMethodAvailable()) method = info.methods.length ? info.methods[0].key : '';
        setDefaultAmount();
        paintForm();
        paintHistory();
      }).catch(function (error) {
        if (!current()) return;
        infoError = requestMessage(error, '充值信息加载失败');
        if (info) {
          paintForm();
          U.toast('充值信息刷新失败：' + infoError, 'err');
        } else {
          productHost.innerHTML = '';
          formHost.innerHTML = '';
          formHost.appendChild(h('div', { class: 'notice warn section' },
            '充值信息加载失败：' + infoError + ' ', h('button', { type: 'button', onclick: loadInfo }, '重试')));
        }
      }).finally(function () {
        infoLoading = false;
        if (current()) updateSubmit();
      });
    }

    function confirmOrder() {
      if (submitting || !current()) return;
      var error = validation();
      if (error) { U.toast(error, 'err'); return; }
      var entered = readAmount(), chosenMethod = method;
      submitting = true;
      updateSubmit();
      Promise.resolve().then(function () { return Api.paymentAmount(entered); }).then(function (response) {
        if (!current()) return null;
        var quoted = actualPayment(response);
        if (!quoted) throw new Error('应付金额返回不完整');
        var summary = h('div', { class: 'payment-confirm-summary' },
          h('strong', null, '充值 ' + money(entered)),
          h('dl', null,
            h('div', null, h('dt', null, '支付方式'), h('dd', null, methodLabel(chosenMethod, info))),
            h('div', null, h('dt', null, '充值金额'), h('dd', null, money(entered))),
            h('div', null, h('dt', null, '应付金额'), h('dd', null, money(quoted.amount)))),
          h('p', { class: 'small muted' }, '实际支付金额以收银台为准。'));
        return U.confirm('确认充值', summary, '去支付').then(function (ok) {
          if (!ok || !current()) return null;
          if (readAmount() !== entered || method !== chosenMethod) {
            throw new Error('充值金额或支付方式已变化，请重新确认');
          }
          return Promise.resolve().then(function () {
            return Api.createPayment({ amount: entered, payment_method: chosenMethod });
          }).then(function (payment) {
            if (!payment || !text(payment.url) || !isFormData(payment.data)) {
              throw new Error('支付页面返回不完整');
            }
            if (typeof Api.paymentForm !== 'function') throw new Error('支付页面组件暂不可用');
            var opening = Api.paymentForm({ url: text(payment.url), data: payment.data });
            paymentAttempted = true;
            resumedPaymentCheck = false;
            if (current()) U.toast('正在打开支付页面', 'ok');
            return Promise.resolve(opening);
          });
        });
      }).catch(function (error) {
        if (current()) U.toast(requestMessage(error, '充值支付失败') + '，可刷新充值记录核对结果', 'err');
      }).finally(function () {
        submitting = false;
        if (current()) updateSubmit();
      });
    }

    function paintHistory() {
      if (!historyLoaded && !historyLoading && !historyError) return;
      historyHost.innerHTML = '';
      if (historyLoading && !historyItems.length) {
        historyHost.appendChild(section('充值记录', null, null, h('div', { class: 'dashboard-loading' }, '正在加载充值记录…')));
        return;
      }
      if (historyError && !historyItems.length) {
        historyHost.appendChild(section('充值记录', null, null, h('div', { class: 'notice warn' },
          '充值记录加载失败：' + historyError + ' ',
          h('button', { type: 'button', onclick: function () { loadHistory(true); } }, '重试'))));
        return;
      }
      var rows = historyItems.map(function (item) {
        var status = statusMeta(item.status);
        var tradeNo = text(item.trade_no) || (item.id !== undefined ? '#' + item.id : '—');
        return h('div', { class: 'payment-order-row' },
          h('div', null,
            h('strong', null, '到账 ' + money(item.amount) + ' · 实付 ' + money(item.money)),
            h('div', { class: 'tiny muted' }, methodLabel(item.payment_method, info) + ' · ' + recordTime(item)),
            h('div', { class: 'tiny muted mono' }, '单号 ' + tradeNo)),
          h('span', { class: 'badge ' + status.tone }, status.label));
      });
      var content = h('div', null,
        h('div', { class: 'tiny muted' }, historyTotal > 0 ? '共 ' + historyTotal + ' 条充值记录' : ''),
        rows.length ? h('div', { class: 'payment-orders' }, rows) : h('div', { class: 'dashboard-empty' }, '暂无充值记录'),
        historyTotal > historyItems.length ? h('button', {
          class: 'btn btn-block', type: 'button', disabled: historyLoading, style: { marginTop: '10px' },
          onclick: function () { loadHistory(false); }
        }, historyLoading ? '加载中…' : '加载更多') : null);
      historyHost.appendChild(section('充值记录', historyLoading ? null : '刷新', function () {
        loadHistory(true);
      }, content));
    }
    function loadHistory(reset) {
      if (historyLoading) return historyRequest || Promise.resolve();
      var nextPage = reset || !historyPage ? 1 : historyPage + 1;
      if (reset) {
        historyItems = [];
        historyPage = 0;
        historyTotal = 0;
      }
      historyLoading = true;
      historyError = '';
      var revision = ++historyRevision;
      paintHistory();
      historyRequest = Promise.resolve().then(function () {
        return Api.topupHistory({ page: nextPage, page_size: PAGE_SIZE });
      }).then(function (data) {
        if (!current() || revision !== historyRevision) return;
        if (!data || !Array.isArray(data.items)) throw new Error('充值记录返回不完整');
        var pageNo = Number(data.page);
        var total = Number(data.total);
        var incoming = data.items.filter(function (item) { return !!item && typeof item === 'object'; });
        if (reset) historyItems = incoming;
        else {
          var known = Object.create(null);
          historyItems.forEach(function (item) {
            known[text(item.trade_no) || String(item.id)] = true;
          });
          incoming.forEach(function (item) {
            var key = text(item.trade_no) || String(item.id);
            if (!known[key]) { known[key] = true; historyItems.push(item); }
          });
        }
        historyPage = isFinite(pageNo) && pageNo > 0 ? pageNo : nextPage;
        historyTotal = isFinite(total) && total >= historyItems.length ? total : historyItems.length;
        historyLoaded = true;
      }).catch(function (error) {
        if (!current() || revision !== historyRevision) return;
        var message = requestMessage(error, '充值记录加载失败');
        if (historyItems.length) U.toast(message, 'err');
        else historyError = message;
      }).finally(function () {
        if (revision !== historyRevision) return;
        historyLoading = false;
        historyRequest = null;
        if (current()) paintHistory();
      });
      return historyRequest;
    }

    amount.addEventListener('input', function () {
      updateTotal();
      paintAmountPresets();
      updateSubmit();
    });
    amount.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !submitting) confirmOrder();
    });
    function refreshAfterCheckout() {
      if (!page.isConnected || !current()) return;
      function checkHistory() {
        if (!paymentAttempted || resumedPaymentCheck || !page.isConnected || !current()) return;
        resumedPaymentCheck = true;
        showView('orders', true);
        loadHistory(true).then(function () {
          U.toast('收银台已关闭，请以充值记录中的到账状态为准', 'ok');
        });
      }
      try {
        refreshBalance().then(checkHistory, checkHistory);
      } catch (e) {
        checkHistory();
      }
    }
    function onCheckoutClosed() {
      refreshAfterCheckout();
    }
    function onVisible() {
      if (document.hidden) return;
      refreshAfterCheckout();
    }
    global.addEventListener('hashchange', syncRouteView);
    document.addEventListener('visibilitychange', onVisible);
    global.addEventListener('pp:payment-closed', onCheckoutClosed);
    page.addEventListener('pp:page-activate', activate);
    page.addEventListener('pp:page-refresh', function () {
      if (!current()) return;
      loadInfo();
      refreshBalance();
      if (view === 'orders') loadHistory(true);
    });
    page.addEventListener('pp:page-dispose', function () {
      historyRevision++;
      global.removeEventListener('hashchange', syncRouteView);
      document.removeEventListener('visibilitychange', onVisible);
      global.removeEventListener('pp:payment-closed', onCheckoutClosed);
    });
    activate();
    return page;
  }

  global.PagesPayment = { renderPurchase: renderPurchase };
})(window);
