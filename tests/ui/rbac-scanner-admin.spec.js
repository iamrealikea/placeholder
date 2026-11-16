const { test, expect } = require('@playwright/test');
const { loginViaModal, dismissPopup } = require('./ui-helpers');

test.describe('RBAC UI Guards, Staff Gate Scanner & Admin Operations Portal', () => {
  let freshTicketCode;

  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { email: 'user@ticket.com', password: 'password123' }
    });
    const { token } = await loginRes.json();
    const headers = { Authorization: `Bearer ${token}` };

    const seatsRes = await request.get('/api/bookings/events/evt-2/rounds/rnd-2a/seats');
    const { seats } = await seatsRes.json();
    const avail = seats.find((s) => s.status === 'AVAILABLE');

    const holdRes = await request.post('/api/bookings/hold', {
      headers,
      data: { eventId: 'evt-2', roundId: 'rnd-2a', seatIds: [avail.id] }
    });
    const { booking } = await holdRes.json();

    const payRes = await request.post(`/api/bookings/${booking.id}/pay`, {
      headers,
      data: { paymentMethod: 'PROMPTPAY', ticketHolderNames: ['RBAC E2E Tester'] }
    });
    const { tickets } = await payRes.json();
    freshTicketCode = tickets[0].ticketCode;

    await request.post('/api/support', {
      headers,
      data: { subject: 'Admin Reply Playwright Check', category: 'General Inquiry', message: 'Needs reply.' }
    });
  });

  test('customer is blocked by UI access guards on /scanner and /admin', async ({ page }) => {
    await page.goto('/home');
    await loginViaModal(page, 'user@ticket.com', 'password123');
    await expect(page.locator('#authModal')).toBeHidden();

    await page.goto('/scanner');
    await expect(page.locator('#scannerGuard')).toBeVisible();
    await expect(page.locator('#scannerContent')).toBeHidden();

    await page.goto('/admin');
    await expect(page.locator('#admin-guard')).toBeVisible();
    await expect(page.locator('#admin-content')).toBeHidden();
  });

  test('staff validates ticket once on /scanner and sees duplicate scan fraud alert on reuse', async ({ page }) => {
    await page.goto('/home');
    await loginViaModal(page, 'staff@ticket.com', 'staff123');
    await expect(page.locator('#authModal')).toBeHidden();

    await page.goto('/scanner');
    await expect(page.locator('#scannerContent')).toBeVisible();

    await page.locator('#manualTicketCode').fill(freshTicketCode);
    await page.locator('#validateCodeBtn').click();
    await expect(page.locator('#scanResultArea')).toContainText('ADMISSION GRANTED');
    await expect(page.locator('#scanResultArea')).toContainText('CHECKED_IN');

    // Second scan of the same ticket triggers FR-31 fraud alert (input is cleared after valid scan)
    await page.locator('#manualTicketCode').fill(freshTicketCode);
    await page.locator('#validateCodeBtn').click();
    await expect(page.locator('#scanResultArea .fraud-warning-alert')).toBeVisible();
    await expect(page.locator('#scanResultArea')).toContainText('DUPLICATE SCAN DETECTED');
  });

  test('admin inspects KPIs, blocks self-demotion in Roles tab, and resolves support inquiry', async ({ page }) => {
    await page.goto('/home');
    await loginViaModal(page, 'admin@ticket.com', 'admin123');
    await expect(page.locator('#authModal')).toBeHidden();

    await page.goto('/admin');
    await expect(page.locator('#admin-content')).toBeVisible();
    await expect(page.locator('#kpi-revenue')).not.toHaveText('0 THB');

    // Roles tab: anti-self-demotion guard on current admin user
    await page.locator('#portal-tabs-nav [data-tab="roles"]').click();
    const selfSelect = page.locator('select.user-role-select[data-user-id="usr-admin-1"]');
    await expect(selfSelect).toBeVisible();
    await selfSelect.selectOption('customer');
    await expect(page.locator('dialog.th-popup-dialog')).toContainText(/Cannot demote your own/i);
    await dismissPopup(page);
    await expect(selfSelect).toHaveValue('admin');

    // Support & Backups tab: reply & resolve customer inquiry
    await page.locator('#portal-tabs-nav [data-tab="support"]').click();
    const replyBtn = page.locator('#admin-support-table-body .btn-reply-support').first();
    await expect(replyBtn).toBeVisible();
    await replyBtn.click();

    await page.locator('#replyText').fill('Resolved via Playwright E2E');
    await page.locator('#sendReplyBtn').click();
    await dismissPopup(page);
    await expect(page.locator('#admin-support-table-body')).toContainText('RESOLVED');
  });
});
