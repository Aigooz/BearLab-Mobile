export const user = {
  id: 42,
  username: 'fixture-user',
  display_name: 'BearLab 小屏排版检查账号',
  email: 'layout-fixture@example.test',
  quota: 123456789,
  used_quota: 98765432,
  request_count: 123456,
  aff_code: 'BEARLAB-LAYOUT',
  role: 'user',
  concurrency: 12,
  created_at: 1764326400
};

export const longGroup = 'Codex 与 Claude 全系长名称测试分组';
export const longModel = 'claude-sonnet-4-6-thinking-20261118-long-context';
const secondModel = 'gpt-6.1-sol-ultra-long-context-fixture';
const imageModel = '[BearLab]image-generation-long-route';
const nowSeconds = Math.floor(Date.now() / 1000);
const daySeconds = Math.floor(new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000);

export const groups = {
  default: { ratio: 1, desc: '标准分组，适合日常对话与通用任务。' },
  auto: { ratio: 'auto', desc: '根据可用性自动选择渠道。' }
};

export const pricing = {
  success: true,
  pricing_version: 'layout-pricing-v1',
  availability: {
    groups: {
      default: { [longModel]: 99.91, [secondModel]: 96.2 },
      auto: { [longModel]: 99.5, [imageModel]: 100 }
    }
  },
  group_ratio: { default: 1, auto: 'auto' },
  usable_group: { default: '标准分组', auto: '自动选择' },
  vendors: { 1: { id: 1, name: 'Fixture vendor' } },
  data: [
    {
      model_name: longModel,
      enable_groups: ['default', 'auto'],
      context_length: 400000,
      billing_expr: 'tier("base", p * 2 + c * 10 + cr * 0.1 + cc * 2.5)',
      supported_endpoint_types: ['openai', 'anthropic'],
      pricing_version: 'layout-pricing-v1'
    },
    {
      model_name: secondModel,
      enable_groups: ['default'],
      context_length: 1000000,
      billing_expr: 'len <= 272000 ? tier("base", p * 2 + c * 10) : tier("long", p * 4 + c * 20)',
      supported_endpoint_types: ['openai'],
      pricing_version: 'layout-pricing-v1'
    },
    {
      model_name: imageModel,
      enable_groups: ['auto'],
      quota_type: 1,
      model_price: 0.00008,
      billing_expr: 'tier("base", fixed(0.00008))',
      supported_endpoint_types: ['image'],
      pricing_version: 'layout-pricing-v1'
    }
  ]
};

const keys = [
  {
    id: 7,
    name: '用于小屏检查的超长令牌名称 · BearLab',
    key: 'sk-layout-fixture-masked-1234',
    status: 1,
    remain_quota: 5000000,
    unlimited_quota: false,
    group: 'default',
    expired_time: Math.floor(Date.now() / 1000) + 86400 * 30
  },
  {
    id: 8,
    name: '第二个停用令牌长名称',
    key: 'sk-layout-fixture-disabled-masked',
    status: 2,
    remain_quota: 0,
    unlimited_quota: true,
    group: 'auto',
    expired_time: -1
  }
];

const logs = [
  {
    id: 101,
    created_at: nowSeconds - 900,
    type: 2,
    model_name: longModel,
    token_name: keys[0].name,
    quota: 150000,
    prompt_tokens: 123456,
    completion_tokens: 23456,
    use_time: 4,
    is_stream: true,
    channel: 12,
    group: 'default',
    request_id: 'fixture-request-with-a-very-long-identifier-101'
  },
  {
    id: 102,
    created_at: nowSeconds - 1800,
    type: 5,
    model_name: secondModel,
    token_name: keys[0].name,
    quota: 75000,
    input_tokens: 6789,
    output_tokens: 1234,
    use_time: 31,
    channel: 18,
    group: 'default',
    request_id: 'fixture-request-with-a-very-long-identifier-102'
  }
];

const usage = [
  { id: 1, model_name: longModel, created_at: daySeconds, token_id: 7, channel_id: 12, token_used: 4567890, count: 1234, quota: 750000, use_group: 'default' },
  { id: 2, model_name: secondModel, created_at: daySeconds, token_id: 7, channel_id: 18, token_used: 1234567, count: 456, quota: 250000, use_group: 'default' }
];

const ok = data => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ success: true, code: 0, message: '', data })
});
const raw = body => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

export async function mockBearLabMobileLayout(page) {
  await page.route('**/__proxy/bearlab/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/__proxy/bearlab', '');
    if (request.method() !== 'GET' && path !== '/api/user/login' && path !== '/api/user/amount') {
      return route.fulfill(raw({ success: false, message: 'Layout fixtures are read-only' }));
    }
    if (path === '/api/status') {
      return route.fulfill(ok({
        system_name: 'BearLab AI',
        version: '1.38.0',
        quota_display_type: 'CNY',
        quota_per_unit: 500000,
        register_enabled: true,
        user_agreement_enabled: true,
        privacy_policy_enabled: true,
        announcements: [{
          id: 7,
          title: '平台维护完成与服务恢复通知',
          content: '<p>所有模型服务已经恢复。这是一段用于确认小屏长段落、<strong>粗体</strong>和公告内容不会溢出的模拟文字。</p>',
          publishDate: nowSeconds - 3600
        }]
      }));
    }
    if (path === '/api/user/login') return route.fulfill(ok({
      access_token: 'layout-access-fixture',
      refresh_token: 'layout-refresh-fixture',
      access_expires_at: 4102444800,
      session: { sid: 'layout-session-fixture' },
      user
    }));
    if (path === '/api/user/self') return route.fulfill(ok(user));
    if (path === '/api/user/groups' || path === '/api/user/self/groups') return route.fulfill(ok(groups));
    if (path === '/api/user/models') return route.fulfill(ok({
      default: [longModel, secondModel],
      auto: [longModel, imageModel]
    }));
    if (path === '/api/pricing') return route.fulfill(raw(pricing));
    if ((path === '/api/token' || path === '/api/token/') && request.method() === 'GET') {
      return route.fulfill(ok({ items: keys, page: 1, page_size: 100, total: keys.length }));
    }
    if (path === '/api/log/self') {
      return route.fulfill(ok({ items: logs, page: 1, page_size: 20, total: logs.length }));
    }
    if (path === '/api/log/self/stat') return route.fulfill(ok({ quota: 1000000, rpm: 12, tpm: 3456 }));
    if (path === '/api/data/self') return route.fulfill(ok(usage));
    if (path === '/api/user/topup/info') return route.fulfill(ok({
      enable_online_topup: true,
      enable_redemption: true,
      pay_methods: [
        { name: '支付宝', type: 'alipay', min_topup: '1' },
        { name: '微信支付', type: 'wxpay', min_topup: '1' }
      ],
      min_topup: 1,
      amount_options: [10, 30, 50, 100],
      discount: { 100: 0.95 },
      topup_link: ''
    }));
    if (path === '/api/user/amount') return route.fulfill(raw({ message: 'success', data: '9.50' }));
    if (path === '/api/user/topup/self') return route.fulfill(ok({
      items: [{
        id: 88,
        trade_no: 'FIXTURE-PAYMENT-LONG-ORDER-NUMBER',
        amount: 100,
        money: 95,
        payment_method: 'alipay',
        status: 'pending',
        created_at: nowSeconds - 600
      }],
      page: 1,
      page_size: 20,
      total: 1
    }));
    if (path === '/api/user/aff') return route.fulfill(ok('BEARLAB-LAYOUT'));
    return route.fulfill(raw({ success: false, message: 'Unexpected layout fixture route: ' + path }, 404));
  });
}
