/**
 * TicketHub - Event Detail Page Controller (public/js/event.js)
 * Loads event details, dual photos, description, and cool grey Information card with Buy Now button.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('id') || 'evt-1';

  const eventTitleEl = document.getElementById('eventTitle');
  const eventVenueEl = document.getElementById('eventVenue');
  const eventPhoto1El = document.getElementById('eventPhoto1');
  const eventPhoto2El = document.getElementById('eventPhoto2');
  const eventDescEl = document.getElementById('eventDesc');
  const roundsListEl = document.getElementById('roundsList');
  const bookmarkBtn = document.getElementById('bookmarkBtn');
  const infoDatesEl = document.getElementById('infoDates');
  const infoScheduleEl = document.getElementById('infoSchedule');
  const infoOrganizerEl = document.getElementById('infoOrganizer');
  const buyNowBtn = document.getElementById('buyNowBtn');

  let currentEvent = null;

  async function loadEvent() {
    try {
      const res = await API.events.getById(eventId);
      currentEvent = res.event;
      renderEvent(currentEvent);
    } catch (err) {
      console.error('Failed to load event:', err);
      if (eventTitleEl) eventTitleEl.textContent = 'Event Not Found';
      if (eventDescEl) eventDescEl.textContent = 'The requested event could not be found or has been removed.';
      if (buyNowBtn) {
        buyNowBtn.disabled = true;
        buyNowBtn.textContent = 'Event Unavailable';
      }
    }
  }

  function renderEvent(event) {
    document.title = `${event.title} - TicketHub`;
    if (eventTitleEl) eventTitleEl.textContent = event.title;
    if (eventVenueEl) eventVenueEl.textContent = `📍 ${event.venue}`;

    const defaultImg1 = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1000&q=80';
    const defaultImg2 = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1000&q=80';

    if (eventPhoto1El) eventPhoto1El.src = event.posterUrl || defaultImg1;
    if (eventPhoto2El) eventPhoto2El.src = event.galleryUrl || defaultImg2;

    if (eventDescEl) eventDescEl.textContent = event.description || 'Join us for this exciting live event experience.';

    // Bookmark status
    if (bookmarkBtn) {
      bookmarkBtn.innerHTML = event.isBookmarked ? '❤️ Bookmarked' : '🤍 Add to Bookmarks';
      bookmarkBtn.onclick = async () => {
        if (!Auth.isLoggedIn()) {
          Auth.openAuthModal();
          return;
        }
        try {
          const bRes = await API.events.toggleBookmark(event.id);
          bookmarkBtn.innerHTML = bRes.isBookmarked ? '❤️ Bookmarked' : '🤍 Add to Bookmarks';
        } catch (bErr) {
          alert(bErr.message);
        }
      };
    }

    // Rounds preview in description
    if (roundsListEl && event.rounds) {
      roundsListEl.innerHTML = event.rounds
        .map(
          (r) => `
            <div style="background:#FFFFFF; border:1px solid #E5E7EB; border-radius:12px; padding:12px 18px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong>${r.label || 'Round'}</strong>
                <div style="font-size:0.85rem; color:#6B7280;">📅 ${r.date} &nbsp; ⏰ ${r.time}</div>
              </div>
              <span class="badge-pill-blue" style="font-size:0.8rem;">Available</span>
            </div>
          `
        )
        .join('');
    }

    // Cool Grey Information Card details
    const dates = (event.rounds || []).map((r) => r.date).filter(Boolean);
    const dateText = dates.length > 0 ? dates.join(', ') : '2, 3, 4, 6 October 2026';
    if (infoDatesEl) infoDatesEl.textContent = dateText;

    const gateTime = event.gateOpenTime || '16:00';
    const showTime = event.showTime || '19:00';
    if (infoScheduleEl) {
      infoScheduleEl.innerHTML = `
        <div>Open gate: ${gateTime}</div>
        <div>Showtime: ${showTime}</div>
      `;
    }

    if (infoOrganizerEl) infoOrganizerEl.textContent = event.organizer || 'kys show';

    // Buy Now Button logic
    if (buyNowBtn) {
      if (event.status === 'Coming Soon') {
        buyNowBtn.disabled = true;
        buyNowBtn.textContent = 'Coming Soon';
        buyNowBtn.className = 'btn-pill-blue';
      } else if (!event.isSaleOpen && event.status !== 'On Sale') {
        buyNowBtn.disabled = true;
        buyNowBtn.textContent = 'Sales Closed';
      } else {
        buyNowBtn.disabled = false;
        buyNowBtn.textContent = 'Buy Now';
        buyNowBtn.onclick = () => {
          window.location.href = `/booking.html?eventId=${event.id}`;
        };
      }
    }
  }

  await loadEvent();
});
