/**
/**
 * TicketHub - Staff & Admin Operations Portal Controller (public/js/admin.js)
 * Consolidates Admin Dashboard, Gate Admission Scanner, and User & Role Management
 * into a unified 5-tab Operations Portal.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const adminGuardEl = document.getElementById('admin-guard');
  const adminContentEl = document.getElementById('admin-content');
  const portalRoleBadgeEl = document.getElementById('portal-role-badge');
  const portalSubtitleEl = document.getElementById('portal-subtitle');
  const portalTabsNavEl = document.getElementById('portal-tabs-nav');

  // KPI elements (Overview Tab)
  const kpiRevenueEl = document.getElementById('kpi-revenue');
  const kpiTicketsEl = document.getElementById('kpi-tickets');
  const kpiCheckedInEl = document.getElementById('kpi-checked-in');
  const kpiEventsEl = document.getElementById('kpi-events');
  const kpiAvailableSeatsEl = document.getElementById('kpi-available-seats');
  const kpiBookedSeatsEl = document.getElementById('kpi-booked-seats');
  const salesCanvas = document.getElementById('sales-chart');

  // Events & Seating Tab elements
  const adminEventsTableBody = document.getElementById('admin-events-table-body');
  const createEventBtn = document.getElementById('create-event-btn');

  // Scanner Tab elements
  const cameraVideo = document.getElementById('camera-video');
  const startCameraBtn = document.getElementById('start-camera-btn');
  const stopCameraBtn = document.getElementById('stop-camera-btn');
  const cameraErrorMsg = document.getElementById('camera-error-msg');
  const manualTicketCodeInput = document.getElementById('manual-ticket-code');
  const validateCodeBtn = document.getElementById('validate-code-btn');
  const qrFileInput = document.getElementById('qr-file-input');
  const scanResultArea = document.getElementById('scan-result-area');
  const scanAuditLogBody = document.getElementById('scan-audit-log-body');

  // User & Role Management Tab elements
  const userCountTotalEl = document.getElementById('user-count-total');
  const userCountAdminEl = document.getElementById('user-count-admin');
  const userCountStaffEl = document.getElementById('user-count-staff');
  const userCountCustomerEl = document.getElementById('user-count-customer');
  const roleTotalCountEl = document.getElementById('role-total-count');
  const roleAdminCountEl = document.getElementById('role-admin-count');
  const roleStaffCountEl = document.getElementById('role-staff-count');
  const roleCustomerCountEl = document.getElementById('role-customer-count');
  const userSearchInput = document.getElementById('user-search-input');
  const userRoleFilter = document.getElementById('user-role-filter');
  const adminUsersTableBody = document.getElementById('admin-users-table-body');
  const userResultsCountEl = document.getElementById('user-results-count');

  // Support & Backups Tab elements
  const adminSupportTableBody = document.getElementById('admin-support-table-body');
  const backupListEl = document.getElementById('backup-list');
  const createBackupBtn = document.getElementById('create-backup-btn');

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
        <div class="tc bg-white r-16 admin-guard-card">
          <span class="block mb-12 c-red fs-3"><i class="fa-solid fa-lock"></i></span>
          <h2 class="c-red mb-12">Operational Privileges Required</h2>
          <p class="c-ink-2 mb-24 lh-15">${msg}</p>
          <div class="flex gap-12 justify-c wrap">
            <button class="btn-pill-blue" onclick="Auth.openAuthModal()">Sign in with Staff/Admin Account</button>
            <a href="/home" class="btn-pill-outline no-ul p-10-20">Return Home</a>
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
        portalRoleBadgeEl.className = 'badge-pill-red admin-role-badge';
      } else {
        portalRoleBadgeEl.className = 'badge-pill-blue admin-role-badge';
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
      loadAuditTransactions();
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
      createEventBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/admin-event.html?mode=create';
      });
    }

    // Dynamic Filter Controls for Tab 2 Transaction Audit (FR-43)
    const tabAuditFilterEvent = document.getElementById('tab-audit-filter-event');
    const tabAuditFilterStatus = document.getElementById('tab-audit-filter-status');
    const tabAuditSearchInput = document.getElementById('tab-audit-search-input');

    if (tabAuditFilterEvent) {
      tabAuditFilterEvent.addEventListener('change', () => loadAuditTransactions());
    }
    if (tabAuditFilterStatus) {
      tabAuditFilterStatus.addEventListener('change', () => loadAuditTransactions());
    }
    if (tabAuditSearchInput) {
      tabAuditSearchInput.addEventListener('input', () => {
        clearTimeout(auditSearchDebounceTimer);
        auditSearchDebounceTimer = setTimeout(() => {
          loadAuditTransactions();
        }, 300);
      });
    }
  }

  async function loadEvents() {
    if (!adminEventsTableBody) return;
    try {
      const res = await API.events.list();
      const events = res.events || [];

      adminEventsTableBody.innerHTML = events
        .map((e) => {
          const avail = e.totalAvailableSeats ?? (e.availableSeats || 0);
          const held = e.totalHeldSeats ?? (e.heldSeats || 0);
          const booked = e.totalBookedSeats ?? (e.bookedSeats || 0);

          return `
            <tr>
              <td><strong>${escapeHtml(e.title)}</strong><br><small class="c-muted">${escapeHtml(e.id)}</small></td>
              <td>${escapeHtml(e.category)}</td>
              <td><span class="badge-pill-blue fs-075">${escapeHtml(e.status)}</span></td>
              <td>${escapeHtml(e.venue)}</td>
              <td class="nowrap">
                <div class="flex gap-4 wrap">
                  <span class="badge-seat-available c-white fs-072 fw-7 p-2-7 r-9999 bg-green" title="Available Seats">${avail} AVAILABLE</span>
                  <span class="badge-seat-held c-white fs-072 fw-7 p-2-7 r-9999 bg-amber" title="Held Seats">${held} HELD</span>
                  <span class="badge-seat-booked c-white fs-072 fw-7 p-2-7 r-9999 bg-muted" title="Booked Seats">${booked} BOOKED</span>
                </div>
              </td>
              <td>
                <button class="btn-info-event btn-pill-outline p-4-10 fs-08 mr-4 c-blue border-blue" data-id="${escapeHtml(e.id)}" title="Inspect Real-Time Inventory &amp; Booking Audit">
                  <i class="fa-solid fa-circle-info"></i> Info
                </button>
                <a href="/admin-event.html?id=${encodeURIComponent(e.id)}" class="btn-edit-event btn-pill-outline p-4-10 fs-08 mr-4 no-ul inline-block" data-id="${escapeHtml(e.id)}">Edit</a>
                <button class="btn-delete-event btn-pill-outline p-4-10 fs-08 c-red border-red" data-id="${escapeHtml(e.id)}" data-title="${(e.title || '').replace(/"/g, '&quot;')}">Delete</button>
              </td>
            </tr>
          `;
        })
        .join('');

      // Wire Info Buttons to Event Inspection Modal (FR-42)
      adminEventsTableBody.querySelectorAll('.btn-info-event').forEach((btn) => {
        btn.addEventListener('click', () => {
          openEventInspectionModal(btn.dataset.id);
        });
      });

      // Wire Delete Buttons to Confirmation Modal (FR-15)
      adminEventsTableBody.querySelectorAll('.btn-delete-event').forEach((btn) => {
        btn.addEventListener('click', () => {
          openDeleteEventModal(btn.dataset.id, btn.dataset.title || btn.dataset.id);
        });
      });

      // Populate Tab 2 Audit Event Filter Dropdown (FR-43)
      const tabAuditFilterEvent = document.getElementById('tab-audit-filter-event');
      if (tabAuditFilterEvent) {
        const currentVal = tabAuditFilterEvent.value;
        tabAuditFilterEvent.innerHTML = '<option value="">All Events</option>' +
          events.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title || e.id)} (${escapeHtml(e.id)})</option>`).join('');
        if (currentVal && events.some((e) => e.id === currentVal)) {
          tabAuditFilterEvent.value = currentVal;
        }
      }
    } catch (err) {
      console.error('Failed to load events in admin:', err);
    }
  }

  function openDeleteEventModal(eventId, eventTitle) {
    const existing = document.getElementById('admin-delete-event-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'admin-delete-event-modal';
    modal.className = 'modal-overlay admin-delete-event-modal';
    modal.innerHTML = `
      <div class="modal-content bg-white r-16 p-24 admin-delete-modal-card">
        <div class="modal-header flex between items-c mb-12">
          <h3 class="m-0 c-red"><i class="fa-solid fa-triangle-exclamation"></i> Permanently Delete Event</h3>
          <button class="modal-close-btn c-muted btn-icon-action" title="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <p class="fs-09 c-ink-3 mb-14">
            You are deleting <strong>${eventTitle}</strong> (<code>${eventId}</code>). Any paid bookings will be automatically cancelled and refunded (retaining the 40 THB service fee per ticket).
          </p>
          <form id="deleteEventPasswordForm">
            <div class="form-group mb-12">
              <label class="form-label">Type event title to confirm *</label>
              <input type="text" id="delConfirmTitle" class="form-control" required placeholder="${eventTitle}" autocomplete="off">
            </div>
            <div class="form-group mb-12">
              <label class="form-label">Administrator Password *</label>
              <input type="password" id="delAdminPassword" class="form-control" required placeholder="Enter admin password" autocomplete="current-password">
            </div>
            <div id="del-error-box" class="admin-delete-error admin-initially-hidden"></div>
            <div class="flex gap-10 mt-16 justify-end">
              <button type="button" class="btn-pill-outline modal-cancel-btn">Cancel</button>
              <button type="submit" id="confirmDeleteSubmitBtn" class="btn-pill-red">Permanently Delete</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close-btn').onclick = close;
    modal.querySelector('.modal-cancel-btn').onclick = close;

    modal.querySelector('#deleteEventPasswordForm').onsubmit = async (e) => {
      e.preventDefault();
      const typedTitle = modal.querySelector('#delConfirmTitle').value.trim();
      const password = modal.querySelector('#delAdminPassword').value;
      const errorBox = modal.querySelector('#del-error-box');
      const submitBtn = modal.querySelector('#confirmDeleteSubmitBtn');

      if (typedTitle !== eventTitle.trim()) {
        errorBox.textContent = 'Event title confirmation does not match.';
        errorBox.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Deleting...';
      errorBox.style.display = 'none';

      try {
        await API.events.delete(eventId, password);
        close();
        await loadEvents();
        await loadDashboardData();
      } catch (err) {
        errorBox.textContent = err.message || 'Failed to delete event.';
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Permanently Delete';
      }
    };
  }

  /**
   * =========================================================================
   * FR-42 & FR-43: Real-Time Event Inspection & Audit Management Helpers
   * =========================================================================
   */

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Unified Transaction Row Formatter (FR-43 / Ponytail Principle)
   * Reusable across both #inspect-tx-table-body and #tab-audit-table-body.
   * Outputs 7 standard columns:
   * 1. Booking / Ref
   * 2. Customer Details (name, id, email, phone)
   * 3. Event & Seats
   * 4. Payment Method
   * 5. Financial Breakdown (subtotal, discount, fee, total, refund)
   * 6. Status pills (booking & payment status)
   * 7. Date
   */
  function formatTransactionRow(tx) {
    if (!tx || typeof tx !== 'object') return '';

    const bookingId = tx.bookingId || tx.id || '-';
    const refCode = tx.referenceCode || '';
    const paymentId = tx.paymentId || '';

    // Customer fields (Sanitized Invariant)
    const customer = tx.customer || tx.user || {};
    const customerName = customer.name || tx.customerName || 'Anonymous Customer';
    const customerId = customer.id || tx.userId || '-';
    const customerEmail = customer.email || tx.customerEmail || '-';
    const customerPhone = customer.phone || tx.customerPhone || '';

    // Event & Seats
    const eventTitle = tx.eventTitle || tx.eventId || 'Unknown Event';
    const roundLabel = tx.roundLabel || '';
    const zoneName = tx.zoneName || '';
    const seats = Array.isArray(tx.seatNumbers) && tx.seatNumbers.length > 0
      ? tx.seatNumbers.join(', ')
      : (tx.seatsCount ? `${tx.seatsCount} Seats` : 'General / Unassigned');

    // Payment Method
    const method = tx.paymentMethod || 'UNPAID';

    // Financial Breakdown
    const subtotal = Number(tx.subtotal) || 0;
    const discount = Number(tx.discountAmount || tx.discount) || 0;
    const fee = Number(tx.serviceFee || tx.fee) || 0;
    const total = Number(tx.totalAmount || tx.total) || 0;
    const refund = Number(tx.refundAmount || tx.refund) || 0;

    // Status Badges
    const bkgStatus = (tx.bookingStatus || 'PENDING').toUpperCase();
    const bkgStatusClass = ({ PAID: 'paid', PENDING: 'pending', CANCELLED: 'cancelled' })[bkgStatus] || 'other';

    const payStatus = (tx.paymentStatus || (bkgStatus === 'PAID' ? 'SUCCESS' : 'PENDING')).toUpperCase();
    const payStatusClass = ({ SUCCESS: 'success', REFUNDED: 'refunded', PENDING: 'pending', FAILED: 'failed' })[payStatus] || 'other';

    // Date
    const rawDate = tx.paidAt || tx.createdAt || tx.date;
    const d = rawDate ? new Date(rawDate) : null;
    const dateFormatted = d && !isNaN(d.getTime())
      ? `${d.toLocaleDateString()} <small class="c-faint">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>`
      : '-';

    return `
      <tr>
        <!-- 1. Booking / Ref -->
        <td>
          <strong class="c-ink fs-085">${escapeHtml(bookingId)}</strong>
          ${refCode ? `<div class="fs-075 c-blue fw-7 mono mt-2">Ref: ${escapeHtml(refCode)}</div>` : ''}
          ${paymentId && paymentId !== bookingId ? `<div class="c-faint mono fs-07">Pay: ${escapeHtml(paymentId)}</div>` : ''}
        </td>

        <!-- 2. Customer Details -->
        <td>
          <strong class="c-ink fs-085">${escapeHtml(customerName)}</strong>
          <div class="fs-075 c-muted lh-14 mt-3">
            <div><i class="fa-solid fa-id-badge c-faint w-14"></i> <span class="mono">${escapeHtml(customerId)}</span></div>
            <div><i class="fa-solid fa-envelope c-faint w-14"></i> ${escapeHtml(customerEmail)}</div>
            ${customerPhone ? `<div><i class="fa-solid fa-phone c-faint w-14"></i> ${escapeHtml(customerPhone)}</div>` : ''}
          </div>
        </td>

        <!-- 3. Event & Seats -->
        <td>
          <strong class="c-ink fs-085">${escapeHtml(eventTitle)}</strong>
          ${roundLabel ? `<div class="fs-075 c-muted mt-2">${escapeHtml(roundLabel)}</div>` : ''}
          <div class="mt-4 flex gap-4 items-c wrap">
            ${zoneName ? `<span class="fs-072 c-ink-3 r-4 fw-6 badge-subtle">${escapeHtml(zoneName)}</span>` : ''}
            <span class="fs-078 fw-7 c-blue"><i class="fa-solid fa-chair mr-2"></i> ${escapeHtml(seats)}</span>
          </div>
        </td>

        <!-- 4. Payment Method -->
        <td>
          <span class="fs-078 fw-7 c-ink-3 inline-flex items-c gap-4 badge-code-subtle">
            <i class="fa-solid fa-credit-card c-blue"></i> ${escapeHtml(method)}
          </span>
        </td>

        <!-- 5. Financial Breakdown -->
        <td class="fs-08 lh-14">
          <div class="fw-8 c-ink fs-088">${total.toLocaleString()} THB</div>
          <div class="fs-072 c-muted mt-2">
            Subtotal: ${subtotal.toLocaleString()} THB
            ${discount > 0 ? `<br><span class="c-green fw-6">Discount: -${discount.toLocaleString()} THB</span>` : ''}
            <br>Fee: ${fee.toLocaleString()} THB
            ${refund > 0 ? `<br><span class="c-red fw-7">Refunded: ${refund.toLocaleString()} THB</span>` : ''}
          </div>
        </td>

        <!-- 6. Status Pills -->
        <td>
          <div class="flex gap-4 flex-col-start">
            <span class="admin-status-pill booking-status-${bkgStatusClass}">
              ${escapeHtml(bkgStatus)}
            </span>
            <span class="admin-status-pill payment-status-${payStatusClass}">
              Pay: ${escapeHtml(payStatus)}
            </span>
          </div>
        </td>

        <!-- 7. Date -->
        <td class="fs-078 c-ink-2 nowrap">
          ${dateFormatted}
        </td>
      </tr>
    `;
  }

  /**
   * Tab 2 Transaction Audit Loader (FR-43)
   * Reads filter inputs and queries API.admin.getTransactions(filters)
   */
  let auditSearchDebounceTimer = null;

  async function loadAuditTransactions() {
    const tbody = document.getElementById('tab-audit-table-body');
    if (!tbody) return;

    const eventFilter = document.getElementById('tab-audit-filter-event');
    const statusFilter = document.getElementById('tab-audit-filter-status');
    const searchInput = document.getElementById('tab-audit-search-input');
    const countEl = document.getElementById('tab-audit-count');

    const filters = {};
    if (eventFilter && eventFilter.value) filters.eventId = eventFilter.value;
    if (statusFilter && statusFilter.value) filters.status = statusFilter.value;
    if (searchInput && searchInput.value.trim()) filters.search = searchInput.value.trim();

    tbody.innerHTML = `<tr><td class="tc p-24 c-muted" colspan="7"><i class="fa-solid fa-spinner fa-spin mr-8"></i> Loading audit transactions...</td></tr>`;

    try {
      const res = await API.admin.getTransactions(filters);
      const transactions = (res && res.transactions) || [];

      if (countEl) {
        countEl.textContent = `${transactions.length} record${transactions.length === 1 ? '' : 's'}`;
      }

      if (transactions.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td class="tc c-muted p-32" colspan="7">
              <i class="fa-solid fa-receipt block mb-8 c-faint fs-15"></i>
              No transactions match the selected filters.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = transactions.map((tx) => formatTransactionRow(tx)).join('');
    } catch (err) {
      console.error('Failed to load audit transactions:', err);
      tbody.innerHTML = `<tr><td class="tc p-24 c-red" colspan="7">Failed to load transactions: ${escapeHtml(err.message || 'Server error')}</td></tr>`;
    }
  }

  /**
   * Real-Time Event Inspection Modal Controller (FR-42 & FR-43)
   * Displays seat inventory breakdown, KPI metrics, and event transactions.
   */
  let activeInspectModalEscHandler = null;
  let currentInspectedTransactions = [];

  async function openEventInspectionModal(eventId) {
    const modal = document.getElementById('event-inspect-modal');
    if (!modal) {
      console.warn('Event inspection modal element (#event-inspect-modal) not found in DOM.');
      return;
    }

    // Modal elements
    const titleEl = document.getElementById('inspect-event-title');
    const statusBadgeEl = document.getElementById('inspect-event-status-badge');
    const categoryBadgeEl = document.getElementById('inspect-event-category-badge');
    const metaEl = document.getElementById('inspect-event-meta');

    // KPI elements
    const kpiRevEl = document.getElementById('inspect-kpi-revenue');
    const kpiRefEl = document.getElementById('inspect-kpi-refunded');
    const kpiBkgEl = document.getElementById('inspect-kpi-bookings');
    const kpiBkgBreakdownEl = document.getElementById('inspect-kpi-bookings-breakdown');
    const kpiSeatsEl = document.getElementById('inspect-kpi-seats');
    const kpiSeatsBreakdownEl = document.getElementById('inspect-kpi-seats-breakdown');
    const kpiCheckInEl = document.getElementById('inspect-kpi-check-in');
    const kpiCheckInRateEl = document.getElementById('inspect-kpi-check-in-rate');

    // Round & Zone elements
    const roundSelectorWrap = document.getElementById('inspect-round-selector-wrap');
    const zoneTableBody = document.getElementById('inspect-zone-table-body');

    // Modal Transactions elements
    const txSearchInput = document.getElementById('inspect-tx-search');
    const txStatusFilter = document.getElementById('inspect-tx-status-filter');
    const txTableBody = document.getElementById('inspect-tx-table-body');

    // Footer & Sub-Tabs
    const editLink = document.getElementById('inspect-edit-event-link');
    const lastUpdatedEl = document.getElementById('inspect-modal-last-updated');
    const closeBtn = document.getElementById('inspect-modal-close-btn');
    const closeFooterBtn = document.getElementById('inspect-modal-close-footer-btn');
    const tabBtnInventory = document.getElementById('inspect-tab-btn-inventory');
    const tabBtnTransactions = document.getElementById('inspect-tab-btn-transactions');
    const paneInventory = document.getElementById('inspect-pane-inventory');
    const paneTransactions = document.getElementById('inspect-pane-transactions');

    // Display modal and lock body scrolling
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Reset sub-tabs to inventory view
    if (tabBtnInventory && tabBtnTransactions && paneInventory && paneTransactions) {
      tabBtnInventory.classList.add('active');
      tabBtnTransactions.classList.remove('active');
      tabBtnInventory.style.borderBottom = '3px solid #1D56CF';
      tabBtnInventory.style.color = '#ffffffff';
      tabBtnTransactions.style.borderBottom = 'none';
      tabBtnTransactions.style.color = '#4B5563';
      paneInventory.style.display = 'block';
      paneTransactions.style.display = 'none';
    }

    // Set loading placeholders
    if (zoneTableBody) {
      zoneTableBody.innerHTML = `<tr><td class="tc p-24 c-muted" colspan="7"><i class="fa-solid fa-spinner fa-spin mr-8"></i> Synchronizing real-time seat inventory...</td></tr>`;
    }
    if (txTableBody) {
      txTableBody.innerHTML = `<tr><td class="tc p-24 c-muted" colspan="7"><i class="fa-solid fa-spinner fa-spin mr-8"></i> Loading event transaction history...</td></tr>`;
    }

    // Define modal close handler
    const closeModal = () => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      if (activeInspectModalEscHandler) {
        document.removeEventListener('keydown', activeInspectModalEscHandler);
        activeInspectModalEscHandler = null;
      }
    };

    // Bind close triggers
    if (closeBtn) closeBtn.onclick = closeModal;
    if (closeFooterBtn) closeFooterBtn.onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    // ESC key listener
    if (activeInspectModalEscHandler) {
      document.removeEventListener('keydown', activeInspectModalEscHandler);
    }
    activeInspectModalEscHandler = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        closeModal();
      }
    };
    document.addEventListener('keydown', activeInspectModalEscHandler);

    // Sub-tab switching triggers
    if (tabBtnInventory) {
      tabBtnInventory.onclick = () => {
        tabBtnInventory.classList.add('active');
        tabBtnTransactions.classList.remove('active');
        tabBtnInventory.style.borderBottom = '3px solid #1D56CF';
        tabBtnInventory.style.color = '#ffffffff';
        tabBtnTransactions.style.borderBottom = 'none';
        tabBtnTransactions.style.color = '#4B5563';
        paneInventory.style.display = 'block';
        paneTransactions.style.display = 'none';
      };
    }
    if (tabBtnTransactions) {
      tabBtnTransactions.onclick = () => {
        tabBtnTransactions.classList.add('active');
        tabBtnInventory.classList.remove('active');
        tabBtnTransactions.style.borderBottom = '3px solid #1D56CF';
        tabBtnTransactions.style.color = '#ffffffff';
        tabBtnInventory.style.borderBottom = 'none';
        tabBtnInventory.style.color = '#4B5563';
        paneInventory.style.display = 'none';
        paneTransactions.style.display = 'block';
      };
    }

    try {
      const data = await API.admin.inspectEvent(eventId);
      const event = data.event || {};
      const summary = data.summary || data;
      const rounds = data.rounds || event.rounds || [];
      currentInspectedTransactions = data.transactions || [];

      // 1. Populate Header Metadata
      if (titleEl) titleEl.textContent = event.title || 'Event Inspection';
      if (statusBadgeEl) {
        statusBadgeEl.textContent = event.status || 'PUBLISHED';
        statusBadgeEl.className = event.status === 'PUBLISHED' ? 'badge-pill-blue' : 'badge-pill-outline';
      }
      if (categoryBadgeEl) {
        categoryBadgeEl.textContent = event.category || 'Event';
      }
      if (metaEl) {
        const venue = event.venue || 'Venue Not Set';
        const roundCount = rounds.length;
        metaEl.innerHTML = `<i class="fa-solid fa-location-dot mr-4 c-muted"></i> ${escapeHtml(venue)} &nbsp;•&nbsp; <i class="fa-solid fa-calendar-days mr-4 c-muted"></i> ${roundCount} Round${roundCount === 1 ? '' : 's'} &nbsp;•&nbsp; <i class="fa-solid fa-hashtag mr-4 c-muted"></i> <code class="c-blue">${escapeHtml(event.id || eventId)}</code>`;
      }

      // 2. Populate 5 KPI Cards
      if (kpiRevEl) kpiRevEl.textContent = `${(summary.totalRevenue || 0).toLocaleString()} THB`;
      if (kpiRefEl) kpiRefEl.textContent = `${(summary.totalRefunded || 0).toLocaleString()} THB`;
      if (kpiBkgEl) kpiBkgEl.textContent = (summary.totalBookings || 0).toLocaleString();
      if (kpiBkgBreakdownEl) {
        kpiBkgBreakdownEl.textContent = `${summary.paidBookingsCount || 0} Paid • ${summary.pendingBookingsCount || 0} Pending • ${summary.cancelledBookingsCount || 0} Cancelled`;
      }
      if (kpiSeatsEl) {
        kpiSeatsEl.textContent = `${(summary.availableSeats || 0).toLocaleString()} / ${(summary.totalSeats || 0).toLocaleString()} Avail`;
      }
      if (kpiSeatsBreakdownEl) {
        kpiSeatsBreakdownEl.textContent = `${summary.heldSeats || 0} Held • ${summary.bookedSeats || 0} Booked`;
      }
      if (kpiCheckInEl) {
        kpiCheckInEl.textContent = `${summary.ticketsCheckedIn || 0} / ${summary.ticketsIssued || 0}`;
      }
      if (kpiCheckInRateEl) {
        const checkInRate = summary.ticketsIssued > 0
          ? ((summary.ticketsCheckedIn / summary.ticketsIssued) * 100).toFixed(1)
          : '0.0';
        kpiCheckInRateEl.textContent = `${checkInRate}% Check-In Rate`;
      }

      // 3. Populate Round & Zone Breakdown
      let activeRoundIndex = 0;
      function renderZoneBreakdown() {
        if (!zoneTableBody) return;
        const currentRound = rounds[activeRoundIndex];
        const zones = (currentRound && currentRound.zones) || [];

        if (zones.length === 0) {
          zoneTableBody.innerHTML = `<tr><td class="tc p-24 c-muted" colspan="7">No zone seating configured for this round.</td></tr>`;
          return;
        }

        zoneTableBody.innerHTML = zones.map((z) => {
          const totalSeats = z.totalSeats || 0;
          const availSeats = z.availableSeats || 0;
          const heldSeats = z.heldSeats || 0;
          const bookedSeats = z.bookedSeats || 0;
          const price = Number(z.price || 0);
          const occupancyRate = totalSeats > 0 ? (((bookedSeats + heldSeats) / totalSeats) * 100).toFixed(1) : '0.0';
          const zoneColor = z.color || '#1D56CF';

          return `
            <tr>
              <td>
                <div class="flex items-c gap-8">
                  <span class="admin-zone-color-dot" style="background:${escapeHtml(zoneColor)};"></span>
                  <strong>${escapeHtml(z.zoneName || z.name || z.zoneId || 'Zone')}</strong>
                </div>
              </td>
              <td>${price.toLocaleString()} THB</td>
              <td><span class="c-green fw-7">${availSeats}</span></td>
              <td><span class="fw-7 c-amber">${heldSeats}</span></td>
              <td><span class="c-muted fw-7">${bookedSeats}</span></td>
              <td><strong>${totalSeats}</strong></td>
              <td>
                <div class="flex items-c gap-8">
                  <div class="flex-1 r-4 admin-occupancy-bar">
                    <div class="admin-occupancy-fill" style="width:${Math.min(100, Number(occupancyRate))}%;"></div>
                  </div>
                  <span class="fs-075 fw-7 c-ink-3 min-w-42">${occupancyRate}%</span>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }

      if (roundSelectorWrap) {
        if (rounds.length <= 1) {
          roundSelectorWrap.innerHTML = rounds[0]
            ? `<span class="fs-085 c-ink-2 fw-6"><i class="fa-solid fa-clock mr-4"></i> ${escapeHtml(rounds[0].label || `${rounds[0].date} ${rounds[0].time}`)}</span>`
            : '';
        } else {
          roundSelectorWrap.innerHTML = `
            <label class="fs-08 c-muted fw-6 mr-4">Round:</label>
            <select id="inspect-round-select" class="form-control fs-085 inline-block p-4-8-w-auto">
              ${rounds.map((r, idx) => `<option value="${idx}">${escapeHtml(r.label || `${r.date} ${r.time}`)}</option>`).join('')}
            </select>
          `;
          const roundSelect = document.getElementById('inspect-round-select');
          if (roundSelect) {
            roundSelect.addEventListener('change', (e) => {
              activeRoundIndex = Number(e.target.value) || 0;
              renderZoneBreakdown();
            });
          }
        }
      }
      renderZoneBreakdown();

      // 4. Modal Transactions Table & Real-Time Filtering
      function renderModalTransactions() {
        if (!txTableBody) return;
        const searchVal = txSearchInput ? txSearchInput.value.trim().toLowerCase() : '';
        const statusVal = txStatusFilter ? txStatusFilter.value.trim().toLowerCase() : '';

        let filtered = currentInspectedTransactions;
        if (statusVal && statusVal !== 'all') {
          filtered = filtered.filter((t) => {
            const bMatch = t.bookingStatus && t.bookingStatus.toLowerCase() === statusVal;
            const pMatch = t.paymentStatus && t.paymentStatus.toLowerCase() === statusVal;
            return Boolean(bMatch || pMatch);
          });
        }
        if (searchVal) {
          filtered = filtered.filter((t) => {
            const bkgMatch = t.bookingId && t.bookingId.toLowerCase().includes(searchVal);
            const refMatch = t.referenceCode && t.referenceCode.toLowerCase().includes(searchVal);
            const nameMatch = t.customerName && t.customerName.toLowerCase().includes(searchVal);
            const emailMatch = t.customerEmail && t.customerEmail.toLowerCase().includes(searchVal);
            const phoneMatch = t.customerPhone && t.customerPhone.toLowerCase().includes(searchVal);
            const seatMatch = (t.seatNumbers || []).some((sn) => String(sn).toLowerCase().includes(searchVal));
            return Boolean(bkgMatch || refMatch || nameMatch || emailMatch || phoneMatch || seatMatch);
          });
        }

        if (filtered.length === 0) {
          txTableBody.innerHTML = `<tr><td class="tc c-muted p-32" colspan="7"><i class="fa-solid fa-receipt block mb-8 c-faint fs-15"></i>No transactions found for this event.</td></tr>`;
          return;
        }

        txTableBody.innerHTML = filtered.map((tx) => formatTransactionRow(tx)).join('');
      }

      if (txSearchInput) {
        txSearchInput.value = '';
        txSearchInput.oninput = () => renderModalTransactions();
      }
      if (txStatusFilter) {
        txStatusFilter.value = '';
        txStatusFilter.onchange = () => renderModalTransactions();
      }
      renderModalTransactions();

      // 5. Update Footer Link and Timestamp
      if (editLink) {
        editLink.href = `/admin-event.html?id=${encodeURIComponent(event.id || eventId)}`;
      }
      if (lastUpdatedEl) {
        lastUpdatedEl.textContent = `Synchronized: ${new Date().toLocaleTimeString()}`;
      }

    } catch (err) {
      console.error('Failed to load event inspection data:', err);
      if (titleEl) titleEl.textContent = 'Inspection Error';
      if (zoneTableBody) {
        zoneTableBody.innerHTML = `<tr><td class="tc p-24 c-red" colspan="7">Failed to load event data: ${escapeHtml(err.message || 'Server error')}</td></tr>`;
      }
    }
  }

  // Expose inspection trigger to window for external/inline accessibility
  window.openEventInspectionModal = openEventInspectionModal;
  window.loadAuditTransactions = loadAuditTransactions;
  window.formatTransactionRow = formatTransactionRow;

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
              <td class="mono fw-8 c-blue">${ticket.ticketCode}</td>
            </tr>
            <tr>
              <td class="c-ink-2 py-6">Attendee Name:</td>
              <td class="fw-7">${ticket.holderName || 'Alex Rivers'}</td>
            </tr>
            <tr>
              <td class="c-ink-2 py-6">Seat / Zone:</td>
              <td class="fw-7 c-ink">${ticket.zoneName} - Seat ${ticket.seatNumber}</td>
            </tr>
            <tr>
              <td class="c-ink-2 py-6">Validated At:</td>
              <td class="c-muted">${new Date().toLocaleTimeString()}</td>
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
              <span><i class="fa-solid fa-triangle-exclamation mr-6"></i></span> DUPLICATE SCAN DETECTED - ENTRY DENIED!
            </h3>
            <p class="fw-7 lh-14 fs-11-my-12">
              ${err.message || 'Fraud Warning: This ticket was already checked in and cannot be reused.'}
            </p>
            <div class="fs-09 scanner-raw-box">
              Ticket Code: <strong>${code}</strong><br>
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
            <p class="fs-095 c-red-deep">${err.message || 'Please verify the ticket code with customer.'}</p>
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
            <td class="mono fw-7">${item.code}</td>
            <td>${item.attendee}</td>
            <td>${item.seat}</td>
            <td>
              <span class="admin-category-badge" style="--category-color: ${item.color};">
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
            <td class="tc c-muted p-32" colspan="6">
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
                <div class="flex items-c gap-10">
                  <div class="c-blue flex items-c justify-c fw-8 fs-085 admin-user-avatar-placeholder">
                    ${u.avatarUrl ? `<img class="w-100 admin-user-avatar-img" src="${u.avatarUrl}">` : initials}
                  </div>
                  <div>
                    <strong class="c-ink">${u.name || 'Anonymous User'}</strong>
                    ${isCurrentUser ? '<span class="c-white r-4 fw-7 badge-pill-danger-sm">YOU</span>' : ''}
                    <div class="fs-075 c-muted mono">${u.id}</div>
                  </div>
                </div>
              </td>
              <td>${u.email}</td>
              <td>${u.phone || '—'}</td>
              <td>
                <span class="fw-7 c-blue"><i class="fa-solid fa-star c-blue mr-2"></i> ${u.points || 0}</span>
              </td>
              <td>
                <select class="user-role-select form-control fs-085 fw-7 r-9999 btn-minw-120" data-user-id="${u.id}" data-current-role="${userRole}">
                  <option value="customer" ${userRole === 'customer' ? 'selected' : ''}>Customer</option>
                  <option value="staff" ${userRole === 'staff' ? 'selected' : ''}>Staff</option>
                  <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
              </td>
              <td>
                <span class="${roleBadgeClass} fs-075 r-9999 badge-pill-uppercase">
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
        adminSupportTableBody.innerHTML = `<tr><td class="tc c-muted p-18" colspan="6">No inquiries submitted yet.</td></tr>`;
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
                <span class="badge-pill-${t.status === 'RESOLVED' ? 'blue' : 'red'} fs-075">
                  ${t.status}
                </span>
              </td>
              <td>${(t.adminReply || '—').slice(0, 30)}...</td>
              <td>
                <button class="btn-reply-support btn-pill-outline p-4-10 fs-08" data-id="${t.id}">Reply</button>
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
      <div class="modal-content max-w-480">
        <div class="modal-header">
          <h3>Reply to Customer Inquiry</h3>
          <button class="modal-close-btn c-muted btn-icon-action" title="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Official Support Reply *</label>
            <textarea id="replyText" class="form-control" rows="4" placeholder="Enter resolution details..."></textarea>
          </div>
          <button id="sendReplyBtn" class="btn-pill-blue w-100 p-10">Send Reply &amp; Resolve</button>
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
        backupListEl.innerHTML = `<li class="c-muted p-12">No backups created yet.</li>`;
        return;
      }

      backupListEl.innerHTML = backups
        .map(
          (b) => `
            <li class="flex between items-c p-10-14-bb">
              <div>
                <strong>${b.backupId || b.id}</strong>
                <div class="fs-075 c-muted">${new Date(b.createdAt).toLocaleString()}</div>
              </div>
              <button class="btn-restore-backup btn-pill-outline fs-08 p-4-12" data-id="${b.backupId || b.id}">Restore</button>
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
