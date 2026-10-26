/**
 * TicketHub - Admin Dashboard Controller (public/js/admin.js)
 * Implements HTML5 <canvas> 12-month sales chart, KPI metrics, Event CRUD,
 * Seating layout updates, Support ticket replies, and JSON backup/restore.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const adminGuardEl = document.getElementById('adminGuard');
  const adminContentEl = document.getElementById('adminContent');

  // KPI elements
  const kpiRevenueEl = document.getElementById('kpiRevenue');
  const kpiTicketsEl = document.getElementById('kpiTickets');
  const kpiCheckedInEl = document.getElementById('kpiCheckedIn');
  const kpiEventsEl = document.getElementById('kpiEvents');
  const kpiAvailableSeatsEl = document.getElementById('kpiAvailableSeats');
  const kpiBookedSeatsEl = document.getElementById('kpiBookedSeats');

  // Canvas
  const salesCanvas = document.getElementById('salesChart');

  // Event list table
  const adminEventsTableBody = document.getElementById('adminEventsTableBody');
  const createEventBtn = document.getElementById('createEventBtn');

  // Support inquiries table
  const adminSupportTableBody = document.getElementById('adminSupportTableBody');

  // Backup & Restore
  const backupListEl = document.getElementById('backupList');
  const createBackupBtn = document.getElementById('createBackupBtn');

  async function initAdmin() {
    if (!Auth.isLoggedIn()) {
      showGuard('Please log in with an administrator account.');
      return;
    }

    if (!Auth.isAdmin()) {
      showGuard(`Access Denied: Current user role "${Auth.currentUser.role}" does not have administrator privileges.`);
      return;
    }

    showAdminDashboard();
    await loadDashboardData();
    await loadEvents();
    await loadSupportTickets();
    await loadBackups();
  }

  function showGuard(msg) {
    if (adminGuardEl) {
      adminGuardEl.style.display = 'block';
      adminGuardEl.innerHTML = `
        <div style="text-align:center; padding: 48px; background:#FFFFFF; border-radius:16px; max-width:500px; margin:40px auto; border:2px solid #FF0800;">
          <h2 style="color: #FF0800; margin-bottom: 12px;">Admin Access Required</h2>
          <p style="color: #4B5563; margin-bottom: 24px;">${msg}</p>
          <button class="btn-pill-blue" onclick="Auth.openAuthModal()">Sign in as Admin (admin@ticket.com)</button>
        </div>
      `;
    }
    if (adminContentEl) adminContentEl.style.display = 'none';
  }

  function showAdminDashboard() {
    if (adminGuardEl) adminGuardEl.style.display = 'none';
    if (adminContentEl) adminContentEl.style.display = 'block';
  }

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

  /**
   * Pure HTML5 Canvas 2D Chart Renderer (Zero dependencies)
   * Draws monthly revenue bars and ticket counts line over 12 months.
   */
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

  // Create Event Modal
  if (createEventBtn) {
    createEventBtn.addEventListener('click', () => openCreateEventModal());
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

  // Edit Seating & Zone Modal
  function openSeatingModal(eventId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h3>Configure Zones & Pricing</h3>
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
          <button id="saveZonesBtn" class="btn-pill-blue" style="width:100%; margin-top:12px; padding:12px;">Save & Regenerate Matrix</button>
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

  // Load Support Inquiries
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
          <button id="sendReplyBtn" class="btn-pill-blue" style="width:100%; padding:10px;">Send Reply & Resolve</button>
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

  // Backup & Restore
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

  await initAdmin();
});
