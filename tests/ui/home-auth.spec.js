const { test, expect } = require('@playwright/test');
const { loginViaModal } = require('./ui-helpers');

test.describe('Home Discovery, Design Tokens & Auth Modal', () => {
  test('enforces TicketHub brand palette (Oat Milk, Monday Blue, Candy Apple Red) and Lato font', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('#popularContainer .card-popular').first()).toBeVisible();

    const styles = await page.evaluate(() => {
      const bodyCs = getComputedStyle(document.body);
      const brandCs = getComputedStyle(document.querySelector('.brand-pill'));
      const ctaCs = getComputedStyle(document.querySelector('#heroBanner .btn-pill-red'));
      return {
        fontFamily: bodyCs.fontFamily,
        bodyBg: bodyCs.backgroundColor,
        brandBg: brandCs.backgroundColor,
        ctaBg: ctaCs.backgroundColor
      };
    });

    expect(styles.fontFamily).toContain('Lato');
    expect(styles.bodyBg).toBe('rgb(253, 249, 242)');    // #FDF9F2 Oat Milk
    expect(styles.brandBg).toBe('rgb(29, 86, 207)');    // #1D56CF Monday Blue
    expect(styles.ctaBg).toBe('rgb(255, 8, 0)');        // #FF0800 Candy Apple Red
  });

  test('filters events by search, province, sort and resets all filters cleanly', async ({ page }) => {
    await page.goto('/home');
    const cards = page.locator('#popularContainer .card-popular, #soonContainer .card-soon, #soonContainer .card-home');
    await expect(cards.first()).toBeVisible();
    const initialCount = await cards.count();

    await page.locator('#searchInput').fill('Forza');
    await page.locator('#provinceFilter').selectOption('Nonthaburi');
    await page.locator('#sortFilter').selectOption('price_asc');
    await expect(page.locator('#popularContainer')).toContainText('Forza Horizon');

    await page.locator('#resetFilters').click();
    await expect(page.locator('#searchInput')).toHaveValue('');
    await expect(page.locator('#provinceFilter')).toHaveValue('');
    await expect(cards).toHaveCount(initialCount);
  });

  test('rejects wrong password in Auth modal and logs customer in cleanly without leaking passwordHash', async ({ page }) => {
    await page.goto('/home');

    await loginViaModal(page, 'user@ticket.com', 'wrong-password');
    const alertBox = page.locator('#authAlert');
    await expect(alertBox).toBeVisible();
    await expect(alertBox).toContainText(/invalid/i);

    await loginViaModal(page, 'user@ticket.com', 'password123');
    await expect(page.locator('#authModal')).toBeHidden();
    await expect(page.locator('.avatar-pill')).toHaveText('CH');

    const authState = await page.evaluate(() => ({
      token: localStorage.getItem('tickethub_token') || '',
      allStorage: JSON.stringify(localStorage),
      userEmail: window.Auth?.currentUser?.email || '',
      hasPasswordHash: JSON.stringify(window.Auth?.currentUser || {}).includes('passwordHash')
    }));
    expect(authState.token.length).toBeGreaterThan(10);
    expect(authState.userEmail).toBe('user@ticket.com');
    expect(authState.allStorage).not.toContain('passwordHash');
    expect(authState.hasPasswordHash).toBe(false);
  });
});
