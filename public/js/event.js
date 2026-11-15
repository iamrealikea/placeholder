/**
 * TicketHub - Event Detail Page Controller (public/js/event.js)
 * Loads event details (poster, title, artist, description, rounds, gate/show times,
 * venue, zone pricing, seating plan preview) and handles bookmarking and booking CTA.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('id') || 'evt-1';

  const eventMetaBadgesEl = document.getElementById('eventMetaBadges');
  const eventTitleEl = document.getElementById('eventTitle');
  const eventArtistEl = document.getElementById('eventArtist');
  const eventVenueEl = document.getElementById('eventVenue');
  const eventPhoto1El = document.getElementById('eventPhoto1');
  const eventPhoto2El = document.getElementById('eventPhoto2');
  const eventDescEl = document.getElementById('eventDesc');
  const roundsListEl = document.getElementById('roundsList');
  const zonesPricingListEl = document.getElementById('zonesPricingList');
  const seatPreviewEl = document.getElementById('seatPreviewContainer');
  const bookmarkBtn = document.getElementById('bookmarkBtn');
  const infoDatesEl = document.getElementById('infoDates');
  const infoScheduleEl = document.getElementById('infoSchedule');
  const infoPriceRangeEl = document.getElementById('infoPriceRange');
  const infoOrganizerEl = document.getElementById('infoOrganizer');
  const buyNowBtn = document.getElementById('buyNowBtn');

  function esc(val) {
    return window.escapeHtml ? window.escapeHtml(val) : String(val ?? '');
  }

  function safeImg(url, fallback) {
    return window.sanitizeUrl ? window.sanitizeUrl(url, fallback) : esc(url || fallback);
  }

  function renderBookmarkLabel(isBookmarked) {
    return isBookmarked
      ? '<i class="fa-solid fa-heart c-red"></i> Bookmarked'
      : '<i class="fa-regular fa-heart"></i> Add to Bookmarks';
  }

  function renderZonesPricing(event) {
    if (!zonesPricingListEl) return;
    const zones = Array.isArray(event.zones) ? event.zones : [];
    const firstRoundZones = (event.rounds && event.rounds[0] && event.rounds[0].zones) || [];
    const availByZoneId = new Map(firstRoundZones.map((z) => [z.zoneId, z]));

    if (zones.length === 0) {
      zonesPricingListEl.innerHTML = '<p class="c-muted">Pricing information will be announced soon.</p>';
      return;
    }

    zonesPricingListEl.innerHTML = zones
      .map((z) => {
        const stats = availByZoneId.get(z.id);
        const seatMeta = stats
          ? `${stats.availableSeats}/${stats.totalSeats} seats available`
          : `${(z.rows || 4) * (z.cols || 8)} seats`;
        const priceNum = Number(z.price || 0);
        return `
          <div class="zone-price-row">
            <div>
              <strong>${esc(z.name)}</strong>
              <div class="fs-085 c-muted">${esc(seatMeta)}</div>
            </div>
            <span class="badge-pill-blue fs-085">${priceNum.toLocaleString()} THB</span>
          </div>
        `;
      })
      .join('');
  }

  async function renderSeatPreview(event) {
    if (!seatPreviewEl) return;
    const firstRound = event.rounds && event.rounds[0];
    if (!firstRound) {
      seatPreviewEl.innerHTML = '<p class="c-muted m-0">Seating plan will be available once show rounds are announced.</p>';
      return;
    }

    try {
      const seatRes = await API.booking.getSeats(event.id, firstRound.id);
      const seats = (seatRes && seatRes.seats) || [];
      if (seats.length === 0) {
        seatPreviewEl.innerHTML = '<p class="c-muted m-0">No seating chart configured yet.</p>';
        return;
      }

      const byZone = new Map();
      for (const s of seats) {
        const key = s.zoneName || s.zoneId || 'Zone';
        if (!byZone.has(key)) byZone.set(key, []);
        byZone.get(key).push(s);
      }

      const groupsHtml = Array.from(byZone.entries())
        .map(([zoneName, zoneSeats]) => {
          const previewLimit = 32;
          const visible = zoneSeats.slice(0, previewLimit);
          const extra = zoneSeats.length > previewLimit ? `<span class="fs-08 c-muted">+${zoneSeats.length - previewLimit} more</span>` : '';
          const dots = visible
            .map((s) => {
              const cls = s.status === 'AVAILABLE' ? 'available' : 'booked';
              return `<span class="seat seat-mini ${cls}" title="${esc(s.seatNumber)} (${esc(s.status)})">${esc(s.seatNumber)}</span>`;
            })
            .join('');
          return `
            <div class="event-seat-zone-group">
              <div class="fw-7 fs-09 c-ink">${esc(zoneName)}</div>
              <div class="event-seat-grid">${dots}${extra}</div>
            </div>
          `;
        })
        .join('');

      seatPreviewEl.innerHTML = `
        <div class="stage-banner mb-16">STAGE</div>
        ${groupsHtml}
        <div class="seat-legend mt-16">
          <div class="legend-item"><span class="seat seat-mini available">A1</span> Available</div>
          <div class="legend-item"><span class="seat seat-mini booked"></span> Booked / Held</div>
        </div>
      `;
    } catch (_) {
      seatPreviewEl.innerHTML = '<p class="c-muted m-0">Select Buy Now to view the interactive seating plan.</p>';
    }
  }

  function renderEvent(event) {
    document.title = `${event.title} - TicketHub`;
    if (eventTitleEl) eventTitleEl.textContent = event.title;

    if (eventMetaBadgesEl) {
      const statusBadgeCls = event.status === 'On Sale' ? 'badge-pill-red' : 'badge-pill-blue';
      eventMetaBadgesEl.innerHTML = `
        <span class="badge-pill-outline fs-08">${esc(event.category || 'Event')}</span>
        <span class="${statusBadgeCls} fs-08">${esc(event.status || 'On Sale')}</span>
      `;
    }

    if (eventArtistEl) {
      eventArtistEl.textContent = event.artist ? `Artist / Speaker: ${event.artist}` : '';
    }

    const venueFull = event.province ? `${event.venue}, ${event.province}` : (event.venue || '');
    if (eventVenueEl) {
      eventVenueEl.innerHTML = `<i class="fa-solid fa-location-dot c-blue mr-4"></i> ${esc(venueFull)}`;
    }

    const defaultImg1 = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1000&q=80';
    const defaultImg2 = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1000&q=80';

    if (eventPhoto1El) eventPhoto1El.src = safeImg(event.posterUrl, defaultImg1);
    if (eventPhoto2El) eventPhoto2El.src = safeImg(event.galleryUrl, defaultImg2);
    if (eventDescEl) eventDescEl.textContent = event.description || 'Join us for this exciting live event experience.';

    if (bookmarkBtn) {
      bookmarkBtn.innerHTML = renderBookmarkLabel(Boolean(event.isBookmarked));
      bookmarkBtn.onclick = async () => {
        if (!Auth.isLoggedIn()) {
          Auth.openAuthModal();
          return;
        }
        try {
          const bRes = await API.events.toggleBookmark(event.id);
          bookmarkBtn.innerHTML = renderBookmarkLabel(Boolean(bRes.isBookmarked));
        } catch (bErr) {
          await Popup.alert(bErr.message, { title: 'Bookmark Error' });
        }
      };
    }

    if (roundsListEl && event.rounds) {
      roundsListEl.innerHTML = event.rounds
        .map(
          (r) => `
            <div class="event-round-card">
              <div>
                <strong>${esc(r.label || 'Round')}</strong>
                <div class="fs-085 c-muted">
                  <i class="fa-solid fa-calendar-days mr-4"></i> ${esc(r.date)} &nbsp;
                  <i class="fa-solid fa-clock mr-4"></i> ${esc(r.time)}
                </div>
              </div>
              <span class="badge-pill-blue fs-08">${esc(event.status || 'Available')}</span>
            </div>
          `
        )
        .join('');
    }

    renderZonesPricing(event);

    const dates = (event.rounds || []).map((r) => r.date).filter(Boolean);
    if (infoDatesEl) infoDatesEl.textContent = dates.length > 0 ? dates.join(', ') : 'TBD';

    const gateTime = event.gateOpenTime || '16:00';
    const showTime = event.showTime || '19:00';
    if (infoScheduleEl) {
      infoScheduleEl.innerHTML = `
        <div>Open gate: ${esc(gateTime)}</div>
        <div>Showtime: ${esc(showTime)}</div>
      `;
    }

    if (infoPriceRangeEl) {
      const prices = (event.zones || []).map((z) => Number(z.price)).filter((p) => Number.isFinite(p));
      if (prices.length === 0) {
        infoPriceRangeEl.textContent = 'TBD';
      } else {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        infoPriceRangeEl.textContent = min === max
          ? `${min.toLocaleString()} THB`
          : `${min.toLocaleString()} - ${max.toLocaleString()} THB`;
      }
    }

    if (infoOrganizerEl) infoOrganizerEl.textContent = event.organizer || 'TicketHub Organizer';

    if (buyNowBtn) {
      if (event.status === 'Coming Soon') {
        buyNowBtn.disabled = true;
        buyNowBtn.textContent = 'Coming Soon';
        buyNowBtn.className = 'btn-pill-blue fs-115 w-100';
      } else if (event.status === 'Sold Out') {
        buyNowBtn.disabled = true;
        buyNowBtn.textContent = 'Sold Out';
        buyNowBtn.className = 'btn-pill-secondary fs-115 w-100';
      } else if (!event.isSaleOpen || event.status !== 'On Sale') {
        buyNowBtn.disabled = true;
        buyNowBtn.textContent = event.status === 'Closed' ? 'Closed' : 'Sales Closed';
        buyNowBtn.className = 'btn-pill-secondary fs-115 w-100';
      } else {
        buyNowBtn.disabled = false;
        buyNowBtn.textContent = 'Buy Now';
        buyNowBtn.className = 'btn-pill-red fs-115 w-100';
        buyNowBtn.onclick = () => {
          window.location.href = `/booking?eventId=${encodeURIComponent(event.id)}`;
        };
      }
    }
  }

  try {
    const res = await API.events.getById(eventId);
    const currentEvent = res.event;
    renderEvent(currentEvent);
    await renderSeatPreview(currentEvent);
  } catch (err) {
    console.error('Failed to load event:', err);
    if (eventTitleEl) eventTitleEl.textContent = 'Event Not Found';
    if (eventDescEl) eventDescEl.textContent = 'The requested event could not be found or has been removed.';
    if (seatPreviewEl) seatPreviewEl.innerHTML = '<p class="c-muted m-0">Unavailable</p>';
    if (buyNowBtn) {
      buyNowBtn.disabled = true;
      buyNowBtn.textContent = 'Event Unavailable';
    }
  }
});
