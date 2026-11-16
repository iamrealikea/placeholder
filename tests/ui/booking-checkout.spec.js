const { test, expect } = require('@playwright/test');
const { loginViaModal, dismissPopup } = require('./ui-helpers');

test.describe('Interactive Seat Matrix, 4-Step Checkout, Tickets & Support Flow', () => {
  test('completes end-to-end customer booking, promo discount, payment simulation, e-ticket QR, and support submission', async ({ page }) => {
    await page.goto('/home');
    await loginViaModal(page, 'user@ticket.com', 'password123');
    await expect(page.locator('#authModal')).toBeHidden();

    // Event detail -> Buy Now -> Booking seating plan
    await page.goto('/event?id=evt-1');
    await expect(page.locator('#eventTitle')).toHaveText('Forza Horizon Somethings Live Festival');
    await page.locator('#buyNowBtn').click();
    await expect(page).toHaveURL(/\/booking\?eventId=evt-1/);

    // Verify interactive seating states: UI-04 (.available), UI-05 (.booked), UI-06 (.selected)
    const availableSeats = page.locator('#seatMatrixContainer .seat.available');
    await expect(availableSeats.first()).toBeVisible();
    await expect(page.locator('#seatMatrixContainer .seat.booked').first()).toBeVisible();

    const firstSeat = availableSeats.nth(0);
    const secondSeat = availableSeats.nth(1);
    const price1 = Number(await firstSeat.getAttribute('data-price'));
    const price2 = Number(await secondSeat.getAttribute('data-price'));

    await firstSeat.click();
    await secondSeat.click();
    await expect(page.locator('#seatMatrixContainer .seat.selected')).toHaveCount(2);

    const expectedTotal = (price1 + price2 + 80).toLocaleString() + ' THB';
    await expect(page.locator('#summarySeatCount')).toHaveText('2');
    await expect(page.locator('#summaryTotal')).toHaveText(expectedTotal);

    // Verify Zone tab filter retains selection state
    await page.locator('#zoneTabs .zone-tab').nth(1).click();
    await expect(page.locator('#summarySeatCount')).toHaveText('2');
    await page.locator('#zoneTabs .zone-tab[data-zone="ALL"]').click();

    // Proceed to Checkout (10-min seat hold lock)
    await page.locator('#proceedCheckoutBtn').click();
    await expect(page).toHaveURL(/\/checkout\?bookingId=/);
    await expect(page.locator('#countdownTimer')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('#checkoutStep1')).toBeVisible();

    // Step 1 -> Step 2: Apply promo TICKETHUB10
    await page.locator('#toStep2Btn').click();
    await expect(page.locator('#checkoutStep2')).toBeVisible();
    await page.locator('#promoCodeInput').fill('TICKETHUB10');
    await page.locator('#applyPromoBtn').click();
    await dismissPopup(page);
    await expect(page.locator('#breakdownDiscountRow')).toBeVisible();

    // Step 2 -> Step 3: Test gateway simulated failure, retry, then complete PromptPay payment
    await page.locator('#toStep3Btn').click();
    await expect(page.locator('#checkoutStep3')).toBeVisible();
    await page.locator('#simulateFailBtn').click();
    await expect(page.locator('#checkoutStep4')).toBeVisible();
    await expect(page.locator('#paymentErrorActions')).toBeVisible();

    await page.locator('#retryGatewayBtn').click();
    await expect(page.locator('#checkoutStep3')).toBeVisible();
    await page.locator('#confirmPaymentBtn').click();

    // Step 4: Success -> View Electronic Tickets
    await expect(page.locator('#paymentStatusTitle')).toHaveText('Payment Successful');
    await expect(page.locator('#paymentSuccessActions')).toBeVisible();
    await page.locator('#paymentSuccessActions a[href^="/my-tickets"]').click();

    // My Tickets QR verification (wait past initial HTML placeholder TKT-XXXX-0000)
    await expect(page).toHaveURL(/\/my-tickets/);
    await expect(page.locator('#ticketStatusBadge')).toHaveText('VALID');
    await expect(page.locator('#ticketCode')).not.toHaveText('TKT-XXXX-0000');
    await expect(page.locator('#ticketCode')).toHaveText(/^TKT-/);
    await expect(page.locator('#ticketQrImage')).toHaveAttribute('src', /^data:image\/png;base64,/);

    // Notification bell should reflect unread PAYMENT_SUCCESS notification
    await expect(page.locator('.notification-badge')).toBeVisible();
    await page.locator('.notification-bell-btn').click();
    await expect(page.locator('#notificationDropdownDrawer')).toBeVisible();

    // Support inquiry submission
    await page.goto('/support');
    await page.locator('#supportCategory').selectOption('Booking & Seats');
    await page.locator('#supportSubject').fill('Playwright E2E Seat Help');
    await page.locator('#supportMessage').fill('Checking seat details from UI E2E flow.');
    await page.locator('#supportForm button[type="submit"]').click();
    await dismissPopup(page);
    await expect(page.locator('#myInquiriesContainer')).toContainText('Playwright E2E Seat Help');
  });
});
