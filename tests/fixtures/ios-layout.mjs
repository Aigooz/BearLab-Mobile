export const longModel = 'claude-sonnet-4-6-thinking-20261118-long-context';
export const secondModel = 'gpt-6.1-sol-ultra-long-context-fixture';
export const thirdModel = 'deepseek-v4.1-flash-long-context-fixture';
export const imageModel = '[BearLab]image-generation-long-route';
export const longGroup = 'Codex Pro【不降智】与 Claude 全系长名称测试分组';
export const secondGroup = 'DeepSeek 无限制日卡与超长名称订阅测试分组';
export const user = {
  id: 19,
  username: 'fixture-user',
  display_name: '小屏幕与长名称排版检查账号',
  email: 'long-account-name-for-layout@example.test',
  quota: 123456789,
  used_quota: 98765432,
  request_count: 123456,
  aff_code: 'BEARLAB-LAYOUT',
  role: 'user',
  concurrency: 999,
  created_at: 1767226150
};

const nowSeconds = Math.floor(Date.now() / 1000);
const daySeconds = Math.floor(new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000);

export const groups = {
  'Codex Pro': {
    ratio: 0.12,
    desc: 'GPT / Claude 全系列，长分组名称和说明在小屏中也应完整分行。'
  },
  [longGroup]: {
    ratio: 'auto',
    desc: '按当前可用渠道动态选择。'
  },
  [secondGroup]: {
    ratio: 1,
    desc: '日卡与订阅权益。'
  }
};

export const pricing = {
  success: true,
  pricing_version: 'layout-pricing-v1',
  availability: {
    groups: {
      'Codex Pro': { [longModel]: 99.91, [secondModel]: 96.2, [thirdModel]: 99.2 },
      [longGroup]: { [longModel]: 99.5, [imageModel]: 100 },
      [secondGroup]: { [secondModel]: 97.5 }
    }
  },
  group_ratio: { 'Codex Pro': 0.12, [longGroup]: 'auto', [secondGroup]: 1 },
  usable_group: { 'Codex Pro': 'Codex Pro', [longGroup]: '自动选择', [secondGroup]: secondGroup },
  vendors: { 1: { id: 1, name: 'Fixture vendor' } },
  data: [
    {
      model_name: longModel,
      enable_groups: ['Codex Pro', longGroup],
      context_length: 400000,
      billing_expr: 'tier("base", p * 2 + c * 10 + cr * 0.1 + cc * 2.5)',
      supported_endpoint_types: ['openai', 'anthropic'],
      pricing_version: 'layout-pricing-v1'
    },
    {
      model_name: secondModel,
      enable_groups: ['Codex Pro', secondGroup],
      context_length: 1000000,
      billing_expr: 'len <= 272000 ? tier("base", p * 2 + c * 10) : tier("long", p * 4 + c * 20)',
      supported_endpoint_types: ['openai'],
      pricing_version: 'layout-pricing-v1'
    },
    {
      model_name: thirdModel,
      enable_groups: ['Codex Pro'],
      context_length: 1000000,
      billing_expr: 'tier("base", p * 0.8 + c * 4 + cr * 0.08 + cc * 0.8)',
      supported_endpoint_types: ['openai', 'anthropic'],
      pricing_version: 'layout-pricing-v1'
    },
    {
      model_name: imageModel,
      enable_groups: [longGroup],
      quota_type: 1,
      model_price: 0.00008,
      billing_expr: 'tier("base", fixed(0.00008))',
      supported_endpoint_types: ['image'],
      pricing_version: 'layout-pricing-v1'
    }
  ]
};

export const keys = [
  {
    id: 7,
    name: '这是用于检查对话选择器的非常长的令牌名称',
    key: 'sk-layout-test-not-a-real-key-12345678',
    status: 1,
    remain_quota: 5000000,
    unlimited_quota: false,
    group: 'Codex Pro',
    expired_time: Math.floor(Date.now() / 1000) + 86400 * 30
  },
  {
    id: 8,
    name: '另一个已经停用但名称也很长的令牌',
    key: 'sk-layout-disabled-not-a-real-key',
    status: 2,
    remain_quota: 0,
    unlimited_quota: true,
    group: secondGroup,
    expired_time: -1
  }
];

export const logs = [
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
    group: 'Codex Pro',
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
    group: secondGroup,
    request_id: 'fixture-request-with-a-very-long-identifier-102'
  }
];

export const usage = [
  { id: 1, model_name: longModel, created_at: daySeconds, token_id: 7, channel_id: 12, token_used: 4567890, count: 1234, quota: 750000, use_group: 'Codex Pro' },
  { id: 2, model_name: secondModel, created_at: daySeconds, token_id: 7, channel_id: 18, token_used: 1234567, count: 456, quota: 250000, use_group: 'Codex Pro' },
  { id: 3, model_name: longModel, created_at: daySeconds - 86400, token_id: 8, channel_id: 12, token_used: 2222222, count: 321, quota: 500000, use_group: secondGroup }
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
const notFound = path => raw({ success: false, message: 'Unexpected layout fixture route: ' + path });

export async function mockIOSLayout(page) {
  await page.route('**/__proxy/bearlab/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/__proxy/bearlab', '');
    if (request.method() === 'POST' && path === '/v1/chat/completions') {
      const events = [
        { choices: [{ delta: { content: '模拟回答：一加一等于二。' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12345, completion_tokens: 6789, prompt_tokens_details: { cached_tokens: 1024 }, cache_creation_input_tokens: 256 } }
      ];
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') + 'data: [DONE]\n\n' });
    }
    if (request.method() !== 'GET') {
      return route.fulfill(raw({ success: false, message: 'Layout fixtures are read-only: ' + path }));
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
          title: '模型恢复完毕与调用补偿发放通知',
          content: '<p style="color:#e83e8c;font-size:15px;line-height:1.9">各分组模型已<strong>逐步恢复</strong>，全部正常服务。</p><h3>当前状态与补偿</h3><p>平台公告中的粗体、颜色和长段落应保持正常显示。</p>',
          publishDate: nowSeconds - 3600
        }]
      }));
    }
    if (path === '/api/user/self') return route.fulfill(ok(user));
    if (path === '/api/user/self/groups') return route.fulfill(ok(groups));
    if (path === '/api/user/models') return route.fulfill(ok({
      'Codex Pro': [longModel, secondModel, thirdModel],
      [longGroup]: [longModel, imageModel],
      [secondGroup]: [secondModel]
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
    if (path === '/api/user/pay') {
      return route.fulfill(raw({ message: 'success', url: 'https://pay.example.test/checkout', data: { order: 'fixture' } }));
    }
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
    if (path === '/v1/models') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [longModel, secondModel, thirdModel].map(id => ({ id })) }) });
    return route.fulfill(notFound(path));
  });
}
