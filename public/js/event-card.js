/**
 * Shared event card rendering and bookmark handler for Home and All Events pages.
 */
(() => {
  const DEFAULT_CARD_IMG = 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80';

  function esc(val) {
    return window.escapeHtml ? window.escapeHtml(val) : String(val ?? '');
  }

  function safeImg(url, fallback = DEFAULT_CARD_IMG) {
    return window.sanitizeUrl ? window.sanitizeUrl(url, fallback) : esc(url || fallback);
  }

  function heartMarkup(isBookmarked) {
    return isBookmarked
      ? '<i class="fa-solid fa-heart c-red"></i>'
      : '<i class="fa-regular fa-heart"></i>';
  }

  function formatVenue(e) {
    return e.province ? `${e.venue || ''}, ${e.province}` : (e.venue || '');
  }

  function getMinPrice(e) {
    if (!Array.isArray(e.zones) || e.zones.length === 0) return 0;
    const prices = e.zones.map((z) => Number(z.price)).filter((p) => Number.isFinite(p));
    return prices.length ? Math.min(...prices) : 0;
  }

  function renderCard(e, opts = {}) {
    const isSoon = opts.variant === 'soon' || e.status !== 'On Sale';
    const cardClass = opts.cardClass || (isSoon ? 'card-soon' : 'card-popular');
    const badgeClass = opts.badgeClass || (isSoon ? 'badge-pill-blue' : 'badge-pill-red');
    const btnClass = opts.btnClass || (isSoon ? 'btn-pill-blue' : 'btn-pill-red');
    const badgeText = opts.badgeText || (isSoon ? (e.status || 'Coming Soon') : (e.category || 'Concert'));
    const priceLabel = opts.priceLabel || (e.status === 'Coming Soon' ? 'Expected from' : 'Starts from');
    const ctaText = opts.ctaText || (e.status === 'On Sale' ? 'Buy Now' : (e.status === 'Coming Soon' ? 'Details' : e.status || 'View'));
    const round = (e.rounds && e.rounds[0]) || {};
    const img = safeImg(opts.preferPoster ? (e.posterUrl || e.galleryUrl) : (e.galleryUrl || e.posterUrl));
    const minPrice = getMinPrice(e);
    const eventUrl = `/event?id=${encodeURIComponent(e.id || '')}`;

    return `
      <div class="${cardClass}">
        <div class="card-image-wrap">
          <span class="card-badge-floating ${badgeClass}">${esc(badgeText)}</span>
          <button type="button" class="btn-icon card-bookmark-btn" data-bookmark-id="${esc(e.id)}"
            title="Bookmark event" aria-label="Bookmark ${esc(e.title)}">
            ${heartMarkup(Boolean(e.isBookmarked))}
          </button>
          <img src="${img}" alt="${esc(e.title)}" loading="lazy">
        </div>
        <div class="card-body">
          <div class="card-subtitle">${esc(e.artist || 'Special Performance')}${opts.showCategorySubtitle ? ` • ${esc(e.category || 'Event')}` : ''}</div>
          <h3 class="card-title">${esc(e.title)}</h3>
          <div class="card-meta">
            <span><i class="fa-solid fa-location-dot c-blue mr-4"></i> ${esc(formatVenue(e))}</span>
            <span>•</span>
            <span><i class="fa-solid fa-calendar-days mr-4"></i> ${esc(round.date || 'TBD')}</span>
          </div>
          <div class="card-footer">
            <div class="card-price">
              <small>${esc(priceLabel)}</small><br>
              ${minPrice.toLocaleString()} THB
            </div>
            <a href="${eventUrl}" class="${btnClass}">${esc(ctaText)}</a>
          </div>
        </div>
      </div>
    `;
  }

  async function toggleBookmark(eventId, btn) {
    if (!Auth.isLoggedIn()) {
      Auth.openAuthModal();
      return;
    }
    try {
      const res = await API.events.toggleBookmark(eventId);
      btn.innerHTML = heartMarkup(Boolean(res.isBookmarked));
    } catch (err) {
      await Popup.alert(err.message, { title: 'Bookmark Error' });
    }
  }

  function bindBookmarkButtons(root = document) {
    root.querySelectorAll('[data-bookmark-id]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggleBookmark(btn.dataset.bookmarkId, btn);
      });
    });
  }

  function populateSelectOptions(events, categories, { categoryEl, provinceEl } = {}) {
    if (categoryEl) {
      const names = new Set([
        ...(categories || []).map((c) => c.name),
        ...(events || []).map((e) => e.category)
      ].filter((n) => typeof n === 'string' && n.trim()));
      const prev = categoryEl.value;
      categoryEl.innerHTML = '<option value="">All Categories</option>' +
        Array.from(names).sort((a, b) => a.localeCompare(b))
          .map((name) => `<option value="${esc(name)}">${esc(name)}</option>`)
          .join('');
      categoryEl.value = prev;
    }

    if (provinceEl) {
      const provinces = Array.from(new Set((events || []).map((e) => (e.province || '').trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      const prev = provinceEl.value;
      provinceEl.innerHTML = '<option value="">All Provinces</option>' +
        provinces.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
      provinceEl.value = prev;
    }
  }

  window.EventCard = {
    renderCard,
    bindBookmarkButtons,
    populateSelectOptions,
    toggleBookmark,
    heartMarkup,
    safeImg,
    esc
  };
})();
