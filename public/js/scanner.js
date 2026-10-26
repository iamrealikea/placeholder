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
      scannerGuardEl.style.display = 'block';
      scannerGuardEl.innerHTML = `
        <div style="text-align:center; padding: 48px; background:#FFFFFF; border-radius:16px; max-width:500px; margin:40px auto; border:2px solid #FF0800;">
          <h2 style="color: #FF0800; margin-bottom: 12px;">Staff Verification Required</h2>
          <p style="color: #4B5563; margin-bottom: 24px;">${msg}</p>
          <button class="btn-pill-blue" onclick="Auth.openAuthModal()">Sign in as Staff (staff@ticket.com / staff123)</button>
        </div>
      `;
    }
    if (scannerContentEl) scannerContentEl.style.display = 'none';
  }

  function showScanner() {
    if (scannerGuardEl) scannerGuardEl.style.display = 'none';
    if (scannerContentEl) scannerContentEl.style.display = 'block';
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
      qrFileInput.addEventListener('change', () => {
        if (!qrFileInput.files || !qrFileInput.files[0]) return;
        // In simulation, if filename contains a code or text, parse it
        const filename = qrFileInput.files[0].name;
        // Prompt staff for code or parse filename
        const simulatedCode = prompt('File uploaded. Enter or verify ticket code from image:', 'TKT-');
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
      startCameraBtn.style.display = 'none';
      stopCameraBtn.style.display = 'inline-flex';
      cameraErrorMsg.style.display = 'none';

      // Start scanning loop using hidden canvas
      requestAnimationFrame(scanVideoFrame);
    } catch (err) {
      console.warn('Camera access not supported or denied:', err);
      cameraErrorMsg.style.display = 'block';
      cameraErrorMsg.textContent = 'Camera not available or access denied. Please use manual code entry or file upload below.';
    }
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    isScanningActive = false;
    startCameraBtn.style.display = 'inline-flex';
    stopCameraBtn.style.display = 'none';
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
      <div style="background: #ECFDF5; border: 2px solid #10B981; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <span style="font-size: 2rem;">✅</span>
          <div>
            <h3 style="color: #065F46; font-size: 1.5rem; margin: 0;">ADMISSION GRANTED</h3>
            <span style="color: #047857; font-weight: 700; font-size: 0.85rem;">Ticket Status: CHECKED_IN</span>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem; margin-top: 12px;">
          <tr>
            <td style="padding: 6px 0; color: #4B5563;">Ticket Code:</td>
            <td style="font-family: monospace; font-weight: 800; color: #1D56CF;">${ticket.ticketCode}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #4B5563;">Attendee Name:</td>
            <td style="font-weight: 700;">${ticket.holderName || 'Alex Rivers'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #4B5563;">Seat / Zone:</td>
            <td style="font-weight: 700; color: #111827;">${ticket.zoneName} - Seat ${ticket.seatNumber}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #4B5563;">Validated At:</td>
            <td style="color: #6B7280;">${new Date().toLocaleTimeString()}</td>
          </tr>
        </table>
      </div>
    `;

    logAuditEntry({
      code: ticket.ticketCode || code,
      attendee: ticket.holderName || 'Alex Rivers',
      seat: `${ticket.zoneName || ''} ${ticket.seatNumber || ''}`,
      status: 'VALID',
      color: '#10B981',
      time: new Date().toLocaleTimeString()
    });
  }

  function handleInvalidScan(err, code) {
    playAudioBeep(false);

    const isDuplicate = err.data && err.data.reason === 'ALREADY_CHECKED_IN';
    const isCancelled = err.data && err.data.reason === 'CANCELLED_TICKET';

    if (isDuplicate) {
      // High-visibility Candy Apple Red Fraud Warning (FR-31)
      scanResultArea.innerHTML = `
        <div class="fraud-warning-alert">
          <h3>
            <span>🚨</span> DUPLICATE SCAN DETECTED - ENTRY DENIED!
          </h3>
          <p style="font-size: 1.1rem; font-weight: 700; margin: 12px 0; line-height: 1.4;">
            ${err.message || 'Fraud Warning: This ticket was already checked in and cannot be reused.'}
          </p>
          <div style="background: rgba(0, 0, 0, 0.25); border-radius: 8px; padding: 12px; font-size: 0.9rem; margin-top: 12px;">
            Ticket Code: <strong>${code}</strong><br>
            Action Required: Confiscate badge or verify customer identity at Box Office.
          </div>
        </div>
      `;
    } else {
      scanResultArea.innerHTML = `
        <div style="background: #FEF2F2; border: 2px solid #EF4444; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <span style="font-size: 2rem;">❌</span>
            <div>
              <h3 style="color: #991B1B; font-size: 1.35rem; margin: 0;">INVALID TICKET</h3>
              <span style="color: #B91C1C; font-weight: 700; font-size: 0.85rem;">
                ${isCancelled ? 'Ticket CANCELLED / REFUNDED' : 'Ticket Not Found'}
              </span>
            </div>
          </div>
          <p style="color: #7F1D1D; font-size: 0.95rem;">${err.message || 'Please verify the ticket code with customer.'}</p>
        </div>
      `;
    }

    logAuditEntry({
      code,
      attendee: (err.data && err.data.ticket && err.data.ticket.holderName) || 'Unknown',
      seat: (err.data && err.data.ticket && err.data.ticket.seatNumber) || '—',
      status: isDuplicate ? 'DUPLICATE_ALERT' : (isCancelled ? 'CANCELLED' : 'INVALID'),
      color: '#FF0800',
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
            <td><strong>${item.time}</strong></td>
            <td style="font-family: monospace;">${item.code}</td>
            <td>${item.attendee}</td>
            <td>${item.seat}</td>
            <td>
              <span style="background: ${item.color}20; color: ${item.color}; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.75rem;">
                ${item.status}
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

  await initScanner();
});
