import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cutCrops, launchBrowser, loadPlaywright } from '../look.mjs';

// Opt in with UI_POLICE_BROWSER_TESTS=1 and an installed Chromium browser.
// Ordinary unit runs stay offline.
test('real Playwright captures document crops below and beside the viewport', {
  skip: process.env.UI_POLICE_BROWSER_TESTS !== '1',
}, async () => {
  const browser = await launchBrowser(loadPlaywright(), { url: 'http://localhost:1', browserSandbox: process.env.UI_POLICE_BROWSER_TEST_NO_SANDBOX !== '1' });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-police-clip-browser-'));
  try {
    fs.mkdirSync(path.join(out, 'crops'));
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<style>body{margin:0;height:2600px}#detail{position:absolute;top:1600px;width:390px;height:420px;background:green}</style><section id="detail">Below the viewport</section>');
    const crops = await cutCrops(page, out, '390-dark', {
      viewport: { w: 390, h: 844 }, pageHeight: 2600, hard: [],
    }, '#detail');
    const detail = crops.find((crop) => crop.label === 'detail');
    assert.ok(detail, 'the requested detail must be captured');
    assert.equal(detail.y, 1600);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'document cropping must preserve scroll position');
    const png = fs.readFileSync(path.join(out, detail.file));
    assert.equal(png.readUInt32BE(16), 390);
    assert.equal(png.readUInt32BE(20), 420);
    await page.setContent('<style>body{margin:0;width:1000px;height:2600px}#detail{position:absolute;left:450px;top:1600px;width:390px;height:420px;background:green}</style><section id="detail">Beside and below the viewport</section>');
    await page.evaluate(() => window.scrollTo(300, 0));
    assert.equal(await page.evaluate(() => window.scrollX), 300);

    const horizontalCrops = await cutCrops(page, out, '390-horizontal', {
      viewport: { w: 390, h: 844 }, pageHeight: 2600, hard: [],
    }, '#detail');
    const horizontalDetail = horizontalCrops.find((crop) => crop.label === 'detail');
    assert.equal(horizontalDetail.x, 450, 'the crop must follow the target in document space');
    assert.equal(horizontalDetail.y, 1600);
    assert.equal(await page.evaluate(() => window.scrollX), 300);
    for (const [name, html, pageHeight] of [
      ['stale-document', '<style>body{margin:0;height:2600px}#detail{position:absolute;top:1600px;width:390px;height:420px;background:green}</style><section id="detail">Outside recorded document</section>', 844],
      ['inner-scroller', '<style>body{margin:0}main{height:200px;overflow:auto}#detail{margin-top:500px;height:120px;background:green}</style><main><section id="detail">Clipped by inner scroller</section></main>', 844],
      ['partially-clipped', '<style>body{margin:0}main{height:200px;overflow:hidden}#detail{margin-top:150px;height:120px;background:green}</style><main><section id="detail">Partially clipped</section></main>', 844],
      ['transparent', '<style>#detail{opacity:0;height:120px}</style><section id="detail">Invisible</section>', 844],
      ['missing', '<main>No target</main>', 844],
    ]) {
      await page.setContent(html);
      const scrollBefore = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
      await assert.rejects(() => cutCrops(page, out, name, {
        viewport: { w: 390, h: 844 }, pageHeight, hard: [],
      }, '#detail'), /detail target.*(missing|hidden|clipped|outside|uncapturable)/i, name);
      assert.deepEqual(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })), scrollBefore);
    }

    await page.setContent('<style>body{margin:0}main{height:200px;overflow:auto}#detail{margin-top:500px;height:120px;background:green}</style><main><section id="detail">Visible after inner scrolling</section></main>');
    await page.locator('main').evaluate((el) => { el.scrollTop = 500; });
    const visibleCrops = await cutCrops(page, out, 'inner-visible', {
      viewport: { w: 390, h: 844 }, pageHeight: 844, hard: [],
    }, '#detail');
    assert.equal(visibleCrops.find((crop) => crop.label === 'detail').height, 120);
    assert.equal(await page.locator('main').evaluate((el) => el.scrollTop), 420);

    await page.setContent('<style>body{margin:0;width:1000px;height:2600px}#detail{position:absolute;top:1600px;width:1000px;height:420px;background:green}</style><section id="detail">Full width target</section>');
    const wideCrops = await cutCrops(page, out, 'wide-detail', {
      viewport: { w: 390, h: 844 }, pageHeight: 2600, hard: [],
    }, '#detail');
    const wideDetail = wideCrops.find((crop) => crop.label === 'detail');
    assert.equal(wideDetail.width, 1000, 'detail evidence must not silently discard the right side');
    const widePng = fs.readFileSync(path.join(out, wideDetail.file));
    assert.equal(widePng.readUInt32BE(16), 1000);
    assert.equal(widePng.readUInt32BE(20), 420);

  } finally {
    await browser.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
});
