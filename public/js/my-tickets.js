/**
 * TicketHub - My Tickets & Purchase History Controller (public/js/my-tickets.js)
 * Implements UI-12 (Oat Milk e-ticket viewer), real QR code display (qrDataUrl),
 * red ◀ ▶ seat carousel navigation, interactive ticket selector grid (FR-28, FR-29),
 * purchase & booking history table (FR-32), and cancellation/refund modal (FR-38, FR-39).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  let targetBookingId = urlParams.get('bookingId') || '';
  let targetTicketCode = urlParams.get('ticketCode') || '';

  const ticketCarouselArea = document.getElementById('ticketCarouselArea');
  const emptyTicketsState = document.getElementById('emptyTicketsState');
  const activeTicketViewer = document.getElementById('activeTicketViewer');
  const ticketIndexBadge = document.getElementById('ticketIndexBadge');
  const prevTicketBtn = document.getElementById('prevTicketBtn');
  const nextTicketBtn = document.getElementById('nextTicketBtn');
  const myTicketsGridSection = document.getElementById('myTicketsGridSection');
  const myTicketsCountEl = document.getElementById('myTicketsCount');
  const myTicketsGrid = document.getElementById('myTicketsGrid');
  const purchaseHistoryBody = document.getElementById('purchaseHistoryBody');

  // Active E-Ticket Card Elements
  const ticketEventTitle = document.getElementById('ticketEventTitle');
  const ticketRound = document.getElementById('ticketRound');
  const ticketSeat = document.getElementById('ticketSeat');
  const ticketHolder = document.getElementById('ticketHolder');
  const ticketVenue = document.getElementById('ticketVenue');
  const ticketQrImage = document.getElementById('ticketQrImage');
  const ticketCode = document.getElementById('ticketCode');
  const ticketStatusBadge = document.getElementById('ticketStatusBadge');

  let ticketsList = [];
  let currentTicketIdx = 0;
  let historyList = [];

  function escapeSafe(val) {
    if (window.Popup && typeof window.Popup.escapeHtml === 'function') {
      return window.Popup.escapeHtml(val);
    }
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function promptForLogin() {
    Auth.openAuthModal(async () => {
      await loadData();
    });
  }

  async function loadData() {
    if (!Auth.isLoggedIn() && !API.getToken()) {
      promptForLogin();
      return;
    }

    try {
      // 1. Load user's electronic tickets (FR-28, FR-29)
      const tRes = await API.tickets.getMyTickets();
      ticketsList = (tRes && tRes.tickets) || [];

      if (targetTicketCode) {
        const idx = ticketsList.findIndex(
          (t) => String(t.ticketCode || '').toUpperCase() === targetTicketCode.toUpperCase()
        );
        if (idx !== -1) currentTicketIdx = idx;
        targetTicketCode = '';
      } else if (targetBookingId) {
        const idx = ticketsList.findIndex((t) => t.bookingId === targetBookingId);
        if (idx !== -1) currentTicketIdx = idx;
        targetBookingId = '';
      } else if (currentTicketIdx >= ticketsList.length) {
        currentTicketIdx = 0;
      }

      renderTicketCarousel();
      renderTicketsGrid();

      // 2. Load purchase & booking history (FR-32)
      const hRes = await API.tickets.getHistory();
      historyList = (hRes && hRes.history) || [];
      renderPurchaseHistory();
    } catch (err) {
      if (err.status === 401) {
        Auth.currentUser = null;
        API.setToken('');
        Auth.renderNavbarAuth();
        promptForLogin();
        return;
      }
      console.error('Failed to load tickets/history:', err);
    }
  }

  function getStatusBadgeClass(status) {
    if (status === 'CHECKED_IN') return 'badge-pill-blue fs-075';
    if (status === 'CANCELLED') return 'badge-pill-cancelled';
    return 'badge-pill-red fs-075';
  }

  function renderTicketCarousel() {
    if (!ticketCarouselArea) return;

    if (ticketsList.length === 0) {
      if (emptyTicketsState) {
        emptyTicketsState.classList.remove('d-none');
        emptyTicketsState.hidden = false;
      }
      if (activeTicketViewer) {
        activeTicketViewer.classList.add('d-none');
        activeTicketViewer.hidden = true;
      }
      return;
    }

    if (emptyTicketsState) {
      emptyTicketsState.classList.add('d-none');
      emptyTicketsState.hidden = true;
    }
    if (activeTicketViewer) {
      activeTicketViewer.classList.remove('d-none');
      activeTicketViewer.hidden = false;
    }

    const t = ticketsList[currentTicketIdx] || ticketsList[0];

    if (ticketIndexBadge) {
      ticketIndexBadge.textContent = `Ticket ${currentTicketIdx + 1} of ${ticketsList.length}`;
    }

    if (ticketEventTitle) ticketEventTitle.textContent = t.eventTitle || 'Live Event';
    if (ticketRound) {
      ticketRound.innerHTML = `<i class="fa-solid fa-calendar-days mr-4" aria-hidden="true"></i> ${escapeSafe(t.roundLabel || 'Show Round')}`;
    }
    if (ticketSeat) ticketSeat.textContent = `Seat ${t.seatNumber} (${t.zoneName || 'Standard'})`;
    if (ticketHolder) {
      ticketHolder.textContent = t.holderName || (Auth.currentUser && Auth.currentUser.name) || 'Ticket Holder';
    }
    if (ticketVenue) {
      ticketVenue.textContent = t.venue || 'Main Venue';
    }
    if (ticketCode) ticketCode.textContent = t.ticketCode;

    if (ticketQrImage) {
      ticketQrImage.src =
        t.qrDataUrl ||
        `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(t.ticketCode)}`;
      ticketQrImage.alt = `QR Code for ${t.ticketCode}`;
    }

    if (ticketStatusBadge) {
      ticketStatusBadge.textContent = t.status;
      ticketStatusBadge.className = getStatusBadgeClass(t.status);
    }

    if (prevTicketBtn) prevTicketBtn.disabled = currentTicketIdx === 0;
    if (nextTicketBtn) nextTicketBtn.disabled = currentTicketIdx === ticketsList.length - 1;
  }

  function renderTicketsGrid() {
    if (myTicketsCountEl) {
      myTicketsCountEl.textContent = String(ticketsList.length);
    }
    if (!myTicketsGrid) return;

    if (ticketsList.length === 0) {
      if (myTicketsGridSection) {
        myTicketsGridSection.classList.add('d-none');
        myTicketsGridSection.hidden = true;
      }
      myTicketsGrid.innerHTML = '';
      return;
    }

    if (myTicketsGridSection) {
      myTicketsGridSection.classList.remove('d-none');
      myTicketsGridSection.hidden = false;
    }

    myTicketsGrid.innerHTML = ticketsList
      .map((t, idx) => {
        const isActive = idx === currentTicketIdx;
        const badgeCls = getStatusBadgeClass(t.status);
        const holder = t.holderName || (Auth.currentUser && Auth.currentUser.name) || 'Ticket Holder';
        return `
          <button type="button" class="my-ticket-mini-card ${isActive ? 'active' : ''}" data-ticket-idx="${idx}" aria-pressed="${isActive ? 'true' : 'false'}">
            <div class="my-ticket-mini-header">
              <span class="my-ticket-mini-code">${escapeSafe(t.ticketCode)}</span>
              <span class="${badgeCls}">${escapeSafe(t.status)}</span>
            </div>
            <div class="my-ticket-mini-title">${escapeSafe(t.eventTitle || 'Live Event')}</div>
            <div class="my-ticket-mini-meta"><i class="fa-solid fa-calendar-days mr-4" aria-hidden="true"></i>${escapeSafe(t.roundLabel || 'Show Round')}</div>
            <div class="my-ticket-mini-seat"><i class="fa-solid fa-chair mr-4" aria-hidden="true"></i>${escapeSafe(t.zoneName || 'Zone')} • Seat ${escapeSafe(t.seatNumber)}</div>
            <div class="my-ticket-mini-meta"><i class="fa-solid fa-user mr-4" aria-hidden="true"></i>${escapeSafe(holder)}</div>
          </button>
        `;
      })
      .join('');

    myTicketsGrid.querySelectorAll('.my-ticket-mini-card').forEach((cardBtn) => {
      cardBtn.addEventListener('click', () => {
        const idx = Number(cardBtn.dataset.ticketIdx);
        if (!Number.isNaN(idx) && idx >= 0 && idx < ticketsList.length) {
          currentTicketIdx = idx;
          renderTicketCarousel();
          renderTicketsGrid();
          if (ticketCarouselArea && typeof ticketCarouselArea.scrollIntoView === 'function') {
            ticketCarouselArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });
    });
  }

  if (prevTicketBtn) {
    prevTicketBtn.addEventListener('click', () => {
      if (currentTicketIdx > 0) {
        currentTicketIdx--;
        renderTicketCarousel();
        renderTicketsGrid();
      }
    });
  }

  if (nextTicketBtn) {
    nextTicketBtn.addEventListener('click', () => {
      if (currentTicketIdx < ticketsList.length - 1) {
        currentTicketIdx++;
        renderTicketCarousel();
        renderTicketsGrid();
      }
    });
  }

  function getBookingStatusBadgeClass(status) {
    if (status === 'PAID') return 'history-status-badge history-status-badge--paid';
    if (status === 'PENDING') return 'history-status-badge history-status-badge--pending';
    if (status === 'CANCELLED') return 'history-status-badge history-status-badge--cancelled';
    return 'history-status-badge history-status-badge--expired';
  }

  function renderPurchaseHistory() {
    if (!purchaseHistoryBody) return;

    if (historyList.length === 0) {
      purchaseHistoryBody.innerHTML = `
        <tr>
          <td colspan="7" class="tc c-muted p-24">
            No purchase history available.
          </td>
        </tr>
      `;
      return;
    }

    purchaseHistoryBody.innerHTML = historyList
      .map((b) => {
        const dateStr = b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '—';
        const hasCheckedInTicket = Array.isArray(b.tickets) && b.tickets.some((t) => t.status === 'CHECKED_IN');
        const canCancel = b.status === 'PAID' && b.allowCancellation !== false && !hasCheckedInTicket;
        const canViewTicket = b.status === 'PAID' && ticketsList.some((t) => t.bookingId === b.id);
        const canPayPending = b.status === 'PENDING';
        const statusBadgeCls = getBookingStatusBadgeClass(b.status);
        const eventName = b.eventTitle || 'Live Event';
        const seatsDisplay = Array.isArray(b.seatNumbers) && b.seatNumbers.length > 0
          ? b.seatNumbers.join(', ')
          : '—';

        const actionButtons = [];
        if (canViewTicket) {
          actionButtons.push(
            `<button type="button" class="btn-view-booking-ticket btn-pill-blue btn-history-action" data-id="${escapeSafe(b.id)}">View QR</button>`
          );
        }
        if (canPayPending) {
          actionButtons.push(
            `<a href="/checkout?bookingId=${encodeURIComponent(b.id)}" class="btn-pill-red btn-history-action">Pay Now</a>`
          );
        }
        if (canCancel) {
          actionButtons.push(
            `<button type="button" class="btn-cancel-booking btn-pill-outline" data-id="${escapeSafe(b.id)}">Cancel &amp; Refund</button>`
          );
        }

        return `
          <tr>
            <td><strong>${escapeSafe(b.id)}</strong></td>
            <td>${escapeSafe(dateStr)}</td>
            <td>
              <strong>${escapeSafe(eventName)}</strong>
              ${b.roundLabel ? `<div class="fs-08 c-muted">${escapeSafe(b.roundLabel)}</div>` : ''}
            </td>
            <td>
              ${b.zoneName ? `<span class="fs-08 c-muted block">${escapeSafe(b.zoneName)}</span>` : ''}
              <strong>${escapeSafe(seatsDisplay)}</strong>
            </td>
            <td><strong>${Number(b.totalAmount || 0).toLocaleString()} THB</strong></td>
            <td>
              <span class="${statusBadgeCls}">
                ${escapeSafe(b.status)}
              </span>
            </td>
            <td>
              ${
                actionButtons.length > 0
                  ? `<div class="history-actions-cell">${actionButtons.join('')}</div>`
                  : '<span class="c-muted fs-085">—</span>'
              }
            </td>
          </tr>
        `;
      })
      .join('');

    purchaseHistoryBody.querySelectorAll('.btn-view-booking-ticket').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bookingId = btn.dataset.id;
        const idx = ticketsList.findIndex((t) => t.bookingId === bookingId);
        if (idx !== -1) {
          currentTicketIdx = idx;
          renderTicketCarousel();
          renderTicketsGrid();
          if (ticketCarouselArea && typeof ticketCarouselArea.scrollIntoView === 'function') {
            ticketCarouselArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });
    });

    purchaseHistoryBody.querySelectorAll('.btn-cancel-booking').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const booking = historyList.find((x) => x.id === id);
        if (booking) openRefundModal(booking);
      });
    });
  }

  function openRefundModal(booking) {
    const refundableAmount = Math.max(0, (booking.subtotal || 0) - (booking.discountAmount || 0));
    const nonRefundableFee = booking.serviceFee || ((booking.seatIds || []).length * 40);
    const titleId = `refund-dialog-title-${Math.random().toString(36).slice(2, 8)}`;

    const dialog = document.createElement('dialog');
    dialog.className = 'th-popup-dialog';
    dialog.setAttribute('closedby', 'any');
    dialog.setAttribute('aria-labelledby', titleId);

    dialog.innerHTML = `
      <div class="th-popup th-popup--big refund-modal-dialog">
        <div class="th-popup-header refund-modal-header">
          <h3 class="th-popup-title refund-modal-title" id="${titleId}">Cancel Booking &amp; Refund</h3>
          <button type="button" class="modal-close-btn th-popup-close" title="Close" aria-label="Close">
            <img src="/images/popup-close-icon.svg" alt="Close" class="refund-modal-close-img">
          </button>
        </div>
        <div class="modal-body refund-modal-body">
          <p class="refund-modal-lead">
            Are you sure you want to cancel your booking for <strong>${escapeSafe(booking.eventTitle || 'Live Event')}</strong>?
          </p>
          <div class="refund-breakdown-box">
            <div class="refund-breakdown-row">
              <span>Ticket Subtotal:</span>
              <strong>${Number(booking.subtotal || 0).toLocaleString()} THB</strong>
            </div>
            ${
              booking.discountAmount > 0
                ? `<div class="refund-breakdown-row refund-breakdown-row--discount">
                    <span>Discounts:</span>
                    <strong>-${Number(booking.discountAmount).toLocaleString()} THB</strong>
                  </div>`
                : ''
            }
            <div class="refund-breakdown-row refund-breakdown-row--fee">
              <span>Service Fee (Non-refundable):</span>
              <strong>${Number(nonRefundableFee).toLocaleString()} THB</strong>
            </div>
            <div class="refund-breakdown-divider"></div>
            <div class="refund-breakdown-total">
              <span>Total Refund Amount:</span>
              <span>${Number(refundableAmount).toLocaleString()} THB</span>
            </div>
          </div>
          <p class="refund-policy-note">
            * Refund policy (FR-38, FR-39): The subtotal minus discounts will be refunded to your original payment method. The 40 THB/seat service fee is non-refundable. Your reserved seats will immediately return to available status.
          </p>
        </div>
        <div class="th-popup-actions--big refund-modal-actions">
          <button type="button" class="btn-confirm-refund th-popup-btn th-popup-btn--primary th-popup-btn--destructive">Confirm Refund</button>
          <button type="button" class="btn-cancel-close th-popup-btn th-popup-btn--secondary" autofocus>Keep Booking</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const closeModal = () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      dialog.remove();
    };

    dialog.addEventListener('close', () => {
      dialog.remove();
    }, { once: true });

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = (e.target === dialog) && outside(e);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && (e.target === dialog) && outside(e)) closeModal();
      });
    }

    dialog.querySelector('.modal-close-btn').onclick = closeModal;
    dialog.querySelector('.btn-cancel-close').onclick = closeModal;

    dialog.querySelector('.btn-confirm-refund').onclick = async () => {
      const confirmBtn = dialog.querySelector('.btn-confirm-refund');
      if (confirmBtn && confirmBtn.disabled) return;
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';
      }
      try {
        const res = await API.booking.cancel(booking.id);
        closeModal();
        await Popup.alert(
          `Booking cancelled successfully. Refund of ${res.refundableAmount.toLocaleString()} THB issued.`,
          { title: 'Refund Processed' }
        );
        await loadData();
      } catch (err) {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirm Refund';
        }
        await Popup.alert(err.message || 'Failed to cancel booking.', { title: 'Cancellation Error' });
      }
    };

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  await Auth.ready;
  await loadData();
});
