/**
 * TicketHub - Sequential Checkout & Separated Payment Gateway Controller (public/js/checkout.js)
 * Sequence: Step 1 Summary (FR-24) -> Step 2 Method & Discounts (FR-25/46/47)
 *           -> Step 3 Payment Gateway (FR-25/26) -> Step 4 Status Result (FR-26/27)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const bookingId = urlParams.get('bookingId');

  if (!bookingId) {
    await Popup.alert('No active booking found. Redirecting to home.', { title: 'No Booking' });
    window.location.href = '/home';
    return;
  }

  const METHOD_CONFIG = {
    PROMPTPAY: { label: 'PromptPay QR', type: 'qr' },
    CREDIT_CARD: { label: 'Credit Card', type: 'card' },
    DEBIT_CARD: { label: 'Debit Card', type: 'card' },
    KBANK: {
      label: 'KBank K PLUS',
      type: 'mobile',
      headingClass: 'c-green',
      subtitle: 'App-to-App direct authorization simulation',
      inputLabel: 'K PLUS Registered Mobile',
      placeholder: '0812345678',
      statusBgClass: 'bg-green-light c-green-dark',
      statusText: 'Instant push confirmation ready'
    },
    KRUNGTHAI: {
      label: 'Krungthai NEXT',
      type: 'mobile',
      headingClass: 'c-sky',
      subtitle: 'Simulated Online Banking Direct Debit',
      inputLabel: 'Krungthai NEXT Citizen ID / Phone',
      placeholder: '0812345678',
      statusBgClass: 'bg-sky-light c-sky-dark',
      statusText: 'Seamless single-step approval enabled'
    },
    TRUEMONEY: {
      label: 'TrueMoney Wallet',
      type: 'mobile',
      headingClass: 'c-orange-dark',
      subtitle: 'Simulated E-Wallet Balance Deduction',
      inputLabel: 'TrueMoney Registered Phone',
      placeholder: '0891234567',
      statusBgClass: 'bg-orange-light c-orange-dark',
      statusText: 'Wallet OTP simulation verified'
    }
  };

  const countdownTimerEl = document.getElementById('countdownTimer');
  const countdownBoxEl = document.getElementById('countdownBox');
  const stepContainers = [1, 2, 3, 4].map((n) => document.getElementById(`checkoutStep${n}`));
  const stepperItems = Array.from(document.querySelectorAll('.checkout-step-item'));

  // Step 1 elements
  const summaryUserNameEl = document.getElementById('summaryUserName');
  const summaryUserEmailEl = document.getElementById('summaryUserEmail');
  const summaryUserPhoneEl = document.getElementById('summaryUserPhone');
  const eventTitleEl = document.getElementById('checkoutEventTitle');
  const roundLabelEl = document.getElementById('checkoutRound');
  const seatsListEl = document.getElementById('checkoutSeats');
  const ticketHolderFields = document.getElementById('ticketHolderFields');
  const step1SubtotalEl = document.getElementById('step1Subtotal');
  const step1ServiceFeeEl = document.getElementById('step1ServiceFee');
  const step1TotalEl = document.getElementById('step1Total');
  const toStep2Btn = document.getElementById('toStep2Btn');

  // Step 2 elements
  const userPointsEl = document.getElementById('userAvailablePoints');
  const promoInput = document.getElementById('promoCodeInput');
  const applyPromoBtn = document.getElementById('applyPromoBtn');
  const pointsInput = document.getElementById('redeemPointsInput');
  const redeemPointsBtn = document.getElementById('redeemPointsBtn');
  const subtotalEl = document.getElementById('breakdownSubtotal');
  const serviceFeeEl = document.getElementById('breakdownServiceFee');
  const discountRowEl = document.getElementById('breakdownDiscountRow');
  const discountAmountEl = document.getElementById('breakdownDiscount');
  const totalAmountEl = document.getElementById('breakdownTotal');
  const backToStep1Btn = document.getElementById('backToStep1Btn');
  const toStep3Btn = document.getElementById('toStep3Btn');

  // Step 3 elements
  const gatewayBookingIdEl = document.getElementById('gatewayBookingId');
  const gatewayMethodBadgeEl = document.getElementById('gatewayMethodBadge');
  const gatewayAmountDueEl = document.getElementById('gatewayAmountDue');
  const gatewayPaymentForm = document.getElementById('gatewayPaymentForm');
  const paymentSimulatorContainer = document.getElementById('paymentSimulatorContainer');
  const backToStep2Btn = document.getElementById('backToStep2Btn');
  const simulateFailBtn = document.getElementById('simulateFailBtn');
  const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');

  // Step 4 elements
  const paymentStatusIconEl = document.getElementById('paymentStatusIcon');
  const paymentStatusTitleEl = document.getElementById('paymentStatusTitle');
  const paymentStatusMessageEl = document.getElementById('paymentStatusMessage');
  const paymentStatusDetailsEl = document.getElementById('paymentStatusDetails');
  const paymentSuccessActionsEl = document.getElementById('paymentSuccessActions');
  const paymentErrorActionsEl = document.getElementById('paymentErrorActions');
  const retryGatewayBtn = document.getElementById('retryGatewayBtn');
  const changeMethodFromErrorBtn = document.getElementById('changeMethodFromErrorBtn');

  let bookingData = null;
  let remainingSeconds = 600;
  let timerInterval = null;
  let selectedMethod = 'PROMPTPAY';
  let holdersRendered = false;

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

  function goToStep(stepNumber) {
    stepContainers.forEach((section, idx) => {
      if (!section) return;
      const isActive = idx + 1 === stepNumber;
      section.classList.toggle('d-none', !isActive);
      section.hidden = !isActive;
    });

    stepperItems.forEach((item) => {
      const stepVal = Number(item.dataset.step);
      item.classList.toggle('step-active', stepVal === stepNumber);
      item.classList.toggle('step-done', stepVal < stepNumber);
      if (stepVal === stepNumber) {
        item.setAttribute('aria-current', 'step');
      } else {
        item.removeAttribute('aria-current');
      }
    });

    const activeSection = stepContainers[stepNumber - 1];
    const heading = activeSection ? activeSection.querySelector('.checkout-step-heading, h2') : null;
    if (heading) {
      heading.focus();
    }
  }

  async function loadBookingSummary({ preserveStep = false } = {}) {
    try {
      const res = await API.booking.getSummary(bookingId);
      bookingData = res.booking;
      remainingSeconds = res.remainingSeconds || 0;

      if (res.isExpired || remainingSeconds <= 0) {
        handleExpiredHold();
        return;
      }

      renderBookingDetails(res);
      if (!holdersRendered) {
        renderTicketHolderFields(res.booking);
        holdersRendered = true;
      }
      if (!timerInterval) {
        startCountdownTimer();
      }
      if (!preserveStep) {
        goToStep(1);
      }
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

  function renderTicketHolderFields(booking) {
    if (!ticketHolderFields) return;
    ticketHolderFields.innerHTML = `
      <h4 class="mb-12">Ticket Holder Names</h4>
      ${(booking.seatNumbers || []).map((seatNumber, index) => `
        <div class="form-group">
          <label class="form-label" for="ticketHolder${index}">Seat ${escapeHtml(seatNumber)} <span aria-hidden="true">*</span></label>
          <input id="ticketHolder${index}" name="ticketHolder${index}" class="form-control ticket-holder-name" type="text"
            autocomplete="name" value="${escapeHtml(booking.userName || '')}" maxlength="120" required>
        </div>
      `).join('')}
    `;
    ticketHolderFields.querySelectorAll('.ticket-holder-name').forEach((input) => {
      input.addEventListener('input', () => {
        input.setCustomValidity('');
        input.removeAttribute('aria-invalid');
      });
    });
  }

  function renderBookingDetails(data) {
    const b = data.booking;
    if (summaryUserNameEl) summaryUserNameEl.textContent = b.userName || '-';
    if (summaryUserEmailEl) summaryUserEmailEl.textContent = b.userEmail || '-';
    if (summaryUserPhoneEl) summaryUserPhoneEl.textContent = b.userPhone || '-';

    if (eventTitleEl) eventTitleEl.textContent = b.eventTitle;
    if (roundLabelEl) roundLabelEl.innerHTML = `<i class="fa-solid fa-calendar-days mr-4"></i> ${escapeHtml(b.roundLabel || 'General Admission')}`;
    if (seatsListEl) seatsListEl.innerHTML = `<i class="fa-solid fa-chair mr-4"></i> ${escapeHtml(b.zoneName)} - Seats: ${(b.seatNumbers || []).map(escapeHtml).join(', ')}`;

    const preDiscountTotal = b.subtotal + b.serviceFee;
    if (step1SubtotalEl) step1SubtotalEl.textContent = `${b.subtotal.toLocaleString()} THB`;
    if (step1ServiceFeeEl) step1ServiceFeeEl.textContent = `${b.serviceFee.toLocaleString()} THB`;
    if (step1TotalEl) step1TotalEl.textContent = `${preDiscountTotal.toLocaleString()} THB`;

    if (subtotalEl) subtotalEl.textContent = `${b.subtotal.toLocaleString()} THB`;
    if (serviceFeeEl) serviceFeeEl.textContent = `${b.serviceFee.toLocaleString()} THB`;

    const hasDiscount = b.discountAmount > 0;
    if (discountRowEl) {
      discountRowEl.classList.toggle('d-none', !hasDiscount);
      discountRowEl.hidden = !hasDiscount;
    }
    if (discountAmountEl && hasDiscount) {
      discountAmountEl.textContent = `-${b.discountAmount.toLocaleString()} THB`;
    }

    if (totalAmountEl) totalAmountEl.textContent = `${b.totalAmount.toLocaleString()} THB`;
    if (userPointsEl) userPointsEl.textContent = data.userPoints || 0;

    if (gatewayBookingIdEl) gatewayBookingIdEl.textContent = b.id;
    if (gatewayAmountDueEl) gatewayAmountDueEl.textContent = `${b.totalAmount.toLocaleString()} THB`;
    updateGatewayHeader();
  }

  function updateGatewayHeader() {
    const cfg = METHOD_CONFIG[selectedMethod] || METHOD_CONFIG.PROMPTPAY;
    if (gatewayMethodBadgeEl) gatewayMethodBadgeEl.textContent = cfg.label;
    if (confirmPaymentBtn && bookingData) {
      confirmPaymentBtn.textContent = `Confirm & Pay ${bookingData.totalAmount.toLocaleString()} THB`;
    }
  }

  function validateTicketHolderInputs() {
    const holderInputs = Array.from(document.querySelectorAll('.ticket-holder-name'));
    const invalidInput = holderInputs.find((input) => !input.value.trim());
    if (invalidInput) {
      invalidInput.setCustomValidity('Please enter the ticket holder name.');
      invalidInput.setAttribute('aria-invalid', 'true');
      invalidInput.reportValidity();
      invalidInput.focus();
      return null;
    }
    holderInputs.forEach((input) => {
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
    });
    return holderInputs.map((input) => input.value.trim());
  }

  function startCountdownTimer() {
    if (timerInterval) clearInterval(timerInterval);
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      remainingSeconds--;
      updateTimerDisplay();

      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        handleExpiredHold();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    if (!countdownTimerEl) return;
    const minutes = Math.floor(Math.max(0, remainingSeconds) / 60);
    const seconds = Math.max(0, remainingSeconds) % 60;
    countdownTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    if (countdownBoxEl) {
      countdownBoxEl.classList.toggle('urgent', remainingSeconds < 120);
    }
  }

  async function handleExpiredHold() {
    if (countdownTimerEl) countdownTimerEl.textContent = '00:00';
    if (confirmPaymentBtn) confirmPaymentBtn.disabled = true;
    await Popup.alert(
      'Your 10-minute seat reservation has expired. The held seats have been released back to available inventory. Please re-select your seats.',
      { title: 'Reservation Expired' }
    );
    window.location.href = `/booking?eventId=${bookingData ? bookingData.eventId : 'evt-1'}`;
  }

  // Step navigation buttons
  if (toStep2Btn) {
    toStep2Btn.addEventListener('click', () => {
      if (!validateTicketHolderInputs()) return;
      goToStep(2);
    });
  }

  if (backToStep1Btn) {
    backToStep1Btn.addEventListener('click', () => goToStep(1));
  }

  if (toStep3Btn) {
    toStep3Btn.addEventListener('click', () => {
      updateGatewayHeader();
      renderPaymentSimulator();
      goToStep(3);
    });
  }

  if (backToStep2Btn) {
    backToStep2Btn.addEventListener('click', () => goToStep(2));
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
        await loadBookingSummary({ preserveStep: true });
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
        await loadBookingSummary({ preserveStep: true });
      } catch (err) {
        await Popup.alert(err.message || 'Failed to redeem points.', { title: 'Redemption Error' });
      }
    });
  }

  // Payment Method Selection
  document.querySelectorAll('.payment-method-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.payment-method-card').forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      card.classList.add('active');
      card.setAttribute('aria-pressed', 'true');
      selectedMethod = card.dataset.method;
      updateGatewayHeader();
    });
  });

  function attachGatewayFieldListeners() {
    if (!paymentSimulatorContainer) return;
    paymentSimulatorContainer.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => {
        input.setCustomValidity('');
        input.removeAttribute('aria-invalid');
      });
      input.addEventListener('blur', () => {
        if (input.value.trim() && !input.checkValidity()) {
          input.setAttribute('aria-invalid', 'true');
        }
      });
    });
  }

  function renderPaymentSimulator() {
    if (!paymentSimulatorContainer) return;
    const cfg = METHOD_CONFIG[selectedMethod] || METHOD_CONFIG.PROMPTPAY;

    if (cfg.type === 'qr') {
      paymentSimulatorContainer.innerHTML = `
        <div class="tc">
          <h3 class="fs-11 mb-8 c-blue">PromptPay QR Code Gateway</h3>
          <p class="fs-085 c-muted mb-16">Scan with any Thai Mobile Banking App, then click Confirm &amp; Pay.</p>
          <div class="promptpay-qr-box">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PROMPTPAY_SIMULATOR_${escapeHtml(encodeURIComponent(bookingId))}" alt="PromptPay QR Code">
          </div>
          <div class="fs-085 c-ink-2">
            Ref: <strong>TH-PP-${Date.now().toString().slice(-6)}</strong>
          </div>
        </div>
      `;
    } else if (cfg.type === 'card') {
      const defaultHolder = bookingData ? bookingData.userName : '';
      paymentSimulatorContainer.innerHTML = `
        <div>
          <h3 class="fs-11 mb-12 c-ink">${escapeHtml(cfg.label)} Gateway</h3>
          <div class="form-group">
            <label class="form-label" for="simCardNumber">Card Number <span aria-hidden="true">*</span></label>
            <input type="text" id="simCardNumber" name="cc-number" class="form-control"
              autocomplete="cc-number" inputmode="numeric" maxlength="19"
              pattern="[\\d ]{13,19}" placeholder="4123 4567 8901 2345"
              enterkeyhint="next" required>
          </div>
          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label" for="simExpiry">Expiry Date <span aria-hidden="true">*</span></label>
              <span id="expHint" class="field-hint">Format: MM/YY</span>
              <input type="text" id="simExpiry" name="cc-exp" class="form-control"
                autocomplete="cc-exp" aria-describedby="expHint" maxlength="5"
                pattern="(0[1-9]|1[0-2])\\/\\d{2}" placeholder="12/28"
                enterkeyhint="next" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="simCvv">Security Code (CVV) <span aria-hidden="true">*</span></label>
              <span id="cvvHint" class="field-hint">3 or 4 digits</span>
              <input type="text" id="simCvv" name="cc-csc" class="form-control"
                autocomplete="cc-csc" aria-describedby="cvvHint" inputmode="numeric"
                maxlength="4" pattern="[0-9]{3,4}" placeholder="123"
                enterkeyhint="next" required>
            </div>
          </div>
          <div class="form-group mb-0">
            <label class="form-label" for="simCardHolder">Cardholder Name <span aria-hidden="true">*</span></label>
            <input type="text" id="simCardHolder" name="cc-name" class="form-control"
              autocomplete="cc-name" maxlength="80" pattern="[\\p{L} \\-\\.]+"
              placeholder="Full Name on Card" value="${escapeHtml(defaultHolder)}"
              enterkeyhint="done" required>
          </div>
        </div>
      `;
    } else {
      const defaultPhone = bookingData && bookingData.userPhone ? bookingData.userPhone : '';
      paymentSimulatorContainer.innerHTML = `
        <div class="tc">
          <h3 class="fs-11 mb-8 ${cfg.headingClass}">${escapeHtml(cfg.label)} Gateway</h3>
          <p class="fs-085 c-muted mb-16">${escapeHtml(cfg.subtitle)}</p>
          <div class="form-group max-w-280 mx-auto mb-16 tl">
            <label class="form-label" for="simGatewayPhone">${escapeHtml(cfg.inputLabel)} <span aria-hidden="true">*</span></label>
            <input type="tel" id="simGatewayPhone" name="tel" class="form-control"
              autocomplete="tel" inputmode="numeric" pattern="[\\d \\-]{9,15}"
              placeholder="${escapeHtml(cfg.placeholder)}" value="${escapeHtml(defaultPhone)}"
              enterkeyhint="done" required>
          </div>
          <div class="fs-08 ${cfg.statusBgClass} p-8-12 r-8">
            <i class="fa-solid fa-circle-check mr-4" aria-hidden="true"></i> ${escapeHtml(cfg.statusText)}
          </div>
        </div>
      `;
    }

    attachGatewayFieldListeners();
  }

  function collectAndValidatePaymentDetails() {
    const cfg = METHOD_CONFIG[selectedMethod] || METHOD_CONFIG.PROMPTPAY;
    const fields = Array.from(paymentSimulatorContainer.querySelectorAll('input'));

    for (const field of fields) {
      if (!field.checkValidity()) {
        field.setAttribute('aria-invalid', 'true');
        field.reportValidity();
        field.focus();
        return null;
      }
      field.removeAttribute('aria-invalid');
    }

    if (cfg.type === 'card') {
      const cardNumber = document.getElementById('simCardNumber').value.trim();
      const expiry = document.getElementById('simExpiry').value.trim();
      const cvv = document.getElementById('simCvv').value.trim();
      const cardHolder = document.getElementById('simCardHolder').value.trim();
      return { cardNumber, expiry, cvv, cardHolder };
    }

    if (cfg.type === 'mobile') {
      const phone = document.getElementById('simGatewayPhone').value.trim();
      return { phone };
    }

    return {};
  }

  function renderPaymentResult({ success, payment, tickets, message }) {
    if (paymentStatusIconEl) {
      paymentStatusIconEl.className = `payment-status-icon ${success ? 'payment-status-icon--success' : 'payment-status-icon--error'}`;
      paymentStatusIconEl.innerHTML = success
        ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>';
    }

    if (paymentStatusTitleEl) {
      paymentStatusTitleEl.textContent = success ? 'Payment Successful' : 'Payment Failed';
    }

    if (paymentStatusMessageEl) {
      paymentStatusMessageEl.textContent = message;
    }

    if (paymentStatusDetailsEl) {
      if (success && payment) {
        const cfg = METHOD_CONFIG[payment.method] || { label: payment.method };
        const ticketList = Array.isArray(tickets) && tickets.length > 0
          ? tickets.map((t) => `${escapeHtml(t.seatNumber)} (${escapeHtml(t.ticketCode)})`).join(', ')
          : '-';
        paymentStatusDetailsEl.innerHTML = `
          <div class="payment-status-row"><span>Payment Reference</span><strong class="mono">${escapeHtml(payment.referenceCode)}</strong></div>
          <div class="payment-status-row"><span>Payment Method</span><strong>${escapeHtml(cfg.label)}</strong></div>
          <div class="payment-status-row"><span>Amount Paid</span><strong class="c-blue">${Number(payment.amount).toLocaleString()} THB</strong></div>
          <div class="payment-status-row"><span>Issued Tickets</span><strong>${ticketList}</strong></div>
        `;
        paymentStatusDetailsEl.classList.remove('d-none');
        paymentStatusDetailsEl.hidden = false;
      } else {
        paymentStatusDetailsEl.innerHTML = '';
        paymentStatusDetailsEl.classList.add('d-none');
        paymentStatusDetailsEl.hidden = true;
      }
    }

    if (paymentSuccessActionsEl) {
      paymentSuccessActionsEl.classList.toggle('d-none', !success);
      paymentSuccessActionsEl.hidden = !success;
      const viewTicketsLink = paymentSuccessActionsEl.querySelector('a[href^="/my-tickets"]');
      if (viewTicketsLink && bookingId) {
        viewTicketsLink.href = `/my-tickets?bookingId=${encodeURIComponent(bookingId)}`;
      }
    }
    if (paymentErrorActionsEl) {
      paymentErrorActionsEl.classList.toggle('d-none', success);
      paymentErrorActionsEl.hidden = success;
    }
  }

  async function submitPayment(simulateFailure = false) {
    const holderNames = validateTicketHolderInputs();
    if (!holderNames) {
      goToStep(1);
      return;
    }

    let gatewayDetails = {};
    if (!simulateFailure) {
      gatewayDetails = collectAndValidatePaymentDetails();
      if (!gatewayDetails) return;
    } else {
      gatewayDetails = { simulateFailure: true };
    }

    if (confirmPaymentBtn) {
      confirmPaymentBtn.disabled = true;
      confirmPaymentBtn.textContent = 'Processing Payment...';
    }
    if (simulateFailBtn) {
      simulateFailBtn.disabled = true;
    }

    try {
      const payload = {
        paymentMethod: selectedMethod,
        ticketHolderNames: holderNames,
        paymentDetails: {
          ...gatewayDetails,
          simulatedTimestamp: new Date().toISOString(),
          channel: 'WEB_SIMULATOR'
        }
      };

      const res = await API.booking.pay(bookingId, payload);
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      if (countdownBoxEl) {
        countdownBoxEl.classList.add('d-none');
        countdownBoxEl.hidden = true;
      }

      renderPaymentResult({
        success: true,
        payment: res.payment,
        tickets: res.tickets,
        message: 'Your booking is confirmed and your electronic QR tickets have been issued.'
      });
      goToStep(4);
    } catch (err) {
      renderPaymentResult({
        success: false,
        message: err.message || 'Payment could not be processed. Please review your payment details and try again.'
      });
      goToStep(4);
    } finally {
      if (confirmPaymentBtn) {
        confirmPaymentBtn.disabled = false;
        updateGatewayHeader();
      }
      if (simulateFailBtn) {
        simulateFailBtn.disabled = false;
      }
    }
  }

  if (gatewayPaymentForm) {
    gatewayPaymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitPayment(false);
    });
  }

  if (simulateFailBtn) {
    simulateFailBtn.addEventListener('click', async () => {
      await submitPayment(true);
    });
  }

  if (retryGatewayBtn) {
    retryGatewayBtn.addEventListener('click', () => {
      goToStep(3);
    });
  }

  if (changeMethodFromErrorBtn) {
    changeMethodFromErrorBtn.addEventListener('click', () => {
      goToStep(2);
    });
  }

  await loadBookingSummary();
});
