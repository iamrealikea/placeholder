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

  test('admin creates event with full details and seat overrides and sees all saved data on edit (Issue #42)', async ({ page }) => {
    await page.goto('/home');
    await loginViaModal(page, 'admin@ticket.com', 'admin123');
    await expect(page.locator('#authModal')).toBeHidden();

    await page.goto('/admin-event.html?mode=create');
    await expect(page.locator('#event-form')).toBeVisible();
    await expect(page.locator('#event-category option')).not.toHaveCount(0);

    // Fill Event Details
    await page.locator('#event-title').fill('Issue 42 Persistence Concert');
    await page.locator('#event-category').selectOption('Festival');
    await page.locator('#event-venue').fill('Impact Exhibition Hall 5');
    await page.locator('#event-province').fill('Nonthaburi');
    await page.locator('#event-artist').fill('Neon Orchestra');
    await page.locator('#event-organizer').fill('LiveCo Asia');
    await page.locator('#event-status').selectOption('Coming Soon');
    await page.locator('#event-poster-url').fill('https://example.com/poster-42.jpg');
    await page.locator('#event-gallery').fill('https://example.com/gallery-1.jpg, https://example.com/gallery-2.jpg');
    await page.locator('#event-gate-time').fill('16:45');
    await page.locator('#event-sale-start').fill('2026-11-25T10:00');
    await page.locator('#event-sale-end').fill('2026-12-20T22:30');
    await page.locator('#event-description').fill('Detailed description for Issue 42 verification.');
    await page.locator('#event-featured').check();

    // Configure 2 Show Rounds with non-default times
    await page.locator('#rounds-list .round-date-input').first().fill('2026-12-24');
    await page.locator('#rounds-list .round-time-input').first().fill('20:15');
    await page.locator('#add-round-btn').click();
    await page.locator('#rounds-list .round-date-input').nth(1).fill('2026-12-25');
    await page.locator('#rounds-list .round-time-input').nth(1).fill('21:00');

    // Generate 3x4 matrix (12 seats) and set zone base price & color
    await page.locator('#matrix-rows').fill('3');
    await page.locator('#matrix-cols').fill('4');
    await page.locator('#matrix-generate-btn').click();
    await expect(page.locator('#canvas-total-seats')).toHaveText('12');

    await page.locator('#seat-price-input').fill('2400');
    await page.locator('#seat-color-input').fill('#0D9488');
    await page.locator('#apply-zone-btn').click();

    // Click first seat on canvas to apply a partial per-seat override without changing zone base price/color
    const canvasLocator = page.locator('#seat-canvas');
    await canvasLocator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
    const firstSeatCenter = await page.evaluate(() => {
      const s = window.AdminEventEngine.State.seats[0];
      return { cx: s.x + 18, cy: s.y + 18, width: window.AdminEventEngine.State.logicalWidth, height: window.AdminEventEngine.State.logicalHeight };
    });
    const firstBox = await canvasLocator.boundingBox();
    await canvasLocator.click({
      position: {
        x: firstSeatCenter.cx * (firstBox.width / firstSeatCenter.width),
        y: firstSeatCenter.cy * (firstBox.height / firstSeatCenter.height)
      }
    });
    await expect(page.locator('#selection-count')).toHaveText('1');
    await page.locator('#seat-price-input').fill('3800');
    await page.locator('#seat-color-input').fill('#FF0800');
    await page.locator('#apply-zone-btn').click();

    // Click last seat and delete it
    await canvasLocator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
    const lastSeatCenter = await page.evaluate(() => {
      const seats = window.AdminEventEngine.State.seats;
      const s = seats[seats.length - 1];
      return { cx: s.x + 18, cy: s.y + 18, width: window.AdminEventEngine.State.logicalWidth, height: window.AdminEventEngine.State.logicalHeight };
    });
    const lastBox = await canvasLocator.boundingBox();
    await canvasLocator.click({
      position: {
        x: lastSeatCenter.cx * (lastBox.width / lastSeatCenter.width),
        y: lastSeatCenter.cy * (lastBox.height / lastSeatCenter.height)
      }
    });
    await page.keyboard.press('Delete');
    await expect(page.locator('#canvas-total-seats')).toHaveText('11');

    // Save event and wait for redirect to /admin
    await page.locator('#save-event-btn').click();
    await page.waitForURL(/\/admin/);

    // Navigate to Events & Seating tab and click Edit on the new event
    await page.locator('#portal-tabs-nav [data-tab="events"]').click();
    const editLink = page.locator('#admin-events-table-body tr', { hasText: 'Issue 42 Persistence Concert' }).locator('.btn-edit-event');
    await expect(editLink).toBeVisible();
    await editLink.click();

    await page.waitForURL(/\/admin-event\.html\?id=/);
    await expect(page.locator('#page-mode-breadcrumb')).toContainText('Edit Event: Issue 42 Persistence Concert');

    // Verify all Event Details fields loaded
    await expect(page.locator('#event-title')).toHaveValue('Issue 42 Persistence Concert');
    await expect(page.locator('#event-category')).toHaveValue('Festival');
    await expect(page.locator('#event-venue')).toHaveValue('Impact Exhibition Hall 5');
    await expect(page.locator('#event-province')).toHaveValue('Nonthaburi');
    await expect(page.locator('#event-artist')).toHaveValue('Neon Orchestra');
    await expect(page.locator('#event-organizer')).toHaveValue('LiveCo Asia');
    await expect(page.locator('#event-status')).toHaveValue('Coming Soon');
    await expect(page.locator('#event-poster-url')).toHaveValue('https://example.com/poster-42.jpg');
    await expect(page.locator('#event-gallery')).toHaveValue('https://example.com/gallery-1.jpg, https://example.com/gallery-2.jpg');
    await expect(page.locator('#event-gate-time')).toHaveValue('16:45');
    await expect(page.locator('#event-sale-start')).toHaveValue('2026-11-25T10:00');
    await expect(page.locator('#event-sale-end')).toHaveValue('2026-12-20T22:30');
    await expect(page.locator('#event-description')).toHaveValue('Detailed description for Issue 42 verification.');
    await expect(page.locator('#event-featured')).toBeChecked();

    // Verify Rounds & showTime loaded
    await expect(page.locator('#rounds-list .round-card-item')).toHaveCount(2);
    await expect(page.locator('#rounds-list .round-date-input').first()).toHaveValue('2026-12-24');
    await expect(page.locator('#rounds-list .round-time-input').first()).toHaveValue('20:15');
    await expect(page.locator('#rounds-list .round-date-input').nth(1)).toHaveValue('2026-12-25');
    await expect(page.locator('#rounds-list .round-time-input').nth(1)).toHaveValue('21:00');
    await expect(page.locator('#event-time')).toHaveValue('20:15');
    await expect(page.locator('#event-show-time')).toHaveValue('20:15');

    // Verify Side Panel, Matrix controls, Builder mode, and Canvas seat overrides loaded
    await expect(page.locator('#seat-price-input')).toHaveValue('2400');
    await expect(page.locator('#seat-color-input')).toHaveValue('#0D9488');
    await expect(page.locator('#matrix-rows')).toHaveValue('3');
    await expect(page.locator('#matrix-cols')).toHaveValue('4');
    await expect(page.locator('#mode-custom')).toHaveClass(/active/);
    await expect(page.locator('#canvas-total-seats')).toHaveText('11');

    const loadedSeats = await page.evaluate(() => window.AdminEventEngine.State.seats);
    expect(loadedSeats.length).toBe(11);
    expect(loadedSeats[0].price).toBe(3800);
    expect(loadedSeats[0].color.toUpperCase()).toBe('#FF0800');
    expect(loadedSeats[1].price).toBe(2400);
    expect(loadedSeats[1].color.toUpperCase()).toBe('#0D9488');
  });
});
