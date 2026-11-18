'use strict';
const path = require('path');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
(async () => {
  for (const theme of ['light', 'dark']) {
    const h = await launch({ seedStorage: { 'atlas-theme': theme } });
    await h.page.goto(h.url);
    await h.page.waitForFunction(() => document.querySelectorAll('#menu-screen .level').length > 5, null, { timeout: 60000 });
    await h.page.waitForTimeout(600);
    for (let i = 0; i < 9; i++) await h.page.keyboard.press('Tab');
    await h.page.screenshot({ path: path.join(S, 'shots/app/polish/focus-home-a-' + theme + '.png'), clip: { x: 0, y: 0, width: 1280, height: 400 } });
    for (let i = 0; i < 9; i++) await h.page.keyboard.press('Tab');
    await h.page.waitForTimeout(300);
    await h.page.screenshot({ path: path.join(S, 'shots/app/polish/focus-home-b-' + theme + '.png') });
    console.log(theme, await h.page.evaluate(() => (document.activeElement.className || '') + ' ' + (document.activeElement.textContent || '').slice(0, 30)));
    await h.close();
  }
})();
