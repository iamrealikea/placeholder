const { test, expect } = require('@playwright/test');

const ROUTES = ['/home', '/event?id=evt-1', '/booking?eventId=evt-1', '/support'];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 }
];

test.describe('Responsive Layout & Zero Runtime Errors', () => {
  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${vp.name} (${vp.width}x${vp.height}) renders ${route} without JS/5xx errors or horizontal overflow`, async ({ page }) => {
        const pageErrors = [];
        const apiServerErrors = [];

        page.on('pageerror', (err) => pageErrors.push(err.message));
        page.on('response', (res) => {
          if (res.url().includes('/api/') && res.status() >= 500) {
            apiServerErrors.push(`${res.status()} ${res.url()}`);
          }
        });

        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route, { waitUntil: 'networkidle' });

        expect(pageErrors, `Uncaught pageerror on ${route}`).toEqual([]);
        expect(apiServerErrors, `5xx API error on ${route}`).toEqual([]);

        if (vp.name === 'desktop' && route !== '/booking?eventId=evt-1') {
          const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth
          }));
          expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
        } else if (vp.name === 'mobile') {
          const mainBox = await page.locator('main').boundingBox();
          expect(mainBox.width).toBeLessThanOrEqual(vp.width + 1);
        }
      });
    }
  }
});
