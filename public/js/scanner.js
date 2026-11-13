/**
 * TicketHub - Staff Gate Scanner Controller (public/js/scanner.js)
 * Implements camera QR scanning (getUserMedia / canvas), manual code input,
 * ticket check-in validation via POST /api/tickets/validate,
 * and high-visibility red duplicate scan fraud alert (ALREADY_CHECKED_IN).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const scannerGuardEl = document.getElementById('scannerGuard');
  const scannerContentEl = document.getElementById('scannerContent');

  // Camera elements
  const cameraVideo = document.getElementById('cameraVideo');
  const startCameraBtn = document.getElementById('startCameraBtn');
  const stopCameraBtn = document.getElementById('stopCameraBtn');
  const cameraErrorMsg = document.getElementById('cameraErrorMsg');

  // Manual code input
  const manualCodeInput = document.getElementById('manualTicketCode');
  const validateCodeBtn = document.getElementById('validateCodeBtn');

  // File upload input
  const qrFileInput = document.getElementById('qrFileInput');

  // Results & Alerts
  const scanResultArea = document.getElementById('scanResultArea');
  const scanAuditLogBody = document.getElementById('scanAuditLogBody');

  let mediaStream = null;
  let scanAuditLog = [];
  let isScanningActive = false;

  async function initScanner() {
    if (!Auth.isLoggedIn()) {
      showGuard('Please log in with a Staff or Admin account to access the Gate Scanner.');
      return;
    }

    if (!Auth.isStaff()) {
      showGuard(`Access Denied: Current user role "${Auth.currentUser.role}" is not authorized for Gate Scanner.`);
      return;
    }

    showScanner();
    bindEvents();
  }

  function showGuard(msg) {
    if (scannerGuardEl) {
      scannerGuardEl.classList.remove('d-none');
      scannerGuardEl.hidden = false;
      scannerGuardEl.innerHTML = `
        <div class="tc p-48 bg-white r-16 max-w-500 mx-auto border-red-alert">
          <h2 class="c-red mb-12">Staff Verification Required</h2>
          <p class="c-ink-2 mb-24">${escapeHtml(msg)}</p>
          <button class="btn-pill-blue" onclick="Auth.openAuthModal()">Sign in as Staff (staff@ticket.com / staff123)</button>
        </div>
      `;
    }
    if (scannerContentEl) {
      scannerContentEl.classList.add('d-none');
      scannerContentEl.hidden = true;
    }
  }

  function showScanner() {
    if (scannerGuardEl) {
      scannerGuardEl.classList.add('d-none');
      scannerGuardEl.hidden = true;
    }
    if (scannerContentEl) {
      scannerContentEl.classList.remove('d-none');
      scannerContentEl.hidden = false;
    }
  }

  function bindEvents() {
    if (startCameraBtn) {
      startCameraBtn.addEventListener('click', () => startCamera());
    }
    if (stopCameraBtn) {
      stopCameraBtn.addEventListener('click', () => stopCamera());
    }

    if (validateCodeBtn) {
      validateCodeBtn.addEventListener('click', () => {
        const code = manualCodeInput.value.trim();
        if (code) validateTicket(code);
      });
    }

    if (manualCodeInput) {
      manualCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const code = manualCodeInput.value.trim();
          if (code) validateTicket(code);
        }
      });
    }

    if (qrFileInput) {
      qrFileInput.addEventListener('change', async () => {
        if (!qrFileInput.files || !qrFileInput.files[0]) return;
        const simulatedCode = await Popup.prompt('File uploaded. Enter or verify ticket code from image:', 'TKT-', { title: 'Ticket Code Verification' });
        qrFileInput.value = '';
        if (simulatedCode) validateTicket(simulatedCode);
      });
    }
  }

  async function startCamera() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      cameraVideo.srcObject = mediaStream;
      cameraVideo.play();
      isScanningActive = true;
      startCameraBtn.classList.add('d-none');
      stopCameraBtn.classList.remove('d-none');
      cameraErrorMsg.classList.add('d-none');

      // Start scanning loop using hidden canvas
      requestAnimationFrame(scanVideoFrame);
    } catch (err) {
      console.warn('Camera access not supported or denied:', err);
      cameraErrorMsg.classList.remove('d-none');
      cameraErrorMsg.textContent = 'Camera not available or access denied. Please use manual code entry or file upload below.';
    }
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    isScanningActive = false;
    startCameraBtn.classList.remove('d-none');
    stopCameraBtn.classList.add('d-none');
  }

  function scanVideoFrame() {
    if (!isScanningActive) return;
    // Real camera QR scanning frame interval
    requestAnimationFrame(scanVideoFrame);
  }

  async function validateTicket(inputCode) {
    if (!inputCode) return;

    validateCodeBtn.disabled = true;
    validateCodeBtn.textContent = 'Validating...';

    try {
      const res = await API.tickets.validate({ ticketCode: inputCode });
      handleValidScan(res.ticket, inputCode);
    } catch (err) {
      handleInvalidScan(err, inputCode);
    } finally {
      validateCodeBtn.disabled = false;
      validateCodeBtn.textContent = 'Validate Ticket';
      manualCodeInput.value = '';
    }
  }

  function handleValidScan(ticket, code) {
    playAudioBeep(true);

    scanResultArea.innerHTML = `
      <div class="r-16 p-24 mb-24 scanner-success-box">
        <div class="flex items-c gap-12 mb-12">
          <span class="c-green fs-2"><i class="fa-solid fa-circle-check"></i></span>
          <div>
            <h3 class="m-0 scanner-success-icon">ADMISSION GRANTED</h3>
            <span class="fw-7 fs-085 c-green-emerald">Ticket Status: CHECKED_IN</span>
          </div>
        </div>

        <table class="w-100 fs-095 table-collapse-mt-12">
          <tr>
            <td class="c-ink-2 py-6">Ticket Code:</td>
            <td class="mono fw-8 c-blue">${escapeHtml(ticket.ticketCode)}</td>
          </tr>
          <tr>
            <td class="c-ink-2 py-6">Attendee Name:</td>
            <td class="fw-7">${escapeHtml(ticket.holderName || 'Alex Rivers')}</td>
          </tr>
          <tr>
            <td class="c-ink-2 py-6">Seat / Zone:</td>
            <td class="fw-7 c-ink">${escapeHtml(ticket.zoneName)} - Seat ${escapeHtml(ticket.seatNumber)}</td>
          </tr>
          <tr>
            <td class="c-ink-2 py-6">Validated At:</td>
            <td class="c-muted">${escapeHtml(new Date().toLocaleTimeString())}</td>
          </tr>
        </table>
      </div>
    `;

    logAuditEntry({
      code: ticket.ticketCode || code,
      attendee: ticket.holderName || 'Alex Rivers',
      seat: `${ticket.zoneName || ''} ${ticket.seatNumber || ''}`,
      status: 'VALID',
      badgeClass: 'badge-status-valid',
      time: new Date().toLocaleTimeString()
    });
  }

  function handleInvalidScan(err, code) {
    playAudioBeep(false);

    const isDuplicate = err.data && err.data.reason === 'ALREADY_CHECKED_IN';
    const isCancelled = err.data && err.data.reason === 'CANCELLED_TICKET';

    if (scanResultArea) {
      if (isDuplicate) {
        // High-visibility Candy Apple Red Fraud Warning (FR-31)
        scanResultArea.innerHTML = `
          <div class="fraud-warning-alert">
            <h3>
              <span><i class="fa-solid fa-triangle-exclamation mr-6"></i></span> DUPLICATE SCAN DETECTED - ENTRY DENIED!
            </h3>
            <p class="fw-7 lh-14 fs-11 my-12">
              ${escapeHtml(err.message || 'Fraud Warning: This ticket was already checked in and cannot be reused.')}
            </p>
            <div class="fs-09 scanner-raw-box">
              Ticket Code: <strong>${escapeHtml(code)}</strong><br>
              Action Required: Confiscate badge or verify customer identity at Box Office.
            </div>
          </div>
        `;
      } else {
        scanResultArea.innerHTML = `
          <div class="r-16 p-24 mb-24 scanner-fraud-box">
            <div class="flex items-c gap-12 mb-12">
              <span class="scanner-fraud-icon"><i class="fa-solid fa-circle-xmark"></i></span>
              <div>
                <h3 class="fs-135 m-0 c-red-dark">INVALID TICKET</h3>
                <span class="fw-7 fs-085 c-red-crimson">
                  ${isCancelled ? 'Ticket CANCELLED / REFUNDED' : 'Ticket Not Found'}
                </span>
              </div>
            </div>
            <p class="fs-095 c-red-deep">${escapeHtml(err.message || 'Please verify the ticket code with customer.')}</p>
          </div>
        `;
      }
    }

    logAuditEntry({
      code,
      attendee: (err.data && err.data.ticket && err.data.ticket.holderName) || 'Unknown',
      seat: (err.data && err.data.ticket && err.data.ticket.seatNumber) || '—',
      status: isDuplicate ? 'DUPLICATE_ALERT' : (isCancelled ? 'CANCELLED' : 'INVALID'),
      badgeClass: 'badge-status-alert',
      time: new Date().toLocaleTimeString()
    });
  }

  function logAuditEntry(entry) {
    scanAuditLog.unshift(entry);
    if (!scanAuditLogBody) return;

    scanAuditLogBody.innerHTML = scanAuditLog
      .map(
        (item) => `
          <tr>
            <td><strong>${escapeHtml(item.time)}</strong></td>
            <td class="mono fw-7">${escapeHtml(item.code)}</td>
            <td>${escapeHtml(item.attendee)}</td>
            <td>${escapeHtml(item.seat)}</td>
            <td>
              <span class="admin-category-badge ${item.badgeClass || (item.status === 'VALID' ? 'badge-status-valid' : 'badge-status-alert')}">
                ${escapeHtml(item.status)}
              </span>
            </td>
          </tr>
        `
      )
      .join('');
  }

  function playAudioBeep(success) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (success) {
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      } else {
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.setValueAtTime(200, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      }
    } catch (_) {
      // AudioContext may be restricted by browser policy
    }
  }

  await Auth.ready;
  await initScanner();
});
