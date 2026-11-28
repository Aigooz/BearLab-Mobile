import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createPreviewServer, listenPreview } from '../preview.mjs';

const server = createPreviewServer();
await listenPreview(server);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  timezoneId: 'Asia/Shanghai'
});
const page = await context.newPage();
const errors = [];
const requests = [];
let loginMode = 'password';
let refreshShouldFail = false;

page.on('pageerror', error => errors.push(error.message));

const envelope = data => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ success: true, code: 0, message: '', data })
});
const raw = (body, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});
const publicStatus = {
  system_name: 'BearLab AI',
  version: '1.26.0',
  quota_display_type: 'CNY',
  quota_per_unit: 500000,
  register_enabled: true,
  user_agreement_enabled: true,
  privacy_policy_enabled: true,
  announcements: [
    { id: 7, title: '接口维护完成', content: '<p>服务已恢复</p>', publishDate: 1764326400 }
  ]
};
const groups = {
  default: { ratio: 1, desc: '默认分组' },
  auto: { ratio: 'auto', desc: '自动选择' }
};
const pricing = {
  success: true,
  pricing_version: 'fixture-pricing-v1',
  availability: { groups: { default: { 'gpt-6.1-sol': 99.5 } } },
  group_ratio: { default: 1, auto: 'auto' },
  usable_group: { default: '默认分组', auto: '自动选择' },
  vendors: { 1: { id: 1, name: 'Fixture' } },
  data: [
    {
      model_name: 'gpt-6.1-sol',
      enable_groups: ['default'],
      model_ratio: 2,
      completion_ratio: 10,
      cache_ratio: 0.1,
      create_cache_ratio: 2.5,
      context_length: 400000,
      billing_expr: 'tier("base", p * 2 + c * 10 + cr * 0.1 + cc * 2.5)',
      supported_endpoint_types: ['openai'],
      pricing_version: 'fixture-pricing-v1'
    },
    {
      model_name: 'conditional-model',
      enable_groups: ['default'],
      context_length: 272000,
      billing_expr: 'len <= 272000 ? tier("base", p * 2) : tier("long", p * 3)',
      pricing_version: 'fixture-pricing-v1'
    },
    {
      model_name: '[Fixture]image-pro',
      enable_groups: ['default'],
      quota_type: 1,
      model_price: 0.00008,
      billing_expr: 'tier("base", fixed(0.00008))',
      supported_endpoint_types: ['image'],
      pricing_version: 'fixture-pricing-v1'
    }
  ]
};

