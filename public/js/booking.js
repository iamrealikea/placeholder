/**
 * TicketHub - Booking & Interactive Seat Matrix Controller (public/js/booking.js)
 * Implements UI-04 (black circles), UI-05 (cross mark ✕), UI-06 (check mark ✓),
 * UI-07 (zones), UI-13 (Monday Blue booking theme), and atomic seat hold via POST /api/bookings/hold.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('eventId') || 'evt-1';
  let selectedRoundId = urlParams.get('roundId') || '';

  const bookingEventTitleEl = document.getElementById('bookingEventTitle');
  const bookingVenueEl = document.getElementById('bookingVenue');
  const roundSelectorEl = document.getElementById('roundSelector');
  const zoneTabsEl = document.getElementById('zoneTabs');
  const seatMatrixContainer = document.getElementById('seatMatrixContainer');
  const summarySeatCountEl = document.getElementById('summarySeatCount');
  const summarySeatsListEl = document.getElementById('summarySeatsList');
  const summarySubtotalEl = document.getElementById('summarySubtotal');
  const summaryTotalEl = document.getElementById('summaryTotal');
  const proceedCheckoutBtn = document.getElementById('proceedCheckoutBtn');

  const SERVICE_FEE_PER_TICKET = 40;
  const MAX_SEATS = 6;

  let eventData = null;
  let allSeats = [];
  let selectedSeatIds = new Set();
  let activeZoneFilter = 'ALL';

  async function initBooking() {
    try {
      const res = await API.events.getById(eventId);
      eventData = res.event;
      bookingEventTitleEl.textContent = eventData.title;
      bookingVenueEl.textContent = `📍 ${eventData.venue}`;

      // Pick first round if not specified
      if (!selectedRoundId && eventData.rounds && eventData.rounds.length > 0) {
        selectedRoundId = eventData.rounds[0].id;
      }

      renderRoundSelector();
      await loadSeats();
    } catch (err) {
      console.error('Failed to init booking:', err);
      seatMatrixContainer.innerHTML = `<div style="padding: 40px; color: #DC2626; font-weight: 700;">${err.message || 'Error loading event'}</div>`;
    }
  }

  function renderRoundSelector() {
    if (!roundSelectorEl || !eventData.rounds) return;
    roundSelectorEl.innerHTML = eventData.rounds
      .map(
        (r) => `
          <button class="round-btn ${r.id === selectedRoundId ? 'active' : ''}" data-id="${r.id}">
            📅 ${r.date} • ${r.time} (${r.label || 'Round'})
          </button>
        `
      )
      .join('');

    roundSelectorEl.querySelectorAll('.round-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (selectedSeatIds.size > 0) {
          if (!confirm('Switching rounds will clear your currently selected seats. Continue?')) {
            return;
          }
        }
        selectedRoundId = btn.dataset.id;
        selectedSeatIds.clear();
        updateSummary();
        renderRoundSelector();
        await loadSeats();
      });
    });
  }

  async function loadSeats() {
    seatMatrixContainer.innerHTML = `<div style="padding: 40px; color: #6B7280;">Loading seating plan...</div>`;
    try {
      const res = await API.booking.getSeats(eventId, selectedRoundId);
      allSeats = res.seats || [];
      renderZoneTabs();
      renderSeatMatrix();
    } catch (err) {
      seatMatrixContainer.innerHTML = `<div style="padding: 40px; color: #DC2626;">Failed to load seating map: ${err.message}</div>`;
    }
  }

  function renderZoneTabs() {
    if (!zoneTabsEl || !eventData.zones) return;

    // Calculate live seat availability per zone
    const zoneCounts = {};
    for (const z of eventData.zones) {
      zoneCounts[z.id] = { available: 0, total: 0 };
    }
    for (const s of allSeats) {
      if (zoneCounts[s.zoneId]) {
        zoneCounts[s.zoneId].total++;
        if (s.status === 'AVAILABLE') zoneCounts[s.zoneId].available++;
      }
    }

    let tabsHtml = `
      <div class="zone-tab ${activeZoneFilter === 'ALL' ? 'active' : ''}" data-zone="ALL">
        <span>All Zones</span>
      </div>
    `;

    for (const z of eventData.zones) {
      const counts = zoneCounts[z.id] || { available: 0, total: 0 };
      tabsHtml += `
        <div class="zone-tab ${activeZoneFilter === z.id ? 'active' : ''}" data-zone="${z.id}">
          <span class="zone-color-indicator" style="background-color: ${z.color || '#1D56CF'};"></span>
          <span>${z.name} (${z.price.toLocaleString()} THB)</span>
          <span style="font-size:0.75rem; background:#E5E7EB; padding:2px 8px; border-radius:9999px; font-weight:700;">
            ${counts.available}/${counts.total} left
          </span>
        </div>
      `;
    }

    zoneTabsEl.innerHTML = tabsHtml;

    zoneTabsEl.querySelectorAll('.zone-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeZoneFilter = tab.dataset.zone;
        renderZoneTabs();
        renderSeatMatrix();
      });
    });
  }

  function renderSeatMatrix() {
    const seatsToDisplay = activeZoneFilter === 'ALL'
      ? allSeats
      : allSeats.filter((s) => s.zoneId === activeZoneFilter);

    if (seatsToDisplay.length === 0) {
      seatMatrixContainer.innerHTML = `<p style="padding: 32px; color: #6B7280;">No seats available in this view.</p>`;
      return;
    }

    // Group seats by row
    const rowMap = {};
    for (const s of seatsToDisplay) {
      const rowName = s.row || (s.seatNumber ? s.seatNumber.charAt(0) : 'A');
      if (!rowMap[rowName]) rowMap[rowName] = [];
      rowMap[rowName].push(s);
    }

    // Sort rows alphabetically
    const sortedRows = Object.keys(rowMap).sort();

    let matrixHtml = `
      <div class="stage-banner">STAGE / SCREEN</div>
    `;

    for (const row of sortedRows) {
      const rowSeats = rowMap[row].sort((a, b) => a.col - b.col);
      matrixHtml += `<div class="seat-row">`;
      matrixHtml += `<div class="row-label">${row}</div>`;

      for (const seat of rowSeats) {
        let statusClass = 'available';
        let isClickable = true;

        if (seat.status === 'BOOKED' || seat.status === 'HELD') {
          statusClass = 'booked';
          isClickable = false;
        } else if (selectedSeatIds.has(seat.id)) {
          statusClass = 'selected';
        }

        matrixHtml += `
          <div class="seat ${statusClass}" 
               data-id="${seat.id}" 
               data-number="${seat.seatNumber}" 
               data-price="${seat.price}"
               data-zone="${seat.zoneName}"
               title="${seat.zoneName} - Seat ${seat.seatNumber} (${seat.price} THB)">
            ${statusClass === 'available' ? seat.seatNumber : ''}
          </div>
        `;
      }

      matrixHtml += `<div class="row-label" style="text-align:left; margin-left:8px; margin-right:0;">${row}</div>`;
      matrixHtml += `</div>`;
    }

    seatMatrixContainer.innerHTML = matrixHtml;

    // Attach click events to seats
    seatMatrixContainer.querySelectorAll('.seat.available, .seat.selected').forEach((seatEl) => {
      seatEl.addEventListener('click', () => {
        const id = seatEl.dataset.id;
        if (selectedSeatIds.has(id)) {
          selectedSeatIds.delete(id);
          seatEl.className = 'seat available';
          seatEl.textContent = seatEl.dataset.number;
        } else {
          if (selectedSeatIds.size >= MAX_SEATS) {
            alert(`You can select a maximum of ${MAX_SEATS} seats per transaction.`);
            return;
          }
          selectedSeatIds.add(id);
          seatEl.className = 'seat selected';
          seatEl.textContent = '';
        }
        updateSummary();
      });
    });
  }

  function updateSummary() {
    const selectedArray = Array.from(selectedSeatIds).map((id) =>
      allSeats.find((s) => s.id === id)
    ).filter(Boolean);

    const count = selectedArray.length;
    const subtotal = selectedArray.reduce((sum, s) => sum + s.price, 0);
    const serviceFee = count * SERVICE_FEE_PER_TICKET;
    const total = subtotal + serviceFee;

    if (summarySeatCountEl) summarySeatCountEl.textContent = count;
    if (summarySeatsListEl) {
      summarySeatsListEl.textContent = count > 0
        ? selectedArray.map((s) => s.seatNumber).join(', ')
        : 'None selected';
    }
    if (summarySubtotalEl) summarySubtotalEl.textContent = `${subtotal.toLocaleString()} THB`;
    if (summaryTotalEl) summaryTotalEl.textContent = `${total.toLocaleString()} THB`;

    if (proceedCheckoutBtn) {
      proceedCheckoutBtn.disabled = count === 0;
    }
  }

  // Handle Proceed to Checkout button
  if (proceedCheckoutBtn) {
    proceedCheckoutBtn.addEventListener('click', async () => {
      if (selectedSeatIds.size === 0) return;

      // Check authentication
      if (!Auth.isLoggedIn()) {
        Auth.openAuthModal(async () => {
          await executeSeatHold();
        });
        return;
      }

      await executeSeatHold();
    });
  }

  async function executeSeatHold() {
    proceedCheckoutBtn.disabled = true;
    proceedCheckoutBtn.textContent = 'Reserving Seats...';

    try {
      const seatIds = Array.from(selectedSeatIds);
      const res = await API.booking.holdSeats({
        eventId,
        roundId: selectedRoundId,
        seatIds
      });

      // Redirect to checkout with booking ID
      window.location.href = `/checkout.html?bookingId=${res.booking.id}`;
    } catch (err) {
      proceedCheckoutBtn.disabled = false;
      proceedCheckoutBtn.textContent = 'Proceed to Checkout';

      if (err.status === 409) {
        alert('One or more of the seats you selected have just been held or booked by another customer. Please choose other seats.');
        selectedSeatIds.clear();
        updateSummary();
        await loadSeats();
      } else {
        alert(err.message || 'Failed to hold seats.');
      }
    }
  }

  await initBooking();
});
