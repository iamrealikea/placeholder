/**
 * TicketHub - Home Page Controller (public/js/index.js)
 * Loads featured hero, popular events, and coming soon events, and manages search, filtering and sorting.
 * Filtering/sorting is performed by the backend (GET /api/events?province=&month=&sort=...).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const heroBanner = document.getElementById('heroBanner');
  const popularContainer = document.getElementById('popularContainer');
  const soonContainer = document.getElementById('soonContainer');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const statusFilter = document.getElementById('statusFilter');
  const provinceFilter = document.getElementById('provinceFilter');
  const monthFilter = document.getElementById('monthFilter');
  const sortFilter = document.getElementById('sortFilter');
  const resetFilters = document.getElementById('resetFilters');

  let allEvents = []; // unfiltered list: used for hero + to build province/month options
  let requestSeq = 0; // guards against out-of-order responses while typing/changing filters
  let searchTimer = null;

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function venueText(e) {
    const text = e.province ? `${e.venue}, ${e.province}` : (e.venue || '');
    return window.escapeHtml ? window.escapeHtml(text) : text;
  }

  function populateFilterOptions(events, categories) {
    if (categoryFilter) {
      const categoryNames = new Set([
        ...(categories || []).map((category) => category.name),
        ...events.map((event) => event.category)
      ].filter((name) => typeof name === 'string' && name.trim()));
      const selectedCategory = categoryFilter.value;
      categoryFilter.innerHTML =
        '<option value="">All Categories</option>' +
        Array.from(categoryNames)
          .sort((a, b) => a.localeCompare(b))
          .map((name) => `<option value="${window.escapeHtml(name)}">${window.escapeHtml(name)}</option>`)
          .join('');
      categoryFilter.value = selectedCategory;
    }

    if (provinceFilter) {
      const provinces = Array.from(new Set(events.map((e) => (e.province || '').trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      provinceFilter.innerHTML =
        '<option value="">All Provinces</option>' +
        provinces.map((p) => `<option value="${window.escapeHtml(p)}">${window.escapeHtml(p)}</option>`).join('');
    }
    if (monthFilter) {
      const months = new Set();
      events.forEach((e) => (e.rounds || []).forEach((r) => {
        if (r && /^\d{4}-\d{2}/.test(r.date || '')) months.add(r.date.slice(0, 7));
      }));
      monthFilter.innerHTML =
        '<option value="">Any Month</option>' +
        Array.from(months).sort().map((ym) => {
          const [y, m] = ym.split('-');
          return `<option value="${ym}">${MONTH_NAMES[Number(m) - 1]} ${y}</option>`;
        }).join('');
    }
  }

  function buildFilterParams() {
    return {
      search: (searchInput.value || '').trim(),
      category: categoryFilter.value,
      status: statusFilter.value,
      province: provinceFilter ? provinceFilter.value : '',
      month: monthFilter ? monthFilter.value : '',
      sort: sortFilter ? sortFilter.value : ''
    };
  }

  async function loadEvents() {
    try {
      const [res, categoryRes] = await Promise.all([
        API.events.list(),
        API.categories.list()
      ]);
      allEvents = (res && res.events) || [];
      renderFeaturedHero(allEvents);
      populateFilterOptions(allEvents, (categoryRes && categoryRes.categories) || []);
      await filterAndRenderEvents();
    } catch (err) {
      console.error('Failed to load events:', err);
    }
  }

  function renderFeaturedHero(events) {
    if (!heroBanner) return;
    const featured = events.find((e) => e.isFeatured) || events[0];
    if (!featured) return;

    const round = (featured.rounds && featured.rounds[0]) || {};
    const dateStr = round.date ? `${round.date} • ${round.time || ''}` : 'Upcoming 2026';
    const bgImage = featured.posterUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1920&q=80';

    // Update full-width hero section background so it fills the screen width
    const heroSection = document.getElementById('heroSection') || heroBanner.closest('.hero-section') || heroBanner;
    if (heroSection) {
      heroSection.style.background = `linear-gradient(180deg, rgba(17, 24, 39, 0.35) 0%, rgba(17, 24, 39, 0.85) 100%), url('${bgImage}') center/cover no-repeat`;
    }
    heroBanner.style.background = 'rgba(17, 24, 39, 0.3)';
    heroBanner.style.backdropFilter = 'blur(2px)';
    heroBanner.style.webkitBackdropFilter = 'blur(2px)';

    heroBanner.innerHTML = `
      <div class="hero-top">
        <span class="badge-pill-red">Feature Event</span>
        <button class="btn-icon" style="color: #FFFFFF; background: rgba(0,0,0,0.4);" onclick="toggleBookmark('${featured.id}', this)" title="Bookmark event">
          ${featured.isBookmarked ? '<i class="fa-solid fa-heart" style="color: var(--candy-apple);"></i>' : '<i class="fa-regular fa-heart"></i>'}
        </button>
      </div>
      <div class="hero-content">
        <h1 class="hero-title">${featured.title}</h1>
        <p class="hero-desc">${(featured.description || '').slice(0, 150)}...</p>
        <div class="hero-meta">
          <span><i class="fa-solid fa-location-dot" style="color: var(--monday-blue); margin-right: 4px;"></i> ${featured.venue || 'Bangkok Arena'}</span>
          <span>•</span>
          <span><i class="fa-solid fa-calendar-days" style="margin-right: 4px;"></i> ${dateStr}</span>
        </div>
      </div>
      <div class="hero-bottom">
        <a href="/event?id=${featured.id}" class="btn-pill-red" style="font-size: 1.1rem; padding: 12px 32px;">
          Buy Now
        </a>
      </div>
    `;
  }

  async function filterAndRenderEvents() {
    const seq = ++requestSeq;
    try {
      const res = await API.events.list(buildFilterParams());
      if (seq !== requestSeq) return; // a newer request superseded this one
      const events = (res && res.events) || [];
      renderPopular(events);
      renderSoon(events);
    } catch (err) {
      if (seq !== requestSeq) return;
      console.error('Failed to filter events:', err);
      const msg = `<p style="grid-column: 1/-1; text-align: center; color: #6B7280; padding: 32px;">Unable to load events. Please try again.</p>`;
      if (popularContainer) popularContainer.innerHTML = msg;
      if (soonContainer) soonContainer.innerHTML = msg;
    }
  }

  function renderPopular(events) {
    if (!popularContainer) return;
    const popular = events.filter((e) => e.status === 'On Sale' || e.isFeatured);

    if (popular.length === 0) {
      popularContainer.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #6B7280; padding: 32px;">No popular events match your search criteria.</p>`;
      return;
    }

    popularContainer.innerHTML = popular
      .map((e) => {
        const round = (e.rounds && e.rounds[0]) || {};
        const minPrice = e.zones && e.zones.length > 0 ? Math.min(...e.zones.map((z) => z.price)) : 1200;
        const img = e.galleryUrl || e.posterUrl || 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80';

        return `
          <div class="card-popular">
            <div class="card-image-wrap">
              <span class="card-badge-floating badge-pill-red">${e.category || 'Concert'}</span>
              <img src="${img}" alt="${e.title}" loading="lazy">
            </div>
            <div class="card-body">
              <div class="card-subtitle">${e.artist || 'Special Performance'}</div>
              <h3 class="card-title">${e.title}</h3>
              <div class="card-meta">
                <span><i class="fa-solid fa-location-dot" style="color: var(--monday-blue); margin-right: 4px;"></i> ${venueText(e)}</span>
                <span>•</span>
                <span><i class="fa-solid fa-calendar-days" style="margin-right: 4px;"></i> ${round.date || 'TBD'}</span>
              </div>
              <div class="card-footer">
                <div class="card-price">
                  <small>Starts from</small><br>
                  ${minPrice.toLocaleString()} THB
                </div>
                <a href="/event?id=${e.id}" class="btn-pill-red">
                  Buy Now
                </a>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderSoon(events) {
    if (!soonContainer) return;
    const soon = events.filter((e) => e.status === 'Coming Soon' || e.status !== 'On Sale');

    if (soon.length === 0) {
      soonContainer.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #6B7280; padding: 32px;">No upcoming events in this category.</p>`;
      return;
    }

    soonContainer.innerHTML = soon
      .map((e) => {
        const round = (e.rounds && e.rounds[0]) || {};
        const minPrice = e.zones && e.zones.length > 0 ? Math.min(...e.zones.map((z) => z.price)) : 900;
        const img = e.posterUrl || 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=800&q=80';

        return `
          <div class="card-soon">
            <div class="card-image-wrap">
              <span class="card-badge-floating badge-pill-blue">Coming Soon</span>
              <img src="${img}" alt="${e.title}" loading="lazy">
            </div>
            <div class="card-body">
              <div class="card-subtitle">${e.artist || 'Special Exhibition'}</div>
              <h3 class="card-title">${e.title}</h3>
              <div class="card-meta">
                <span><i class="fa-solid fa-location-dot" style="color: var(--monday-blue); margin-right: 4px;"></i> ${venueText(e)}</span>
                <span>•</span>
                <span><i class="fa-solid fa-calendar-days" style="margin-right: 4px;"></i> ${round.date || 'Announcing Soon'}</span>
              </div>
              <div class="card-footer">
                <div class="card-price">
                  <small>Expected from</small><br>
                  ${minPrice.toLocaleString()} THB
                </div>
                <a href="/event?id=${e.id}" class="btn-pill-blue">
                  Soon
                </a>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Event Listeners for Filters
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(filterAndRenderEvents, 250); // debounce typing
  });
  [categoryFilter, statusFilter, provinceFilter, monthFilter, sortFilter].forEach((el) => {
    if (el) el.addEventListener('change', () => filterAndRenderEvents());
  });
  if (resetFilters) {
    resetFilters.addEventListener('click', () => {
      searchInput.value = '';
      [categoryFilter, statusFilter, provinceFilter, monthFilter, sortFilter].forEach((el) => {
        if (el) el.value = '';
      });
      filterAndRenderEvents();
    });
  }

  const navSearchTrigger = document.getElementById('navSearchTrigger');
  if (navSearchTrigger && searchInput) {
    navSearchTrigger.addEventListener('click', () => {
      searchInput.focus();
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Bookmark toggle
  window.toggleBookmark = async (eventId, btn) => {
    if (!Auth.isLoggedIn()) {
      Auth.openAuthModal();
      return;
    }
    try {
      const res = await API.events.toggleBookmark(eventId);
      btn.innerHTML = res.isBookmarked ? '<i class="fa-solid fa-heart" style="color: var(--candy-apple);"></i>' : '<i class="fa-regular fa-heart"></i>';
    } catch (err) {
      await Popup.alert(err.message, { title: 'Bookmark Error' });
    }
  };

  // Carousel Arrow Controls
  document.querySelectorAll('.carousel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const container = document.getElementById(targetId);
      if (container) {
        const scrollAmount = 380;
        container.scrollBy({
          left: btn.dataset.direction === 'left' ? -scrollAmount : scrollAmount,
          behavior: 'smooth'
        });
      }
    });
  });

  await loadEvents();
});