/**
/**
 * TicketHub - Staff & Admin Operations Portal Controller (public/js/admin.js)
 * Consolidates Admin Dashboard, Gate Admission Scanner, and User & Role Management
 * into a unified 5-tab Operations Portal.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const adminGuardEl = document.getElementById('adminGuard');
  const adminContentEl = document.getElementById('adminContent');
  const portalRoleBadgeEl = document.getElementById('portalRoleBadge');
  const portalSubtitleEl = document.getElementById('portalSubtitle');
  const portalTabsNavEl = document.getElementById('portalTabsNav');

  // KPI elements (Overview Tab)
  const kpiRevenueEl = document.getElementById('kpiRevenue');
  const kpiTicketsEl = document.getElementById('kpiTickets');
  const kpiCheckedInEl = document.getElementById('kpiCheckedIn');
  const kpiEventsEl = document.getElementById('kpiEvents');
  const kpiAvailableSeatsEl = document.getElementById('kpiAvailableSeats');
  const kpiBookedSeatsEl = document.getElementById('kpiBookedSeats');
  const salesCanvas = document.getElementById('salesChart');

  // Events & Seating Tab elements
  const adminEventsTableBody = document.getElementById('adminEventsTableBody');
  const createEventBtn = document.getElementById('createEventBtn');

  // Scanner Tab elements
  const cameraVideo = document.getElementById('cameraVideo');
  const startCameraBtn = document.getElementById('startCameraBtn');
  const stopCameraBtn = document.getElementById('stopCameraBtn');
  const cameraErrorMsg = document.getElementById('cameraErrorMsg');
  const manualTicketCodeInput = document.getElementById('manualTicketCode');
  const validateCodeBtn = document.getElementById('validateCodeBtn');
  const qrFileInput = document.getElementById('qrFileInput');
  const scanResultArea = document.getElementById('scanResultArea');
  const scanAuditLogBody = document.getElementById('scanAuditLogBody');

  // User & Role Management Tab elements
  const userCountTotalEl = document.getElementById('userCountTotal');
  const userCountAdminEl = document.getElementById('userCountAdmin');
  const userCountStaffEl = document.getElementById('userCountStaff');
  const userCountCustomerEl = document.getElementById('userCountCustomer');
  const roleTotalCountEl = document.getElementById('roleTotalCount');
  const roleAdminCountEl = document.getElementById('roleAdminCount');
  const roleStaffCountEl = document.getElementById('roleStaffCount');
  const roleCustomerCountEl = document.getElementById('roleCustomerCount');
  const userSearchInput = document.getElementById('userSearchInput');
  const userRoleFilter = document.getElementById('userRoleFilter');
  const adminUsersTableBody = document.getElementById('adminUsersTableBody');
  const userResultsCountEl = document.getElementById('userResultsCount');

  // Support & Backups Tab elements
  const adminSupportTableBody = document.getElementById('adminSupportTableBody');
  const backupListEl = document.getElementById('backupList');
  const createBackupBtn = document.getElementById('createBackupBtn');

  // Scanner state
  let mediaStream = null;
  let isScanningActive = false;
  let scanAuditLog = [];

  // Tab state
  let activeTabName = 'overview';
  let searchDebounceTimer = null;

  /**
   * Main Initialization & Access Guard
   */
  async function initPortal() {
    if (!Auth.currentUser) {
      await Auth.fetchCurrentUser();
    }

    if (!Auth.isLoggedIn()) {
      showGuard('Please log in with a Staff or Administrator account to access the Operations Portal.');
      return;
    }

    if (!Auth.isStaff()) {
      showGuard(`Access Denied: Current user role "${Auth.currentUser.role}" does not have staff or administrator operational privileges.`);
      return;
    }

    showPortalContent();
    setupRoleUI();
    setupTabNavigation();
    bindScannerEvents();
    bindUserManagementEvents();
    bindEventsTabEvents();
    bindBackupEvents();

    // Route to appropriate tab
    handleInitialTabRouting();
  }

  function showGuard(msg) {
    if (adminGuardEl) {
      adminGuardEl.style.display = 'block';
      adminGuardEl.innerHTML = `
        <div style="text-align:center; padding: 48px; background:#FFFFFF; border-radius:16px; max-width:540px; margin:40px auto; border:2px solid #FF0800; box-shadow: 0 10px 25px rgba(255, 8, 0, 0.1);">
          <span style="font-size: 3rem; display: block; margin-bottom: 12px;">🔒</span>
          <h2 style="color: #FF0800; margin-bottom: 12px;">Operational Privileges Required</h2>
          <p style="color: #4B5563; margin-bottom: 24px; line-height: 1.5;">${msg}</p>
          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <button class="btn-pill-blue" onclick="Auth.openAuthModal()">Sign in with Staff/Admin Account</button>
            <a href="/index.html" class="btn-pill-outline" style="text-decoration:none; padding:10px 20px;">Return Home</a>
          </div>
        </div>
      `;
    }
    if (adminContentEl) adminContentEl.style.display = 'none';
  }

  function showPortalContent() {
    if (adminGuardEl) adminGuardEl.style.display = 'none';
    if (adminContentEl) adminContentEl.style.display = 'block';
  }

  /**
   * Role-Aware UI Setup
   */
  function setupRoleUI() {
    const isUserAdmin = Auth.isAdmin();
    const currentRole = (Auth.currentUser.role || 'customer').toUpperCase();

    if (portalRoleBadgeEl) {
      portalRoleBadgeEl.textContent = currentRole;
      if (isUserAdmin) {
        portalRoleBadgeEl.className = 'badge-pill-red';
        portalRoleBadgeEl.style.cssText = 'font-size: 0.85rem; padding: 4px 14px; text-transform: uppercase; background: #FF0800; color: #FFFFFF; font-weight: 800;';
      } else {
        portalRoleBadgeEl.className = 'badge-pill-blue';
        portalRoleBadgeEl.style.cssText = 'font-size: 0.85rem; padding: 4px 14px; text-transform: uppercase; background: #1D56CF; color: #FFFFFF; font-weight: 800;';
      }
    }

    if (portalSubtitleEl) {
      if (isUserAdmin) {
        portalSubtitleEl.textContent = 'Real-time sales performance, seating layouts, user role administration, and operational management.';
      } else {
        portalSubtitleEl.textContent = 'Gate admission verification, attendee ticket check-in, and operational terminal.';
      }
    }

    // Role-based Tab Access Gating
    const allTabBtns = document.querySelectorAll('.portal-tab-btn');
    if (!isUserAdmin) {
      // Staff only has access to scanner tab; hide admin-only tabs
      allTabBtns.forEach((btn) => {
        if (btn.dataset.tab !== 'scanner') {
          btn.style.display = 'none';
        }
      });
    } else {
      allTabBtns.forEach((btn) => {
        btn.style.display = 'inline-flex';
      });
    }
  }

  /**
   * Tab Navigation & Query Parameter Routing
   */
  function setupTabNavigation() {
    const tabBtns = document.querySelectorAll('.portal-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });
  }

  function handleInitialTabRouting() {
    const urlParams = new URLSearchParams(window.location.search);
    const requestedTab = urlParams.get('tab');
    const isUserAdmin = Auth.isAdmin();

    if (!isUserAdmin) {
      // Staff always goes to scanner
      switchTab('scanner', false);
      return;
    }

    if (requestedTab && ['overview', 'events', 'scanner', 'roles', 'support'].includes(requestedTab)) {
      switchTab(requestedTab, false);
    } else {
      switchTab('overview', false);
    }
  }

  function switchTab(tabName, updateHistory = true) {
    const isUserAdmin = Auth.isAdmin();

    // Staff guard: staff can ONLY access 'scanner' tab
    if (!isUserAdmin && tabName !== 'scanner') {
      tabName = 'scanner';
    }

    // Stop camera stream when leaving scanner tab
    if (activeTabName === 'scanner' && tabName !== 'scanner') {
      stopCamera();
    }

    activeTabName = tabName;

    // Update active tab button style
    document.querySelectorAll('.portal-tab-btn').forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      if (isActive) {
        btn.classList.add('active');
        btn.style.background = '#1D56CF';
        btn.style.color = '#FFFFFF';
        btn.style.borderColor = '#1D56CF';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = '#4B5563';
        btn.style.borderColor = '#D1D5DB';
      }
    });

    // Update tab panes display
    document.querySelectorAll('.portal-tab-pane').forEach((pane) => {
      if (pane.dataset.tabContent === tabName) {
        pane.classList.add('active');
        pane.style.display = 'block';
      } else {
        pane.classList.remove('active');
        pane.style.display = 'none';
      }
    });

    // Update URL query parameter
    if (updateHistory) {
      window.history.replaceState({}, '', `?tab=${tabName}`);
    }

    // Tab-specific data loading
    if (tabName === 'overview' && isUserAdmin) {
      loadDashboardData();
    } else if (tabName === 'events' && isUserAdmin) {
      loadEvents();
    } else if (tabName === 'roles' && isUserAdmin) {
      loadUsers();
    } else if (tabName === 'support' && isUserAdmin) {
      loadSupportTickets();
      loadBackups();
    }
  }

  /**
   * =========================================================================
   * TAB 1: Overview & Analytics Data Loader & Canvas Chart
   * =========================================================================
   */
  async function loadDashboardData() {
    try {
      const data = await API.admin.getDashboard();
      const kpis = data.kpis || {};

      if (kpiRevenueEl) kpiRevenueEl.textContent = `${(kpis.totalRevenue || 0).toLocaleString()} THB`;
      if (kpiTicketsEl) kpiTicketsEl.textContent = (kpis.totalTicketsSold || 0).toLocaleString();
      if (kpiCheckedInEl) kpiCheckedInEl.textContent = (kpis.totalCheckedIn || 0).toLocaleString();
      if (kpiEventsEl) kpiEventsEl.textContent = (kpis.totalEvents || 0).toLocaleString();
      if (kpiAvailableSeatsEl) kpiAvailableSeatsEl.textContent = (kpis.availableSeats || 0).toLocaleString();
      if (kpiBookedSeatsEl) kpiBookedSeatsEl.textContent = (kpis.bookedSeats || 0).toLocaleString();

      if (salesCanvas && data.monthlySalesChart) {
        drawSalesChart(salesCanvas, data.monthlySalesChart);
      }
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
    }
  }

  function drawSalesChart(canvas, chartData) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const labels = chartData.labels || [];
    const revenue = chartData.revenue || [];
    const ticketCounts = chartData.ticketCounts || [];

    const padding = { top: 40, right: 60, bottom: 40, left: 70 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxRev = Math.max(...revenue, 350000);
    const maxTkt = Math.max(...ticketCounts, 100);

    // Draw horizontal grid lines & Y-axis labels
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6B7280';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';

    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padding.top + (chartH / gridSteps) * i;
      const val = Math.round(maxRev - (maxRev / gridSteps) * i);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.fillText(`${(val / 1000).toFixed(0)}k THB`, padding.left - 10, y + 4);
    }

    const barWidth = (chartW / labels.length) * 0.45;
    const stepX = chartW / labels.length;

    // Draw Revenue Bars (Monday Blue #1D56CF)
    for (let i = 0; i < labels.length; i++) {
      const x = padding.left + i * stepX + (stepX - barWidth) / 2;
      const barH = (revenue[i] / maxRev) * chartH;
      const y = padding.top + chartH - barH;

      ctx.fillStyle = '#1D56CF';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]) : ctx.fillRect(x, y, barWidth, barH);
      ctx.fill();

      // X-Axis labels
      ctx.fillStyle = '#4B5563';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barWidth / 2, height - padding.bottom + 18);
    }

    // Draw Tickets Sold Line (Candy Apple #FF0800)
    ctx.strokeStyle = '#FF0800';
    ctx.lineWidth = 3;
    ctx.beginPath();

    const points = [];
    for (let i = 0; i < labels.length; i++) {
      const x = padding.left + i * stepX + stepX / 2;
      const lineH = (ticketCounts[i] / maxTkt) * chartH;
      const y = padding.top + chartH - lineH;
      points.push({ x, y, count: ticketCounts[i] });

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw dots on line
    for (const p of points) {
      ctx.fillStyle = '#FF0800';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Legend
    ctx.fillStyle = '#1D56CF';
    ctx.fillRect(width - 240, 16, 14, 14);
    ctx.fillStyle = '#111827';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Monthly Revenue (THB)', width - 220, 28);

    ctx.fillStyle = '#FF0800';
    ctx.fillRect(width - 90, 16, 14, 14);
    ctx.fillStyle = '#111827';
    ctx.fillText('Tickets', width - 70, 28);
  }

  /**
   * =========================================================================
   * TAB 2: Events & Seating CRUD Management
   * =========================================================================
   */
  function bindEventsTabEvents() {
    if (createEventBtn) {
      createEventBtn.addEventListener('click', () => openCreateEventModal());
    }
  }

  async function loadEvents() {
    if (!adminEventsTableBody) return;
    try {
      const res = await API.events.list();
      const events = res.events || [];

      adminEventsTableBody.innerHTML = events
        .map(
          (e) => `
            <tr>
              <td><strong>${e.title}</strong><br><small style="color:#6B7280;">${e.id}</small></td>
              <td>${e.category}</td>
              <td><span class="badge-pill-blue" style="font-size:0.75rem;">${e.status}</span></td>
              <td>${e.venue}</td>
              <td>${e.totalAvailableSeats || 0}</td>
              <td>
                <button class="btn-edit-zones btn-pill-outline" data-id="${e.id}" style="padding:4px 10px; font-size:0.8rem; margin-right:4px;">Seating</button>
                <button class="btn-delete-event btn-pill-outline" data-id="${e.id}" style="padding:4px 10px; font-size:0.8rem; color:#FF0800; border-color:#FF0800;">Delete</button>
              </td>
            </tr>
          `
        )
        .join('');

      adminEventsTableBody.querySelectorAll('.btn-edit-zones').forEach((btn) => {
        btn.addEventListener('click', () => openSeatingModal(btn.dataset.id));
      });

      adminEventsTableBody.querySelectorAll('.btn-delete-event').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (confirm('Delete this event? All associated data will be removed.')) {
            try {
              await API.events.delete(btn.dataset.id);
              alert('Event deleted');
              await loadEvents();
              await loadDashboardData();
            } catch (err) {
              alert(err.message || 'Cannot delete event');
            }
          }
        });
      });
    } catch (err) {
      console.error('Failed to load events in admin:', err);
    }
  }

  function openCreateEventModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h3>Create New Event</h3>
          <button class="modal-close-btn" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">✕</button>
        </div>
        <div class="modal-body">
          <form id="createEventForm">
            <div class="form-group">
              <label class="form-label">Event Title *</label>
              <input type="text" id="ceTitle" class="form-control" required placeholder="Symphony of Lights">
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
              <div class="form-group">
                <label class="form-label">Artist / Performer</label>
                <input type="text" id="ceArtist" class="form-control" placeholder="Orchestra">
              </div>
              <div class="form-group">
                <label class="form-label">Category</label>
                <select id="ceCategory" class="form-control">
                  <option value="Concert">Concert</option>
                  <option value="Seminar">Seminar</option>
                  <option value="Festival">Festival</option>
                  <option value="Exhibition">Exhibition</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Venue *</label>
              <input type="text" id="ceVenue" class="form-control" required placeholder="Impact Arena">
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea id="ceDesc" class="form-control" rows="3"></textarea>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
              <div class="form-group">
                <label class="form-label">Show Date</label>
                <input type="date" id="ceDate" class="form-control" value="2026-11-20">
              </div>
              <div class="form-group">
                <label class="form-label">Show Time</label>
                <input type="time" id="ceTime" class="form-control" value="19:00">
              </div>
            </div>
            <button type="submit" class="btn-pill-blue" style="width:100%; margin-top:12px; padding:12px;">Create Event</button>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('.modal-close-btn').onclick = () => modal.remove();

    modal.querySelector('#createEventForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const title = modal.querySelector('#ceTitle').value;
        const artist = modal.querySelector('#ceArtist').value;
        const category = modal.querySelector('#ceCategory').value;
        const venue = modal.querySelector('#ceVenue').value;
        const description = modal.querySelector('#ceDesc').value;
        const date = modal.querySelector('#ceDate').value;
        const time = modal.querySelector('#ceTime').value;

        const rounds = [{ id: 'rnd-1', date, time, label: 'Standard Round' }];
        const zones = [
          { id: 'zone-vip', name: 'VIP Zone', color: '#FF0800', price: 3500, rows: 2, cols: 6 },
          { id: 'zone-a', name: 'Zone A', color: '#1D56CF', price: 2000, rows: 3, cols: 6 }
        ];

        await API.events.create({
          title,
          artist,
          category,
          status: 'On Sale',
          venue,
          description,
          rounds,
          zones,
          organizer: 'TicketHub Admin',
          saleStartAt: new Date().toISOString(),
          saleEndAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
        });

        alert('Event created successfully!');
        modal.remove();
        await loadEvents();
        await loadDashboardData();
      } catch (err) {
        alert(err.message || 'Error creating event');
      }
    };
  }

  function openSeatingModal(eventId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h3>Configure Zones &amp; Pricing</h3>
          <button class="modal-close-btn" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:0.85rem; color:#6B7280; margin-bottom:16px;">
            Update zone prices and dimensions for event <strong>${eventId}</strong>:
          </p>
          <div class="form-group">
            <label class="form-label">VIP Zone Price (THB)</label>
            <input type="number" id="zoneVipPrice" class="form-control" value="3800">
          </div>
          <div class="form-group">
            <label class="form-label">Zone A Price (THB)</label>
            <input type="number" id="zoneAPrice" class="form-control" value="2500">
          </div>
          <div class="form-group">
            <label class="form-label">Zone B Price (THB)</label>
            <input type="number" id="zoneBPrice" class="form-control" value="1500">
          </div>
          <button id="saveZonesBtn" class="btn-pill-blue" style="width:100%; margin-top:12px; padding:12px;">Save &amp; Regenerate Matrix</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('.modal-close-btn').onclick = () => modal.remove();

    modal.querySelector('#saveZonesBtn').onclick = async () => {
      try {
        const vipPrice = Number(modal.querySelector('#zoneVipPrice').value);
        const aPrice = Number(modal.querySelector('#zoneAPrice').value);
        const bPrice = Number(modal.querySelector('#zoneBPrice').value);

        const zones = [
          { id: 'zone-vip', name: 'VIP Zone', color: '#FF0800', price: vipPrice, rows: 2, cols: 6 },
          { id: 'zone-a', name: 'Zone A', color: '#1D56CF', price: aPrice, rows: 3, cols: 6 },
          { id: 'zone-b', name: 'Zone B', color: '#0D9488', price: bPrice, rows: 3, cols: 6 }
        ];

        await API.admin.updateSeating(eventId, { zones });
        alert('Seating plan updated successfully!');
        modal.remove();
        await loadEvents();
        await loadDashboardData();
      } catch (err) {
        alert(err.message || 'Error updating seating');
      }
    };
  }

  /**
   * =========================================================================
   * TAB 3: Embedded Gate Admission Scanner (Staff & Admin)
   * =========================================================================
   */
  function bindScannerEvents() {
    if (startCameraBtn) {
      startCameraBtn.addEventListener('click', () => startCamera());
    }
    if (stopCameraBtn) {
      stopCameraBtn.addEventListener('click', () => stopCamera());
    }

    if (validateCodeBtn) {
      validateCodeBtn.addEventListener('click', () => {
        const code = manualTicketCodeInput ? manualTicketCodeInput.value.trim() : '';
        if (code) validateTicket(code);
      });
    }

    if (manualTicketCodeInput) {
      manualTicketCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const code = manualTicketCodeInput.value.trim();
          if (code) validateTicket(code);
        }
      });
    }

    if (qrFileInput) {
      qrFileInput.addEventListener('change', () => {
        if (!qrFileInput.files || !qrFileInput.files[0]) return;
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
      if (cameraVideo) {
        cameraVideo.srcObject = mediaStream;
        cameraVideo.play();
      }
      isScanningActive = true;
      if (startCameraBtn) startCameraBtn.style.display = 'none';
      if (stopCameraBtn) stopCameraBtn.style.display = 'inline-flex';
      if (cameraErrorMsg) cameraErrorMsg.style.display = 'none';

      requestAnimationFrame(scanVideoFrame);
    } catch (err) {
      console.warn('Camera access not supported or denied:', err);
      if (cameraErrorMsg) {
        cameraErrorMsg.style.display = 'block';
        cameraErrorMsg.textContent = 'Camera not available or access denied. Please use manual code entry or file upload below.';
      }
    }
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    isScanningActive = false;
    if (startCameraBtn) startCameraBtn.style.display = 'inline-flex';
    if (stopCameraBtn) stopCameraBtn.style.display = 'none';
  }

  function scanVideoFrame() {
    if (!isScanningActive) return;
    requestAnimationFrame(scanVideoFrame);
  }

  async function validateTicket(inputCode) {
    if (!inputCode) return;

    if (validateCodeBtn) {
      validateCodeBtn.disabled = true;
      validateCodeBtn.textContent = 'Validating...';
    }

    try {
      const res = API.tickets.validateTicket
        ? await API.tickets.validateTicket(inputCode)
        : await API.tickets.validate({ ticketCode: inputCode });
      handleValidScan(res.ticket, inputCode);
    } catch (err) {
      handleInvalidScan(err, inputCode);
    } finally {
      if (validateCodeBtn) {
        validateCodeBtn.disabled = false;
        validateCodeBtn.textContent = 'Validate Ticket';
      }
      if (manualTicketCodeInput) {
        manualTicketCodeInput.value = '';
      }
    }
  }

  function handleValidScan(ticket, code) {
    playAudioBeep(true);

    if (scanResultArea) {
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
    }

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

    if (scanResultArea) {
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
            <td style="font-family: monospace; font-weight:700;">${item.code}</td>
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
      // Browser autoplay restriction handling
    }
  }

  /**
   * =========================================================================
   * TAB 4: User & Role Management (Admin Only)
   * =========================================================================
   */
  function bindUserManagementEvents() {
    if (userSearchInput) {
      userSearchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          loadUsers();
        }, 300);
      });
    }

    if (userRoleFilter) {
      userRoleFilter.addEventListener('change', () => {
        loadUsers();
      });
    }
  }

  async function loadUsers() {
    if (!adminUsersTableBody) return;

    try {
      const search = (userSearchInput?.value || '').trim();
      const role = (userRoleFilter?.value || 'all').trim();

      const params = {};
      if (search) params.search = search;
      if (role && role !== 'all') params.role = role;

      const data = await API.admin.getUsers(params);
      const counts = data.counts || {};
      const users = data.users || [];

      // Update counters
      const total = counts.total || 0;
      const admin = counts.admin || 0;
      const staff = counts.staff || 0;
      const customer = counts.customer || 0;

      if (userCountTotalEl) userCountTotalEl.textContent = total;
      if (userCountAdminEl) userCountAdminEl.textContent = admin;
      if (userCountStaffEl) userCountStaffEl.textContent = staff;
      if (userCountCustomerEl) userCountCustomerEl.textContent = customer;

      if (roleTotalCountEl) roleTotalCountEl.textContent = total;
      if (roleAdminCountEl) roleAdminCountEl.textContent = admin;
      if (roleStaffCountEl) roleStaffCountEl.textContent = staff;
      if (roleCustomerCountEl) roleCustomerCountEl.textContent = customer;

      if (userResultsCountEl) {
        userResultsCountEl.textContent = `Showing ${users.length} of ${total} users`;
      }

      if (users.length === 0) {
        adminUsersTableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:32px; color:#6B7280;">
              No users found matching current search/filter criteria.
            </td>
          </tr>
        `;
        return;
      }

      adminUsersTableBody.innerHTML = users
        .map((u) => {
          const isCurrentUser = Auth.currentUser && Auth.currentUser.id === u.id;
          const userRole = (u.role || 'customer').toLowerCase();
          const roleBadgeClass = userRole === 'admin' ? 'badge-pill-red' : (userRole === 'staff' ? 'badge-pill-blue' : 'badge-pill-outline');
          const initials = (u.name || 'U').slice(0, 2).toUpperCase();

          return `
            <tr data-user-row="${u.id}">
              <td>
                <div style="display:flex; align-items:center; gap:10px;">
                  <div style="width:36px; height:36px; border-radius:50%; background:#EBF1FD; color:#1D56CF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; flex-shrink:0;">
                    ${u.avatarUrl ? `<img src="${u.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : initials}
                  </div>
                  <div>
                    <strong style="color:#111827;">${u.name || 'Anonymous User'}</strong>
                    ${isCurrentUser ? '<span style="font-size:0.7rem; background:#FF0800; color:#FFFFFF; padding:2px 6px; border-radius:4px; margin-left:6px; font-weight:700;">YOU</span>' : ''}
                    <div style="font-size:0.75rem; color:#6B7280; font-family:monospace;">${u.id}</div>
                  </div>
                </div>
              </td>
              <td>${u.email}</td>
              <td>${u.phone || '—'}</td>
              <td>
                <span style="font-weight:700; color:#1D56CF;">★ ${u.points || 0}</span>
              </td>
              <td>
                <select class="user-role-select form-control" data-user-id="${u.id}" data-current-role="${userRole}" style="padding:6px 12px; font-size:0.85rem; font-weight:700; border-radius:9999px; min-width:120px;">
                  <option value="customer" ${userRole === 'customer' ? 'selected' : ''}>Customer</option>
                  <option value="staff" ${userRole === 'staff' ? 'selected' : ''}>Staff</option>
                  <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
              </td>
              <td>
                <span class="${roleBadgeClass}" style="font-size:0.75rem; padding:3px 10px; border-radius:9999px; text-transform:uppercase;">
                  ${userRole}
                </span>
              </td>
            </tr>
          `;
        })
        .join('');

      // Bind role change selectors
      adminUsersTableBody.querySelectorAll('.user-role-select').forEach((select) => {
        select.addEventListener('change', async (e) => {
          const newRole = e.target.value;
          const previousRole = e.target.dataset.currentRole || 'customer';
          const targetUserId = e.target.dataset.userId;

          // Client-side self-demotion guard
          if (Auth.currentUser && targetUserId === Auth.currentUser.id && newRole !== 'admin') {
            alert('Cannot demote your own currently active administrator account.');
            e.target.value = previousRole;
            return;
          }

          const confirmed = confirm(`Are you sure you want to change the role of this user to "${newRole.toUpperCase()}"?`);
          if (!confirmed) {
            e.target.value = previousRole;
            return;
          }

          try {
            const res = await API.admin.updateUserRole(targetUserId, { role: newRole });
            e.target.dataset.currentRole = newRole;
            alert(res.message || `User role updated to ${newRole}.`);
            await loadUsers();
          } catch (err) {
            alert(err.message || 'Failed to update user role.');
            e.target.value = previousRole;
          }
        });
      });
    } catch (err) {
      console.error('Failed to load users in admin:', err);
    }
  }

  /**
   * =========================================================================
   * TAB 5: Support & Backups Management (Admin Only)
   * =========================================================================
   */
  async function loadSupportTickets() {
    if (!adminSupportTableBody) return;
    try {
      const res = await API.support.getAll();
      const list = res.tickets || [];

      if (list.length === 0) {
        adminSupportTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:18px; color:#6B7280;">No inquiries submitted yet.</td></tr>`;
        return;
      }

      adminSupportTableBody.innerHTML = list
        .map(
          (t) => `
            <tr>
              <td><strong>${t.subject}</strong></td>
              <td>${t.name} (${t.email})</td>
              <td>${t.category}</td>
              <td>
                <span class="badge-pill-${t.status === 'RESOLVED' ? 'blue' : 'red'}" style="font-size:0.75rem;">
                  ${t.status}
                </span>
              </td>
              <td>${(t.adminReply || '—').slice(0, 30)}...</td>
              <td>
                <button class="btn-reply-support btn-pill-outline" data-id="${t.id}" style="padding:4px 10px; font-size:0.8rem;">Reply</button>
              </td>
            </tr>
          `
        )
        .join('');

      adminSupportTableBody.querySelectorAll('.btn-reply-support').forEach((btn) => {
        btn.addEventListener('click', () => openSupportReplyModal(btn.dataset.id));
      });
    } catch (err) {
      console.error('Failed to load support inquiries in admin:', err);
    }
  }

  function openSupportReplyModal(ticketId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 480px;">
        <div class="modal-header">
          <h3>Reply to Customer Inquiry</h3>
          <button class="modal-close-btn" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Official Support Reply *</label>
            <textarea id="replyText" class="form-control" rows="4" placeholder="Enter resolution details..."></textarea>
          </div>
          <button id="sendReplyBtn" class="btn-pill-blue" style="width:100%; padding:10px;">Send Reply &amp; Resolve</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-close-btn').onclick = () => modal.remove();

    modal.querySelector('#sendReplyBtn').onclick = async () => {
      const reply = modal.querySelector('#replyText').value.trim();
      if (!reply) return alert('Reply cannot be empty');
      try {
        await API.support.reply(ticketId, { reply });
        alert('Reply sent to customer and ticket resolved.');
        modal.remove();
        await loadSupportTickets();
      } catch (err) {
        alert(err.message || 'Error replying');
      }
    };
  }

  function bindBackupEvents() {
    if (createBackupBtn) {
      createBackupBtn.addEventListener('click', async () => {
        try {
          await API.admin.createBackup({ label: 'manual_admin' });
          alert('System data snapshot created!');
          await loadBackups();
        } catch (err) {
          alert(err.message || 'Failed to create backup');
        }
      });
    }
  }

  async function loadBackups() {
    if (!backupListEl) return;
    try {
      const res = await API.admin.getBackups();
      const backups = res.backups || [];

      if (backups.length === 0) {
        backupListEl.innerHTML = `<li style="padding:12px; color:#6B7280;">No backups created yet.</li>`;
        return;
      }

      backupListEl.innerHTML = backups
        .map(
          (b) => `
            <li style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-bottom:1px solid #E5E7EB;">
              <div>
                <strong>${b.backupId || b.id}</strong>
                <div style="font-size:0.75rem; color:#6B7280;">${new Date(b.createdAt).toLocaleString()}</div>
              </div>
              <button class="btn-restore-backup btn-pill-outline" data-id="${b.backupId || b.id}" style="padding:4px 12px; font-size:0.8rem;">Restore</button>
            </li>
          `
        )
        .join('');

      backupListEl.querySelectorAll('.btn-restore-backup').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (confirm(`Restore system state to snapshot ${btn.dataset.id}?`)) {
            try {
              await API.admin.restoreBackup({ backupId: btn.dataset.id });
              alert('System successfully restored from snapshot!');
              window.location.reload();
            } catch (err) {
              alert(err.message || 'Restore failed');
            }
          }
        });
      });
    } catch (err) {
      console.error('Failed to load backups:', err);
    }
  }

  // Initialize Operations Portal
  await initPortal();
});
