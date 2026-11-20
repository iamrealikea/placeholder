const { test, expect } = require('@playwright/test');

const ROUTES = ['/home', '/event', '/event?id=evt-1', '/booking?eventId=evt-1', '/support'];
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
          const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth
          }));
          expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
        }
      });
    }
  }

  test('mobile hamburger menu toggles open/closed and respects Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home', { waitUntil: 'networkidle' });

    const toggleBtn = page.locator('.nav-toggle-btn');
    const navLinks = page.locator('.nav-links');

    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(navLinks).toBeHidden();

    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.navbar')).toHaveClass(/is-menu-open/);
    await expect(navLinks).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(navLinks).toBeHidden();
  });

  test('booking summary bar is sticky at bottom on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/booking?eventId=evt-1', { waitUntil: 'networkidle' });

    const summaryStyles = await page.evaluate(() => {
      const el = document.querySelector('.booking-summary-bar');
      const cs = getComputedStyle(el);
      return { position: cs.position, bottom: cs.bottom };
    });

    expect(summaryStyles.position).toBe('sticky');
    expect(summaryStyles.bottom).toBe('0px');
  });

  test('home renders cleanly without horizontal overflow at 320px width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/home', { waitUntil: 'networkidle' });

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
  });
});
