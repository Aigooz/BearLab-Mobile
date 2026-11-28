import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createPreviewServer, listenPreview } from '../preview.mjs';
import { mockBearLabMobileLayout, user } from './fixtures/bearlab-mobile-layout.mjs';

const server = createPreviewServer();
await listenPreview(server);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const screenshotDir = path.resolve(process.env.PP_TEST_SCREENSHOTS || '.research/mobile-layout');
await mkdir(screenshotDir, { recursive: true });
const errors = [];
const report = [];

async function inspect(page, name) {
  await page.waitForTimeout(150);
  const result = await page.evaluate(() => {
    const visible = node => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && !node.closest('[hidden]') &&
        getComputedStyle(node).visibility !== 'hidden';
    };
    const label = node => node.getAttribute('aria-label') || String(node.className || node.tagName).slice(0, 120);
    const clipping = [];
    for (const node of document.querySelectorAll('#view *, .sheet *, .scrim *')) {
      if (!visible(node) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
        node.matches('input,textarea,select,svg,path')) continue;
      const style = getComputedStyle(node);
      if (style.display === 'inline' || style.overflowX !== 'visible' || node.clientWidth < 2) continue;
      if (node.scrollWidth > node.clientWidth + 2) {
        clipping.push({ node: label(node), scroll: node.scrollWidth, width: node.clientWidth });
      }
    }
    const view = document.querySelector('#view');
    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewWidth: view.clientWidth,
      viewScrollWidth: view.scrollWidth,
      clipping,
      text: document.querySelector('#view').innerText.slice(0, 1200)
    };
  });
  report.push({ name, ...result });
  await page.screenshot({
    path: path.join(screenshotDir, `${name}.png`),
    animations: 'disabled',
    fullPage: true
  });
  assert.equal(result.documentWidth, result.width, `${name}: document overflow`);
  assert.ok(result.viewScrollWidth <= result.viewWidth + 1, `${name}: view overflow`);
  assert.deepEqual(result.clipping, [], `${name}: clipped content`);
  return result;
}

try {
  for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      timezoneId: 'Asia/Shanghai',
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${viewport.width}: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`${viewport.width}: console: ${message.text()}`);
    });
    await mockBearLabMobileLayout(page);
    await page.goto(base + '/#/login');
    await page.getByPlaceholder('邮箱或用户名').waitFor();
    await inspect(page, `${viewport.width}-login`);

    if (await page.getByRole('button', { name: '查看条款' }).count()) {
      await page.getByRole('button', { name: '查看条款' }).click();
      await page.getByRole('button', { name: '同意并继续' }).click();
    }
    await page.getByPlaceholder('邮箱或用户名').fill('layout-fixture@example.test');
    await page.getByPlaceholder('输入密码').fill('layout-fixture-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByText('账户余额').waitFor();
    await page.locator('.home-platform-feature').nth(2).waitFor();
    await page.getByText('平台用量', { exact: true }).waitFor();
    await page.getByText('模型广场', { exact: true }).waitFor();
    await page.getByText('渠道状态', { exact: true }).waitFor();
    assert.equal(await page.locator('.home-platform-feature').count(), 3);
    await page.waitForFunction(() => {
      const values = Array.from(
        document.querySelectorAll('.home-platform-usage-metric b'),
        node => node.textContent.trim()
      );
      return values.join('|') === '¥2.00|1,690|5.80M';
    });
    assert.match(await page.locator('.home-platform-usage').innerText(), /今日 Tokens/);
    const home = await inspect(page, `${viewport.width}-home`);
    assert.match(home.text, /平台总览/);
    const platformInViewport = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.home-platform-feature'));
      const visibleBottom = Math.min(
        window.innerHeight,
        document.querySelector('.tabbar').getBoundingClientRect().top
      );
      return cards.length === 3 && cards.every(card => card.getBoundingClientRect().bottom < visibleBottom);
    });
    assert.equal(platformInViewport, true, `${viewport.width}: platform features should fit above the tab bar`);

    await page.getByRole('button', { name: '查看平台用量' }).click();
    await page.getByText('用量分析').waitFor();
    assert.match(await page.locator('.appbar-title').innerText(), /仪表盘/);
    await page.evaluate(() => App.go('#/home', true));
    await page.getByText('平台总览').waitFor();
    await page.getByRole('button', { name: '进入模型广场' }).click();
    await page.locator('.plaza-group').first().waitFor();
    await page.evaluate(() => App.go('#/home', true));
    await page.getByText('平台总览').waitFor();
    await page.getByRole('button', { name: '查看渠道状态' }).click();
    await page.locator('.channel-item').first().waitFor();

    const routes = [
      ['plaza', '.plaza-group'],
      ['channel-status', '.channel-item'],
      ['keys', '.keycard'],
      ['usage', '.usage-summary'],
      ['purchase', '.payment-choice'],
      ['me', '.me-profile-card'],
      ['about', '.about-page, .page']
    ];
    for (const [route, selector] of routes) {
      await page.evaluate(route => App.go('#/' + route, true), route);
      await page.locator(selector).first().waitFor({ timeout: 30000 });
      const result = await inspect(page, `${viewport.width}-${route}`);
      if (route === 'plaza') {
        const collapsed = page.locator('.plaza-group-toggle[aria-expanded="false"]');
        for (let index = 0; index < await collapsed.count(); index++) {
          await collapsed.nth(index).click();
        }
        await page.locator('.plaza-model').first().waitFor();
        const plaza = await page.evaluate(() => ({
          models: Array.from(document.querySelectorAll('.plaza-model'), node => node.innerText),
          groups: Array.from(document.querySelectorAll('.plaza-group'), node => node.innerText)
        }));
        assert.ok(plaza.models.some(text => /官网定价/.test(text)), 'plaza: fixed-price model row');
        assert.ok(plaza.models.some(text => /分时\s*\/\s*分段/.test(text)), 'plaza: dynamic-pricing model row');
        assert.doesNotMatch(plaza.models.join('\n'), /¥0\.00008/);
        assert.match(plaza.groups.join('\n'), /自动/);
        assert.doesNotMatch(plaza.groups.join('\n'), /autox|自动x/i);
        await inspect(page, `${viewport.width}-plaza-expanded`);
      }
      if (route === 'channel-status') {
        const panel = await page.locator('.channel-page').innerText();
        assert.match(panel, /公开可用率/);
        assert.doesNotMatch(panel, /平均响应|最近探测记录/);
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  await assert.doesNotReject(async () => {});
  console.log(`BearLab mobile layout: ${report.length} screenshots passed at 320/390; output ${screenshotDir}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
