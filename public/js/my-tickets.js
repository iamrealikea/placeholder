/**
 * TicketHub - My Tickets & Purchase History Controller (public/js/my-tickets.js)
 * Implements UI-12 (Oat Milk e-ticket viewer), real QR code display (qrDataUrl),
 * red ◀ ▶ seat carousel navigation, purchase history table, and cancellation/refund modal.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const ticketCarouselArea = document.getElementById('ticketCarouselArea');
  const ticketIndexBadge = document.getElementById('ticketIndexBadge');
  const prevTicketBtn = document.getElementById('prevTicketBtn');
  const nextTicketBtn = document.getElementById('nextTicketBtn');
  const purchaseHistoryBody = document.getElementById('purchaseHistoryBody');

  // Active E-Ticket Card Elements
  const ticketEventTitle = document.getElementById('ticketEventTitle');
  const ticketRound = document.getElementById('ticketRound');
  const ticketSeat = document.getElementById('ticketSeat');
  const ticketHolder = document.getElementById('ticketHolder');
  const ticketQrImage = document.getElementById('ticketQrImage');
  const ticketCode = document.getElementById('ticketCode');
  const ticketStatusBadge = document.getElementById('ticketStatusBadge');

  let ticketsList = [];
  let currentTicketIdx = 0;
  let historyList = [];

  async function loadData() {
    if (!Auth.isLoggedIn()) {
      Auth.openAuthModal(async () => {
        await loadData();
      });
      return;
    }

    try {
      // 1. Load active tickets
      const tRes = await API.tickets.getMyTickets();
      ticketsList = (tRes && tRes.tickets) || [];
      renderTicketCarousel();

      // 2. Load purchase history
      const hRes = await API.tickets.getHistory();
      historyList = (hRes && hRes.history) || [];
      renderPurchaseHistory();
    } catch (err) {
      console.error('Failed to load tickets/history:', err);
    }
  }

  function renderTicketCarousel() {
    if (!ticketCarouselArea) return;

    if (ticketsList.length === 0) {
      ticketCarouselArea.innerHTML = `
        <div style="text-align: center; padding: 48px; background: #FFFFFF; border-radius: 20px; box-shadow: var(--shadow-sm); max-width: 440px; margin: 0 auto;">
          <span style="font-size: 3rem;">🎟️</span>
          <h3 style="margin: 12px 0 6px;">No Active Tickets</h3>
          <p style="color: #6B7280; font-size: 0.9rem; margin-bottom: 20px;">You haven't booked any event tickets yet.</p>
          <a href="/index.html" class="btn-pill-red">Browse Events</a>
        </div>
      `;
      return;
    }

    const t = ticketsList[currentTicketIdx];

    if (ticketIndexBadge) {
      ticketIndexBadge.textContent = `Ticket ${currentTicketIdx + 1} of ${ticketsList.length}`;
    }

    if (ticketEventTitle) ticketEventTitle.textContent = t.eventTitle || 'Live Event';
    if (ticketRound) ticketRound.textContent = `📅 ${t.roundLabel || 'Show Round'}`;
    if (ticketSeat) ticketSeat.textContent = `Seat ${t.seatNumber} (${t.zoneName})`;
    if (ticketHolder) ticketHolder.textContent = t.holderName || (Auth.currentUser && Auth.currentUser.name) || 'Alex Rivers';
    if (ticketCode) ticketCode.textContent = t.ticketCode;

    if (ticketQrImage) {
      // Render real qrDataUrl from server
      ticketQrImage.src = t.qrDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(t.ticketCode)}`;
      ticketQrImage.alt = `QR Code for ${t.ticketCode}`;
    }

    if (ticketStatusBadge) {
      ticketStatusBadge.textContent = t.status;
      if (t.status === 'CHECKED_IN') {
        ticketStatusBadge.className = 'badge-pill-blue';
      } else if (t.status === 'CANCELLED') {
        ticketStatusBadge.className = 'badge-pill-red';
        ticketStatusBadge.style.backgroundColor = '#6B7280';
      } else {
        ticketStatusBadge.className = 'badge-pill-red';
      }
    }

    // Carousel buttons state
    if (prevTicketBtn) prevTicketBtn.disabled = currentTicketIdx === 0;
    if (nextTicketBtn) nextTicketBtn.disabled = currentTicketIdx === ticketsList.length - 1;
  }

  if (prevTicketBtn) {
    prevTicketBtn.addEventListener('click', () => {
      if (currentTicketIdx > 0) {
        currentTicketIdx--;
        renderTicketCarousel();
      }
    });
  }

  if (nextTicketBtn) {
    nextTicketBtn.addEventListener('click', () => {
      if (currentTicketIdx < ticketsList.length - 1) {
        currentTicketIdx++;
        renderTicketCarousel();
      }
    });
  }

  function renderPurchaseHistory() {
    if (!purchaseHistoryBody) return;

    if (historyList.length === 0) {
      purchaseHistoryBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: #6B7280; padding: 24px;">
            No purchase history available.
          </td>
        </tr>
      `;
      return;
    }

    purchaseHistoryBody.innerHTML = historyList
      .map((b) => {
        const dateStr = new Date(b.createdAt).toLocaleDateString();
        const canCancel = b.status === 'PAID';

        let badgeColor = '#10B981';
        if (b.status === 'CANCELLED') badgeColor = '#EF4444';
        if (b.status === 'PENDING') badgeColor = '#F59E0B';
        if (b.status === 'EXPIRED') badgeColor = '#9CA3AF';

        return `
          <tr>
            <td><strong>${b.id}</strong></td>
            <td>${dateStr}</td>
            <td>${b.eventTitle}</td>
            <td>${(b.seatNumbers || []).join(', ')}</td>
            <td><strong>${b.totalAmount.toLocaleString()} THB</strong></td>
            <td>
              <span style="background: ${badgeColor}20; color: ${badgeColor}; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.8rem;">
                ${b.status}
              </span>
            </td>
            <td>
              ${
                canCancel
                  ? `<button class="btn-cancel-booking btn-pill-outline" data-id="${b.id}" style="color: #FF0800; border-color: #FF0800; padding: 4px 12px; font-size: 0.8rem;">Cancel & Refund</button>`
                  : '<span style="color: #9CA3AF; font-size: 0.85rem;">—</span>'
              }
            </td>
          </tr>
        `;
      })
      .join('');

    // Attach cancellation handlers
    purchaseHistoryBody.querySelectorAll('.btn-cancel-booking').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const booking = historyList.find((x) => x.id === id);
        if (booking) openRefundModal(booking);
      });
    });
  }

  function openRefundModal(booking) {
    const refundableAmount = Math.max(0, booking.subtotal - (booking.discountAmount || 0));
    const nonRefundableFee = booking.serviceFee || ((booking.seatIds || []).length * 40);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 480px;">
        <div class="modal-header">
          <h3 style="color: #FF0800; font-size: 1.25rem;">Cancel Booking & Request Refund</h3>
          <button class="modal-close-btn" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 16px; color: #374151;">
            Are you sure you want to cancel your booking for <strong>${booking.eventTitle}</strong>?
          </p>
          <div style="background: #F9FAFB; border-radius: 12px; padding: 16px; border: 1px solid #E5E7EB; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>Ticket Subtotal:</span>
              <strong>${booking.subtotal.toLocaleString()} THB</strong>
            </div>
            ${
              booking.discountAmount > 0
                ? `<div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #10B981;">
                    <span>Discounts:</span>
                    <strong>-${booking.discountAmount.toLocaleString()} THB</strong>
                  </div>`
                : ''
            }
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #DC2626;">
              <span>Service Fee (Non-refundable):</span>
              <strong>${nonRefundableFee.toLocaleString()} THB</strong>
            </div>
            <div style="border-top: 1px solid #E5E7EB; margin: 8px 0;"></div>
            <div style="display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 800; color: #1D56CF;">
              <span>Total Refund Amount:</span>
              <span>${refundableAmount.toLocaleString()} THB</span>
            </div>
          </div>
          <p style="font-size: 0.8rem; color: #6B7280;">
            * Refund policy (FR-38, FR-39): The subtotal minus discounts will be refunded to your original payment method. The 40 THB/seat service fee is non-refundable. Your reserved seats will immediately return to available status.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel-close btn-pill-outline">Keep Booking</button>
          <button class="btn-confirm-refund btn-pill-red">Confirm Refund</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.modal-close-btn').onclick = () => modal.remove();
    modal.querySelector('.btn-cancel-close').onclick = () => modal.remove();

    modal.querySelector('.btn-confirm-refund').onclick = async () => {
      try {
        const res = await API.booking.cancel(booking.id);
        alert(`Booking cancelled successfully. Refund of ${res.refundableAmount.toLocaleString()} THB issued.`);
        modal.remove();
        await loadData();
      } catch (err) {
        alert(err.message || 'Failed to cancel booking.');
      }
    };
  }

  await loadData();
});
