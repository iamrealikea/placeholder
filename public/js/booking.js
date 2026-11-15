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
      bookingVenueEl.innerHTML = `<i class="fa-solid fa-location-dot" style="margin-right: 4px;"></i> ${eventData.venue}`;

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
            <i class="fa-solid fa-calendar-days" style="margin-right: 4px;"></i> ${r.date} • ${r.time} (${r.label || 'Round'})
          </button>
        `
      )
      .join('');

    roundSelectorEl.querySelectorAll('.round-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (selectedSeatIds.size > 0) {
          const confirmed = await Popup.confirm('Switching rounds will clear your currently selected seats. Continue?', { title: 'Switch Round' });
          if (!confirmed) {
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

    const useCoordinateLayout = seatsToDisplay.every(
      (s) => typeof s.x === 'number' && typeof s.y === 'number'
    ) && seatsToDisplay.some(
      (s) =>
        s.layout === 'custom' ||
        (eventData &&
          Array.isArray(eventData.zones) &&
          eventData.zones.some(
            (z) => z.layout === 'custom' || z.layout === 'template' || (Array.isArray(z.seats) && z.seats.length > 0)
          ))
    );

    let matrixHtml = `
      <div class="stage-banner">STAGE / SCREEN</div>
    `;

    if (useCoordinateLayout) {
      const maxX = Math.max(760, ...seatsToDisplay.map((s) => (typeof s.x === 'number' ? s.x + 60 : 0)));
      const maxY = Math.max(420, ...seatsToDisplay.map((s) => (typeof s.y === 'number' ? s.y + 60 : 0)));
      matrixHtml += `<div class="seat-coordinate-canvas" style="position:relative; width:${maxX}px; height:${maxY}px; margin:0 auto;">`;

      for (const seat of seatsToDisplay) {
        let statusClass = 'available';
        if (seat.status === 'BOOKED' || seat.status === 'HELD') {
          statusClass = 'booked';
        } else if (selectedSeatIds.has(seat.id)) {
          statusClass = 'selected';
        }

        const accentColor = seat.seatColor || seat.zoneColor || '';
        const accentClass = accentColor ? 'has-accent' : '';
        const xPos = typeof seat.x === 'number' ? seat.x : 40;
        const yPos = typeof seat.y === 'number' ? seat.y : 40;
        const styleStr = `position:absolute; left:${xPos}px; top:${yPos}px; transform:translate(-50%, -50%);${accentColor ? ` --seat-accent:${accentColor}; box-shadow: 0 0 0 3px ${accentColor}, 0 2px 4px rgba(0,0,0,0.25);` : ''}`;

        matrixHtml += `
          <div class="seat ${statusClass} ${accentClass}"
               style="${styleStr}"
               data-id="${seat.id}"
               data-number="${seat.seatNumber}"
               data-price="${seat.price}"
               data-zone="${seat.zoneName}"
               data-accent="${accentColor}"
               title="${seat.zoneName} - Seat ${seat.seatNumber} (${seat.price} THB)">
            ${statusClass === 'available' ? seat.seatNumber : ''}
          </div>
        `;
      }

      matrixHtml += `</div>`;
    } else {
      // Group seats by zone first (when viewing ALL zones), then by row so zones do not collide on row 'A'
      const zonesOrder = (eventData && Array.isArray(eventData.zones) && eventData.zones.length > 0)
        ? eventData.zones.filter((z) => activeZoneFilter === 'ALL' || z.id === activeZoneFilter)
        : [{ id: 'default', name: 'Seating', color: '#1D56CF' }];

      for (const z of zonesOrder) {
        const zoneSeats = z.id === 'default'
          ? seatsToDisplay
          : seatsToDisplay.filter((s) => s.zoneId === z.id);
        if (zoneSeats.length === 0) continue;

        if (activeZoneFilter === 'ALL' && zonesOrder.length > 1) {
          matrixHtml += `
            <div style="margin: 18px 0 8px; font-weight: 800; font-size: 0.9rem; color: #374151; display: flex; align-items: center; justify-content: center; gap: 8px;">
              <span class="zone-color-indicator" style="background-color: ${z.color || '#1D56CF'};"></span>
              <span>${z.name} (${(z.price || zoneSeats[0].price || 0).toLocaleString()} THB)</span>
            </div>
          `;
        }

        const rowMap = {};
        for (const s of zoneSeats) {
          const rowName = s.row || (s.seatNumber ? s.seatNumber.charAt(0) : 'A');
          if (!rowMap[rowName]) rowMap[rowName] = [];
          rowMap[rowName].push(s);
        }

        const sortedRows = Object.keys(rowMap).sort();

        for (const row of sortedRows) {
          const rowSeats = rowMap[row].sort((a, b) => a.col - b.col);
          matrixHtml += `<div class="seat-row">`;
          matrixHtml += `<div class="row-label">${row}</div>`;

          for (const seat of rowSeats) {
            let statusClass = 'available';

            if (seat.status === 'BOOKED' || seat.status === 'HELD') {
              statusClass = 'booked';
            } else if (selectedSeatIds.has(seat.id)) {
              statusClass = 'selected';
            }

            const accentColor = seat.seatColor || seat.zoneColor || '';
            const accentClass = accentColor ? 'has-accent' : '';
            const styleStr = accentColor ? `--seat-accent:${accentColor}; box-shadow: 0 0 0 3px ${accentColor}, 0 2px 4px rgba(0,0,0,0.25);` : '';

            matrixHtml += `
              <div class="seat ${statusClass} ${accentClass}" 
                   style="${styleStr}"
                   data-id="${seat.id}" 
                   data-number="${seat.seatNumber}" 
                   data-price="${seat.price}"
                   data-zone="${seat.zoneName}"
                   data-accent="${accentColor}"
                   title="${seat.zoneName} - Seat ${seat.seatNumber} (${seat.price} THB)">
                ${statusClass === 'available' ? seat.seatNumber : ''}
              </div>
            `;
          }

          matrixHtml += `<div class="row-label" style="text-align:left; margin-left:8px; margin-right:0;">${row}</div>`;
          matrixHtml += `</div>`;
        }
      }
    }

    seatMatrixContainer.innerHTML = matrixHtml;

    // Attach click events to seats
    seatMatrixContainer.querySelectorAll('.seat.available, .seat.selected').forEach((seatEl) => {
      seatEl.addEventListener('click', async () => {
        const id = seatEl.dataset.id;
        const hasAccent = seatEl.dataset.accent ? ' has-accent' : '';
        if (selectedSeatIds.has(id)) {
          selectedSeatIds.delete(id);
          seatEl.className = `seat available${hasAccent}`;
          seatEl.textContent = seatEl.dataset.number;
        } else {
          if (selectedSeatIds.size >= MAX_SEATS) {
            await Popup.alert(`You can select a maximum of ${MAX_SEATS} seats per transaction.`, { title: 'Seat Limit' });
            return;
          }
          selectedSeatIds.add(id);
          seatEl.className = `seat selected${hasAccent}`;
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
      window.location.href = `/checkout?bookingId=${res.booking.id}`;
    } catch (err) {
      proceedCheckoutBtn.disabled = false;
      proceedCheckoutBtn.textContent = 'Proceed to Checkout';

      if (err.status === 409) {
        await Popup.alert('One or more of the seats you selected have just been held or booked by another customer. Please choose other seats.', { title: 'Seats Unavailable' });
        selectedSeatIds.clear();
        updateSummary();
        await loadSeats();
      } else {
        await Popup.alert(err.message || 'Failed to hold seats.', { title: 'Reservation Error' });
      }
    }
  }

  await initBooking();
});
