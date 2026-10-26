/**
 * TicketHub - Checkout & Payment Controller (public/js/checkout.js)
 * Live 10-minute countdown timer, breakdown calculation (40 THB/seat fee),
 * promo codes, loyalty points redemption, 6 payment simulators, and payment confirmation.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const bookingId = urlParams.get('bookingId');

  if (!bookingId) {
    alert('No active booking found. Redirecting to home.');
    window.location.href = '/index.html';
    return;
  }

  const countdownTimerEl = document.getElementById('countdownTimer');
  const countdownBoxEl = document.getElementById('countdownBox');
  const eventTitleEl = document.getElementById('checkoutEventTitle');
  const roundLabelEl = document.getElementById('checkoutRound');
  const seatsListEl = document.getElementById('checkoutSeats');
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
      startCountdownTimer();
      renderPaymentSimulator();
    } catch (err) {
      console.error('Failed to load summary:', err);
      alert(err.message || 'Error loading booking summary.');
      window.location.href = '/index.html';
    }
  }

  function renderBookingDetails(data) {
    const b = data.booking;
    if (eventTitleEl) eventTitleEl.textContent = b.eventTitle;
    if (roundLabelEl) roundLabelEl.textContent = `📅 ${b.roundLabel || 'General Admission'}`;
    if (seatsListEl) seatsListEl.textContent = `🪑 ${b.zoneName} - Seats: ${(b.seatNumbers || []).join(', ')}`;

    if (subtotalEl) subtotalEl.textContent = `${b.subtotal.toLocaleString()} THB`;
    if (serviceFeeEl) serviceFeeEl.textContent = `${b.serviceFee.toLocaleString()} THB`;

    if (b.discountAmount > 0) {
      if (discountRowEl) discountRowEl.style.display = 'table-row';
      if (discountAmountEl) discountAmountEl.textContent = `-${b.discountAmount.toLocaleString()} THB`;
    } else {
      if (discountRowEl) discountRowEl.style.display = 'none';
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

  function handleExpiredHold() {
    if (countdownTimerEl) countdownTimerEl.textContent = '00:00';
    if (confirmPaymentBtn) confirmPaymentBtn.disabled = true;
    alert('Your 10-minute seat reservation has expired. The held seats have been released back to available inventory. Please re-select your seats.');
    window.location.href = `/booking.html?eventId=${bookingData ? bookingData.eventId : 'evt-1'}`;
  }

  // Promo Code Application
  if (applyPromoBtn) {
    applyPromoBtn.addEventListener('click', async () => {
      const promoCode = promoInput.value.trim();
      if (!promoCode) {
        alert('Please enter a promotional code.');
        return;
      }
      try {
        const res = await API.booking.applyDiscount(bookingId, { promoCode });
        bookingData = res.booking;
        alert(`Success! Code "${promoCode}" applied.`);
        await loadBookingSummary();
      } catch (err) {
        alert(err.message || 'Failed to apply promo code.');
      }
    });
  }

  // Loyalty Points Redemption
  if (redeemPointsBtn) {
    redeemPointsBtn.addEventListener('click', async () => {
      const redeemPoints = Number(pointsInput.value);
      if (!redeemPoints || redeemPoints < 100) {
        alert('Minimum redemption is 100 points (10 THB discount).');
        return;
      }
      try {
        const res = await API.booking.applyDiscount(bookingId, { redeemPoints });
        bookingData = res.booking;
        alert(`Success! Redeemed ${redeemPoints} points.`);
        await loadBookingSummary();
      } catch (err) {
        alert(err.message || 'Failed to redeem points.');
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
        <div style="text-align: center;">
          <h4 style="font-size: 1.1rem; margin-bottom: 8px; color: #1D56CF;">PromptPay QR Code</h4>
          <p style="font-size: 0.85rem; color: #6B7280; margin-bottom: 16px;">Scan with any Thai Mobile Banking App</p>
          <div style="width: 200px; height: 200px; margin: 0 auto 12px; background: #FFFFFF; border: 2px solid #1D56CF; border-radius: 12px; padding: 12px; display: flex; align-items: center; justify-content: center;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PROMPTPAY_SIMULATOR_${bookingId}" alt="PromptPay QR">
          </div>
          <div style="font-size: 0.85rem; color: #4B5563;">
            Ref: <strong>TH-PP-${Date.now().toString().slice(-6)}</strong>
          </div>
        </div>
      `;
    } else if (selectedMethod === 'CREDIT_CARD' || selectedMethod === 'DEBIT_CARD') {
      const cardType = selectedMethod === 'CREDIT_CARD' ? 'Credit Card' : 'Debit Card';
      paymentSimulatorContainer.innerHTML = `
        <div>
          <h4 style="font-size: 1.1rem; margin-bottom: 12px; color: #111827;">${cardType} Details</h4>
          <div class="form-group">
            <label class="form-label">Card Number</label>
            <input type="text" id="simCardNumber" class="form-control" placeholder="4123 4567 8901 2345" value="4123 4567 8901 2345">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
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
            <input type="text" id="simCardHolder" class="form-control" placeholder="Full Name on Card" value="${bookingData ? bookingData.userName : 'Alex Rivers'}">
          </div>
        </div>
      `;
    } else if (selectedMethod === 'KBANK') {
      paymentSimulatorContainer.innerHTML = `
        <div style="text-align: center;">
          <h4 style="font-size: 1.1rem; margin-bottom: 8px; color: #10B981;">Kasikornbank (K PLUS)</h4>
          <p style="font-size: 0.85rem; color: #6B7280; margin-bottom: 16px;">App-to-App direct authorization simulation</p>
          <div class="form-group" style="max-width: 280px; margin: 0 auto 16px; text-align: left;">
            <label class="form-label">K PLUS Registered Mobile</label>
            <input type="text" id="simKbankPhone" class="form-control" placeholder="081-xxx-xxxx" value="${bookingData ? bookingData.userPhone || '0812345678' : '0812345678'}">
          </div>
          <div style="font-size: 0.8rem; background: #ECFDF5; color: #065F46; padding: 8px 12px; border-radius: 8px;">
            ✓ Instant push confirmation ready
          </div>
        </div>
      `;
    } else if (selectedMethod === 'KRUNGTHAI') {
      paymentSimulatorContainer.innerHTML = `
        <div style="text-align: center;">
          <h4 style="font-size: 1.1rem; margin-bottom: 8px; color: #0284C7;">Krungthai NEXT</h4>
          <p style="font-size: 0.85rem; color: #6B7280; margin-bottom: 16px;">Simulated Online Banking Direct Debit</p>
          <div class="form-group" style="max-width: 280px; margin: 0 auto 16px; text-align: left;">
            <label class="form-label">Krungthai NEXT Citizen ID / Phone</label>
            <input type="text" id="simKtPhone" class="form-control" placeholder="081-xxx-xxxx" value="${bookingData ? bookingData.userPhone || '0812345678' : '0812345678'}">
          </div>
          <div style="font-size: 0.8rem; background: #E0F2FE; color: #075985; padding: 8px 12px; border-radius: 8px;">
            ✓ Seamless single-step approval enabled
          </div>
        </div>
      `;
    } else if (selectedMethod === 'TRUEMONEY') {
      paymentSimulatorContainer.innerHTML = `
        <div style="text-align: center;">
          <h4 style="font-size: 1.1rem; margin-bottom: 8px; color: #EA580C;">TrueMoney Wallet</h4>
          <p style="font-size: 0.85rem; color: #6B7280; margin-bottom: 16px;">Simulated E-Wallet Balance Deduction</p>
          <div class="form-group" style="max-width: 280px; margin: 0 auto 16px; text-align: left;">
            <label class="form-label">TrueMoney Registered Phone</label>
            <input type="text" id="simTmPhone" class="form-control" placeholder="089-xxx-xxxx" value="${bookingData ? bookingData.userPhone || '0891234567' : '0891234567'}">
          </div>
          <div style="font-size: 0.8rem; background: #FFF7ED; color: #9A3412; padding: 8px 12px; border-radius: 8px;">
            ✓ Wallet OTP simulation verified
          </div>
        </div>
      `;
    }
  }

  // Confirm Payment
  if (confirmPaymentBtn) {
    confirmPaymentBtn.addEventListener('click', async () => {
      confirmPaymentBtn.disabled = true;
      confirmPaymentBtn.textContent = 'Processing Payment...';

      try {
        const payload = {
          paymentMethod: selectedMethod,
          paymentDetails: {
            simulatedTimestamp: new Date().toISOString(),
            channel: 'WEB_SIMULATOR'
          }
        };

        const res = await API.booking.pay(bookingId, payload);
        alert('🎉 Payment successful! Electronic tickets have been issued.');
        window.location.href = '/my-tickets.html';
      } catch (err) {
        confirmPaymentBtn.disabled = false;
        confirmPaymentBtn.textContent = `Confirm & Pay ${bookingData ? bookingData.totalAmount.toLocaleString() : ''} THB`;
        alert(err.message || 'Payment failed.');
      }
    });
  }

  await loadBookingSummary();
});