await page.route('**/__proxy/bearlab/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/__proxy/bearlab', '');
  const auth = request.headers().authorization || '';
  requests.push({
    method: request.method(),
    path,
    query: Object.fromEntries(url.searchParams),
    headers: { ...request.headers() },
    body: request.postDataJSON ? request.postDataJSON() : null
  });

  if (path === '/api/status') return route.fulfill(envelope(publicStatus));
  if (path === '/api/user/groups' || path === '/api/user/self/groups') {
    return route.fulfill(envelope(groups));
  }
  if (path === '/api/pricing') return route.fulfill(raw(pricing));
  if (path === '/api/user/models') {
    return route.fulfill(envelope({ default: ['gpt-6.1-sol', 'conditional-model', '[Fixture]image-pro'] }));
  }
  if (path === '/api/user/login') {
    if (loginMode === 'two-factor') {
      return route.fulfill(envelope({
        require_verification: true,
        flow_token: 'fixture-flow',
        methods: ['2fa']
      }));
    }
    return route.fulfill(envelope({
      access_token: 'fixture-access',
      refresh_token: 'fixture-refresh',
      access_expires_at: 4102444800,
      session: { sid: 'fixture-session' },
      user: { id: 42, username: 'fixture', email: 'fixture@example.test', quota: 2500000, used_quota: 1000000 }
    }));
  }
  if (path === '/api/user/login/2fa') {
    return route.fulfill(envelope({
      access_token: 'fixture-2fa-access',
      refresh_token: 'fixture-2fa-refresh',
      access_expires_at: 4102444800,
      session: { sid: 'fixture-2fa-session' },
      user: { id: 42, username: 'fixture', email: 'fixture@example.test', quota: 2500000, used_quota: 1000000 }
    }));
  }
  if (path === '/api/user/auth/refresh') {
    if (refreshShouldFail) return route.fulfill(raw({ success: false, message: 'expired' }, 401));
    return route.fulfill(envelope({
      access_token: 'fixture-access-refreshed',
      refresh_token: 'fixture-refresh-refreshed',
      access_expires_at: 4102444800,
      session: { sid: 'fixture-session-refreshed' },
      user: { id: 42, username: 'fixture', email: 'fixture@example.test', quota: 2500000, used_quota: 1000000 }
    }));
  }
  if (path === '/api/user/self' && request.method() === 'GET') {
    return route.fulfill(envelope({
      id: 42,
      username: 'fixture',
      email: 'fixture@example.test',
      quota: 2500000,
      used_quota: 1000000,
      request_count: 12,
      aff_code: 'FIXTURE'
    }));
  }
  if (path === '/api/token/' && request.method() === 'GET') {
    return route.fulfill(envelope({
      items: [{
        id: 7,
        name: 'Fixture key',
        key: 'sk-fixture****masked',
        status: 1,
        remain_quota: 500000,
        unlimited_quota: false,
        group: 'default',
        expired_time: -1
      }],
      page: 1,
      page_size: 20,
      total: 1
    }));
  }
  if (path === '/api/token/' && request.method() === 'PUT') {
    return route.fulfill(envelope({ id: 7, status: 2 }));
  }
  if (path === '/api/token/7/key') {
    return route.fulfill(envelope({ key: 'sk-fixture-complete-key-1234567890' }));
  }
  if (path === '/api/log/self') {
    return route.fulfill(envelope({
      items: [
        { id: 1, created_at: 1764326400, type: 2, model_name: 'gpt-6.1-sol', token_name: 'Fixture key', quota: 240,
          prompt_tokens: 100, completion_tokens: 50, use_time: 3, channel: 12 },
        { id: 2, created_at: 1764326500, type: 5, model_name: 'input-output-model', token_name: 'Fixture key', quota: 120,
          input_tokens: 20, output_tokens: 10, use_time: 1, channel: 13 }
      ],
      page: 1,
      page_size: 20,
      total: 2
    }));
  }
  if (path === '/api/log/self/stat') {
    return route.fulfill(envelope({
      quota: 750000,
      requests: 5,
      tokens: 3000,
      rpm: 1,
      tpm: 50
    }));
  }
  if (path === '/api/data/self') {
    return route.fulfill(envelope([
      { id: 1, created_at: 1764326400, model_name: 'gpt-6.1-sol', token_id: 7, token_used: 1000, count: 3, quota: 500000 },
      { id: 2, created_at: 1764326400, model_name: 'conditional-model', token_id: 7, token_used: 2000, count: 2, quota: 250000 }
    ]));
  }
  if (path === '/api/user/aff') return route.fulfill(envelope('FIXTURE'));
  if (path === '/api/user/topup/info') {
    return route.fulfill(envelope({
      enable_online_topup: true,
      enable_redemption: true,
      pay_methods: [
        { name: 'Alipay', type: 'alipay', min_topup: '1' },
        { name: 'WeChat Pay', type: 'wxpay', min_topup: '1' }
      ],
      min_topup: 1,
      amount_options: [10, 30, 100],
      discount: { 10: 0.95, 100: 0.9 },
      topup_link: ''
    }));
  }
  if (path === '/api/user/amount') return route.fulfill(raw({ message: 'success', data: '9.50' }));
  if (path === '/api/user/pay') {
    return route.fulfill(raw({
      message: 'success',
      url: 'https://pay.example.test/checkout',
      data: {
        pid: '1000',
        out_trade_no: 'FIXTURE-ORDER',
        name: 'Fixture topup',
        money: '9.50',
        type: 'alipay',
        sign: 'fixture-signature',
        sign_type: 'MD5'
      }
    }));
  }
  if (path === '/api/user/topup/self') {
    return route.fulfill(envelope({ items: [], page: 1, page_size: 20, total: 0 }));
  }
  if (path === '/api/user/auth/logout') return route.fulfill(envelope({}));
  if (path === '/v1/chat/completions' && request.method() === 'POST') {
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"choices":[{"delta":{"content":"fixture stream"}}]}\n\ndata: [DONE]\n\n'
    });
  }
  return route.fulfill(raw({ success: false, message: 'Unexpected fixture route: ' + path }, 404));
});

async function evaluate(script, argument) {
  return page.evaluate(script, argument);
}

async function acceptLoginAgreement() {
  await evaluate(async () => {
    const agreement = await Api.loginAgreement();
    Api.acceptLoginAgreement(agreement);
  });
}

