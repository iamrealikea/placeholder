/**
 * TicketHub - Checkout & Payment Controller (public/js/checkout.js)
 * Live 10-minute countdown timer, breakdown calculation (40 THB/seat fee),
 * promo codes, loyalty points redemption, 6 payment simulators, and payment confirmation.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const bookingId = urlParams.get('bookingId');

  if (!bookingId) {
    await Popup.alert('No active booking found. Redirecting to home.', { title: 'No Booking' });
    window.location.href = '/home';
    return;
  }

  const countdownTimerEl = document.getElementById('countdownTimer');
  const countdownBoxEl = document.getElementById('countdownBox');
  const eventTitleEl = document.getElementById('checkoutEventTitle');
  const roundLabelEl = document.getElementById('checkoutRound');
  const seatsListEl = document.getElementById('checkoutSeats');
  const ticketHolderFields = document.getElementById('ticketHolderFields');
  const subtotalEl = document.getElementById('breakdownSubtotal');
  const serviceFeeEl = document.getElementById('breakdownServiceFee');
  const discountRowEl = document.getElementById('breakdownDiscountRow');
  const discountAmountEl = document.getElementById('breakdownDiscount');
  const totalAmountEl = document.getElementById('breakdownTotal');
  const userPointsEl = document.getElementById('userAvailablePoints');
  const promoInput = document.getElementById('promoCodeInput');
  const applyPromoBtn = document.getElementById('applyPromoBtn');
  const pointsInput = document.getElementById('redeemPointsInput');
  const redeemPointsBtn = document.getElementById('redeemPointsBtn');
  const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');
  const paymentSimulatorContainer = document.getElementById('paymentSimulatorContainer');

  let bookingData = null;
  let remainingSeconds = 600; // 10 minutes default
  let timerInterval = null;
  let selectedMethod = 'PROMPTPAY';

  async function loadBookingSummary() {
    try {
      const res = await API.booking.getSummary(bookingId);
      bookingData = res.booking;
      remainingSeconds = res.remainingSeconds || 0;

      if (res.isExpired || remainingSeconds <= 0) {
        handleExpiredHold();
        return;
      }

      renderBookingDetails(res);
      renderTicketHolderFields(res.booking);
      startCountdownTimer();
      renderPaymentSimulator();
    } catch (err) {
      console.error('Failed to load summary:', err);
      if (err.status === 403 || err.status === 404) {
        window.location.href = `/${err.status}?message=${encodeURIComponent(err.message)}`;
        return;
      }
      await Popup.alert(err.message || 'Error loading booking summary.', { title: 'Checkout Error' });
      window.location.href = '/home';
    }
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function renderTicketHolderFields(booking) {
    if (!ticketHolderFields) return;
    ticketHolderFields.innerHTML = `
      <h4 class="mb-12">Ticket Holder Names</h4>
      ${(booking.seatNumbers || []).map((seatNumber, index) => `
        <div class="form-group">
          <label class="form-label" for="ticketHolder${index}">Seat ${escapeHtml(seatNumber)}</label>
          <input id="ticketHolder${index}" class="form-control ticket-holder-name" type="text"
            value="${escapeHtml(booking.userName || '')}" maxlength="120" required>
        </div>
      `).join('')}
    `;
  }

  function renderBookingDetails(data) {
    const b = data.booking;
    if (eventTitleEl) eventTitleEl.textContent = b.eventTitle;
    if (roundLabelEl) roundLabelEl.innerHTML = `<i class="fa-solid fa-calendar-days mr-4"></i> ${escapeHtml(b.roundLabel || 'General Admission')}`;
    if (seatsListEl) seatsListEl.innerHTML = `<i class="fa-solid fa-chair mr-4"></i> ${escapeHtml(b.zoneName)} - Seats: ${(b.seatNumbers || []).map(escapeHtml).join(', ')}`;

    if (subtotalEl) subtotalEl.textContent = `${b.subtotal.toLocaleString()} THB`;
    if (serviceFeeEl) serviceFeeEl.textContent = `${b.serviceFee.toLocaleString()} THB`;

    if (b.discountAmount > 0) {
      if (discountRowEl) discountRowEl.classList.remove('d-none');
      if (discountAmountEl) discountAmountEl.textContent = `-${b.discountAmount.toLocaleString()} THB`;
    } else {
      if (discountRowEl) discountRowEl.classList.add('d-none');
    }

    if (totalAmountEl) totalAmountEl.textContent = `${b.totalAmount.toLocaleString()} THB`;
    if (userPointsEl) userPointsEl.textContent = data.userPoints || 0;

    if (confirmPaymentBtn) {
      confirmPaymentBtn.textContent = `Confirm & Pay ${b.totalAmount.toLocaleString()} THB`;
    }
  }

  function startCountdownTimer() {
    if (timerInterval) clearInterval(timerInterval);

    updateTimerDisplay();

    timerInterval = setInterval(() => {
      remainingSeconds--;
      updateTimerDisplay();

      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        handleExpiredHold();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    if (!countdownTimerEl) return;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    countdownTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    if (remainingSeconds < 120) {
      countdownBoxEl.classList.add('urgent');
    } else {
      countdownBoxEl.classList.remove('urgent');
    }
  }

  async function handleExpiredHold() {
    if (countdownTimerEl) countdownTimerEl.textContent = '00:00';
    if (confirmPaymentBtn) confirmPaymentBtn.disabled = true;
    await Popup.alert('Your 10-minute seat reservation has expired. The held seats have been released back to available inventory. Please re-select your seats.', { title: 'Reservation Expired' });
    window.location.href = `/booking?eventId=${bookingData ? bookingData.eventId : 'evt-1'}`;
  }

  // Promo Code Application
  if (applyPromoBtn) {
    applyPromoBtn.addEventListener('click', async () => {
      const promoCode = promoInput.value.trim();
      if (!promoCode) {
        await Popup.alert('Please enter a promotional code.', { title: 'Promo Code' });
        return;
      }
      try {
        const res = await API.booking.applyDiscount(bookingId, { promoCode });
        bookingData = res.booking;
        await Popup.alert(`Success! Code "${promoCode}" applied.`, { title: 'Promo Applied' });
        await loadBookingSummary();
      } catch (err) {
        await Popup.alert(err.message || 'Failed to apply promo code.', { title: 'Promo Error' });
      }
    });
  }

  // Loyalty Points Redemption
  if (redeemPointsBtn) {
    redeemPointsBtn.addEventListener('click', async () => {
      const redeemPoints = Number(pointsInput.value);
      if (!redeemPoints || redeemPoints < 100) {
        await Popup.alert('Minimum redemption is 100 points (10 THB discount).', { title: 'Points Redemption' });
        return;
      }
      try {
        const res = await API.booking.applyDiscount(bookingId, { redeemPoints });
        bookingData = res.booking;
        await Popup.alert(`Success! Redeemed ${redeemPoints} points.`, { title: 'Points Redeemed' });
        await loadBookingSummary();
      } catch (err) {
        await Popup.alert(err.message || 'Failed to redeem points.', { title: 'Redemption Error' });
      }
    });
  }

  // Payment Method Selection
  document.querySelectorAll('.payment-method-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.payment-method-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      selectedMethod = card.dataset.method;
      renderPaymentSimulator();
    });
  });

  function renderPaymentSimulator() {
    if (!paymentSimulatorContainer) return;

    if (selectedMethod === 'PROMPTPAY') {
      paymentSimulatorContainer.innerHTML = `
        <div class="tc">
          <h4 class="fs-11 mb-8 c-blue">PromptPay QR Code</h4>
          <p class="fs-085 c-muted mb-16">Scan with any Thai Mobile Banking App</p>
          <div class="promptpay-qr-box">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PROMPTPAY_SIMULATOR_${escapeHtml(encodeURIComponent(bookingId))}" alt="PromptPay QR">
          </div>
          <div class="fs-085 c-ink-2">
            Ref: <strong>TH-PP-${Date.now().toString().slice(-6)}</strong>
          </div>
        </div>
      `;
    } else if (selectedMethod === 'CREDIT_CARD' || selectedMethod === 'DEBIT_CARD') {
      const cardType = selectedMethod === 'CREDIT_CARD' ? 'Credit Card' : 'Debit Card';
      paymentSimulatorContainer.innerHTML = `
        <div>
          <h4 class="fs-11 mb-12 c-ink">${escapeHtml(cardType)} Details</h4>
          <div class="form-group">
            <label class="form-label">Card Number</label>
            <input type="text" id="simCardNumber" class="form-control" placeholder="4123 4567 8901 2345" value="4123 4567 8901 2345">
          </div>
          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label">Expiry (MM/YY)</label>
              <input type="text" id="simExpiry" class="form-control" placeholder="12/28" value="12/28">
            </div>
            <div class="form-group">
              <label class="form-label">CVV</label>
              <input type="password" id="simCvv" class="form-control" placeholder="123" value="123">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Cardholder Name</label>
            <input type="text" id="simCardHolder" class="form-control" placeholder="Full Name on Card" value="${escapeHtml(bookingData ? bookingData.userName : 'Alex Rivers')}">
          </div>
        </div>
      `;
    } else if (selectedMethod === 'KBANK') {
      paymentSimulatorContainer.innerHTML = `
        <div class="tc">
          <h4 class="fs-11 mb-8 c-green">Kasikornbank (K PLUS)</h4>
          <p class="fs-085 c-muted mb-16">App-to-App direct authorization simulation</p>
          <div class="form-group max-w-280 mx-auto mb-16 tl">
            <label class="form-label">K PLUS Registered Mobile</label>
            <input type="text" id="simKbankPhone" class="form-control" placeholder="081-xxx-xxxx" value="${escapeHtml(bookingData ? bookingData.userPhone || '0812345678' : '0812345678')}">
          </div>
          <div class="fs-08 bg-green-light c-green-dark p-8-12 r-8">
            <i class="fa-solid fa-circle-check mr-4"></i> Instant push confirmation ready
          </div>
        </div>
      `;
    } else if (selectedMethod === 'KRUNGTHAI') {
      paymentSimulatorContainer.innerHTML = `
        <div class="tc">
          <h4 class="fs-11 mb-8 c-sky">Krungthai NEXT</h4>
          <p class="fs-085 c-muted mb-16">Simulated Online Banking Direct Debit</p>
          <div class="form-group max-w-280 mx-auto mb-16 tl">
            <label class="form-label">Krungthai NEXT Citizen ID / Phone</label>
            <input type="text" id="simKtPhone" class="form-control" placeholder="081-xxx-xxxx" value="${escapeHtml(bookingData ? bookingData.userPhone || '0812345678' : '0812345678')}">
          </div>
          <div class="fs-08 bg-sky-light c-sky-dark p-8-12 r-8">
            <i class="fa-solid fa-circle-check mr-4"></i> Seamless single-step approval enabled
          </div>
        </div>
      `;
    } else if (selectedMethod === 'TRUEMONEY') {
      paymentSimulatorContainer.innerHTML = `
        <div class="tc">
          <h4 class="fs-11 mb-8 c-orange-dark">TrueMoney Wallet</h4>
          <p class="fs-085 c-muted mb-16">Simulated E-Wallet Balance Deduction</p>
          <div class="form-group max-w-280 mx-auto mb-16 tl">
            <label class="form-label">TrueMoney Registered Phone</label>
            <input type="text" id="simTmPhone" class="form-control" placeholder="089-xxx-xxxx" value="${escapeHtml(bookingData ? bookingData.userPhone || '0891234567' : '0891234567')}">
          </div>
          <div class="fs-08 bg-orange-light c-orange-dark p-8-12 r-8">
            <i class="fa-solid fa-circle-check mr-4"></i> Wallet OTP simulation verified
          </div>
        </div>
      `;
    }
  }

  // Confirm Payment
  if (confirmPaymentBtn) {
    confirmPaymentBtn.addEventListener('click', async () => {
      const holderNameInputs = Array.from(document.querySelectorAll('.ticket-holder-name'));
      if (holderNameInputs.some((input) => !input.value.trim())) {
        const emptyInput = holderNameInputs.find((input) => !input.value.trim());
        emptyInput.reportValidity();
        emptyInput.focus();
        return;
      }

      confirmPaymentBtn.disabled = true;
      confirmPaymentBtn.textContent = 'Processing Payment...';

      try {
        const payload = {
          paymentMethod: selectedMethod,
          ticketHolderNames: holderNameInputs.map((input) => input.value.trim()),
          paymentDetails: {
            simulatedTimestamp: new Date().toISOString(),
            channel: 'WEB_SIMULATOR'
          }
        };

        const res = await API.booking.pay(bookingId, payload);
        await Popup.alert('Payment successful! Electronic tickets have been issued.', { title: 'Payment Successful' });
        window.location.href = '/my-tickets';
      } catch (err) {
        confirmPaymentBtn.disabled = false;
        confirmPaymentBtn.textContent = `Confirm & Pay ${bookingData ? bookingData.totalAmount.toLocaleString() : ''} THB`;
        await Popup.alert(err.message || 'Payment failed.', { title: 'Payment Failed' });
      }
    });
  }

  await loadBookingSummary();
});