try {
  await page.goto(base);
  await page.waitForFunction(() => !!window.Api && !!window.Api.AUTH);

  const settings = await evaluate(() => Api.settings());
  assert.equal(settings.system_name, 'BearLab AI');
  assert.equal(settings.quota_display_type, 'CNY');
  assert.equal(settings.quota_per_unit, 500000);
  assert.equal(settings.announcements.length, 1);

  await acceptLoginAgreement();
  loginMode = 'password';
  const login = await evaluate(() => Api.login('fixture@example.test', 'fixture-password', null, false));
  assert.equal(login.data.access_token, 'fixture-access');
  assert.equal(await evaluate(() => Api.AUTH.sessionSid()), 'fixture-session');

  const loginRequest = requests.find(item => item.path === '/api/user/login');
  assert.ok(loginRequest);
  assert.equal(loginRequest.method, 'POST');
  assert.deepEqual(loginRequest.body, { username: 'fixture@example.test', password: 'fixture-password' });
  assert.equal(loginRequest.headers['x-user-ui-request'], '1');
  assert.equal(loginRequest.headers.authorization, undefined);

  loginMode = 'two-factor';
  await assert.rejects(
    () => evaluate(() => Api.login('fixture@example.test', 'fixture-password')),
    /该账号需要两步验证/
  );
  const twoFactor = await evaluate(async () => {
    try {
      await Api.login('fixture@example.test', 'fixture-password');
    } catch (error) {
      return {
        code: error.code,
        flow_token: error.verification && error.verification.flow_token
      };
    }
  });
  assert.equal(twoFactor.code, 'TWO_FACTOR_REQUIRED');
  assert.equal(twoFactor.flow_token, 'fixture-flow');
  assert.equal(await evaluate(() => Api.AUTH.sessionSid()), 'fixture-session');
  const completed = await evaluate(() => Api.login2fa({
    flow_token: 'fixture-flow',
    code: '123456',
    username: 'fixture@example.test',
    email: 'fixture@example.test'
  }));
  assert.equal(completed.data.access_token, 'fixture-2fa-access');
  const twoFactorRequest = requests.find(item => item.path === '/api/user/login/2fa');
  assert.deepEqual(twoFactorRequest.body, { flow_token: 'fixture-flow', method: '2fa', code: '123456' });

  const profile = await evaluate(() => Api.me());
  assert.equal(profile.id, 42);
  const meRequest = requests.filter(item => item.path === '/api/user/self').at(-1);
  assert.equal(meRequest.headers.authorization, 'Bearer fixture-2fa-access');

  refreshShouldFail = false;
  const refreshed = await evaluate(async () => {
    const response = await fetch('/__proxy/bearlab/api/user/auth/refresh', {
      method: 'POST',
      headers: { 'X-Bearlab-Preview': '1', 'X-Auth-Session': Api.AUTH.sessionSid() }
    });
    return { status: response.status, session: Api.AUTH.sessionSid() };
  });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.session, 'fixture-2fa-session');
  const refreshRequest = requests.find(item => item.path === '/api/user/auth/refresh');
  assert.equal(refreshRequest.method, 'POST');
  assert.equal(refreshRequest.headers['x-auth-session'], 'fixture-2fa-session');

  loginMode = 'password';
  await evaluate(() => Api.login('fixture@example.test', 'fixture-password'));
  const groupResult = await evaluate(() => Api.groups());
  assert.equal(groupResult.auto.ratio, 'auto');
  assert.equal(groupResult.default.ratio, 1);

  const plaza = await evaluate(() => Api.plaza(true));
  const tokenModel = plaza.models.find(item => item.name === 'gpt-6.1-sol');
  const conditionalModel = plaza.models.find(item => item.name === 'conditional-model');
  const imageModel = plaza.models.find(item => item.name === '[Fixture]image-pro');
  assert.ok(tokenModel && conditionalModel && imageModel);
  assert.equal(tokenModel.mode, 'token');
  assert.equal(tokenModel.expression_pricing.input, 2);
  assert.equal(tokenModel.expression_pricing.output, 10);
  assert.equal(tokenModel.dynamic_billing, false);
  assert.equal(conditionalModel.dynamic_billing, true);
  assert.equal(conditionalModel.mode, 'token');
  assert.equal(imageModel.mode, 'image');
  assert.equal(imageModel.dynamic_billing, false);
  assert.equal(imageModel.model_price, 0.00008);
  assert.equal(tokenModel.availability, 99.5);
  const pricingRequest = requests.filter(item => item.path === '/api/pricing').at(-1);
  assert.equal(pricingRequest.query.include_ratio, '1');
  assert.equal(pricingRequest.headers.authorization, undefined);

  const keysStart = requests.length;
  const keys = await evaluate(() => Api.keys(1, 20));
  assert.equal(keys.total, 1);
  assert.equal(keys.items[0].id, 7);
  assert.match(keys.items[0].key, /\*{4}/);
  const keyRequest = requests.slice(keysStart).find(item =>
    item.path === '/api/token/' && item.query.page_size === '20');
  assert.ok(keyRequest);
  assert.equal(keyRequest.headers.authorization, 'Bearer fixture-access');
  assert.equal(keyRequest.query.p, '1');
  assert.equal(keyRequest.query.page_size, '20');

  const reveal = await evaluate(() => Api.keyReveal(7));
  assert.equal(reveal, 'sk-fixture-complete-key-1234567890');
  const revealRequest = requests.find(item => item.path === '/api/token/7/key');
  assert.equal(revealRequest.method, 'POST');

  const logs = await evaluate(() => Api.usageLogs({ page: 1, page_size: 20 }));
  assert.equal(logs.items.length, 2);
  assert.equal(logs.items[0].input_tokens, 100);
  assert.equal(logs.items[0].output_tokens, 50);
  assert.equal(logs.items[1].input_tokens, 20);
  assert.equal(logs.items[1].output_tokens, 10);
  const logRequest = requests.filter(item => item.path === '/api/log/self').at(-1);
  assert.equal(logRequest.query.p, '1');
  assert.equal(logRequest.query.page_size, '20');

  const stats = await evaluate(() => Api.usageStats({ api_key_id: 7, period: 'today' }));
  assert.equal(stats.total_requests, 5);
  assert.equal(stats.total_tokens, 3000);
  assert.equal(stats.total_actual_cost, 1.5);
  assert.equal(await evaluate(() => Api.formatQuota(750000)), '¥1.50');
  const dataRequest = requests.filter(item => item.path === '/api/data/self').at(-1);
  assert.ok(dataRequest);
  assert.ok(Number(dataRequest.query.start_timestamp) > 0);
  assert.ok(Number(dataRequest.query.end_timestamp) >= Number(dataRequest.query.start_timestamp));

  const affiliate = await evaluate(() => Api.aff());
  assert.equal(affiliate.code, 'FIXTURE');
  assert.equal(affiliate.count, 0);

  const paymentInfo = await evaluate(() => Api.paymentInfo());
  assert.equal(paymentInfo.enable_online_topup, true);
  assert.equal(paymentInfo.pay_methods[0].type, 'alipay');
  const amount = await evaluate(() => Api.paymentAmount(10));
  assert.equal(amount, '9.50');
  const payment = await evaluate(() => Api.createPayment({ amount: 10, payment_method: 'alipay' }));
  assert.equal(payment.url, 'https://pay.example.test/checkout');
  assert.equal(payment.data.money, '9.50');
  const paymentRequest = requests.find(item => item.path === '/api/user/pay');
  assert.deepEqual(paymentRequest.body, { amount: 10, payment_method: 'alipay' });

  const streamStart = requests.length;
  const streamed = await evaluate(() => new Promise(resolve => {
    let text = '';
    Api.chatStream(
      { model: 'gpt-6.1-sol', messages: [{ role: 'user', content: 'fixture' }], stream: true },
      'fixture-user-key',
      {
        onEvent: value => {
          text += value?.choices?.[0]?.delta?.content || '';
        },
        onDone: () => resolve(text),
        onError: error => resolve('ERROR: ' + error)
      }
    );
  }));
  assert.equal(streamed, 'fixture stream');
  const streamRequest = requests.slice(streamStart).find(item => item.path === '/v1/chat/completions');
  assert.ok(streamRequest);
  assert.equal(streamRequest.headers['x-bearlab-preview'], '1');
  assert.equal(streamRequest.headers.authorization, 'Bearer fixture-user-key');

  await page.evaluate(() => {
    window.__fixtureSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      window.__fixturePaymentForm = {
        method: this.method,
        action: this.action,
        fields: Object.fromEntries(new FormData(this))
      };
    };
  });
  assert.equal(await evaluate(order => Api.paymentForm(order), {
    url: payment.url,
    data: payment.data
  }), true);
  const submittedForm = await page.evaluate(() => window.__fixturePaymentForm);
  assert.equal(submittedForm.method, 'post');
  assert.equal(submittedForm.action, 'https://pay.example.test/checkout');
  assert.equal(submittedForm.fields.type, 'alipay');
  assert.equal(submittedForm.fields.money, '9.50');
  const checkoutClosed = await evaluate(() => new Promise(resolve => {
    window.addEventListener('pp:payment-closed', () => resolve(true), { once: true });
    window.dispatchEvent(new CustomEvent('pp:payment-closed'));
  }));
  assert.equal(checkoutClosed, true);

  await evaluate(() => {
    Api.AUTH.commitSystemToken('nap_fixtureToken1234567890abcdef', {
      id: 42,
      email: 'fixture@example.test',
      username: 'fixture'
    });
  });
  await evaluate(() => Api.me());
  const systemRequest = requests.filter(item => item.path === '/api/user/self').at(-1);
  assert.equal(systemRequest.headers.authorization, 'Bearer nap_fixtureToken1234567890abcdef');
  assert.equal(systemRequest.headers['new-api-user'], '42');

  const markup = await evaluate(() => document.documentElement.outerHTML);
  assert.doesNotMatch(markup, /\bPp API\b/i);
  assert.deepEqual(errors, []);

  console.log('BearLab contract: settings, auth, groups, pricing, keys, logs, usage, affiliate, browser SSE, payments and system token passed');
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
