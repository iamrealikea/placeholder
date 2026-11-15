/**
 * TicketHub - Home Page Controller (public/js/index.js)
 * Loads featured hero, popular events carousel, and upcoming/other events carousel,
 * and manages search, filtering, and sorting.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const heroBanner = document.getElementById('heroBanner');
  const heroBgImg = document.getElementById('heroBgImg');
  const popularContainer = document.getElementById('popularContainer');
  const soonContainer = document.getElementById('soonContainer');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const statusFilter = document.getElementById('statusFilter');
  const provinceFilter = document.getElementById('provinceFilter');
  const monthFilter = document.getElementById('monthFilter');
  const sortFilter = document.getElementById('sortFilter');
  const resetFilters = document.getElementById('resetFilters');

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const DEFAULT_HERO_BG = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1920&q=80';

  let requestSeq = 0;
  let searchTimer = null;

  function populateFilterOptions(events, categories) {
    EventCard.populateSelectOptions(events, categories, {
      categoryEl: categoryFilter,
      provinceEl: provinceFilter
    });

    if (monthFilter) {
      const months = new Set();
      events.forEach((e) => (e.rounds || []).forEach((r) => {
        if (r && /^\d{4}-\d{2}/.test(r.date || '')) months.add(r.date.slice(0, 7));
      }));
      monthFilter.innerHTML =
        '<option value="">Any Month</option>' +
        Array.from(months).sort().map((ym) => {
          const [y, m] = ym.split('-');
          return `<option value="${EventCard.esc(ym)}">${MONTH_NAMES[Number(m) - 1]} ${EventCard.esc(y)}</option>`;
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

  function renderFeaturedHero(events) {
    if (!heroBanner) return;
    const featured = events.find((e) => e.isFeatured) || events[0];
    if (!featured) return;

    const round = (featured.rounds && featured.rounds[0]) || {};
    const dateStr = round.date ? `${round.date} • ${round.time || ''}` : 'Upcoming 2026';
    const bgImage = EventCard.safeImg(featured.posterUrl, DEFAULT_HERO_BG);

    if (heroBgImg) heroBgImg.src = bgImage;

    heroBanner.innerHTML = `
      <div class="hero-top">
        <span class="badge-pill-red">Feature Event</span>
        <button type="button" class="btn-icon hero-bookmark-btn" data-bookmark-id="${EventCard.esc(featured.id)}"
          title="Bookmark event" aria-label="Bookmark ${EventCard.esc(featured.title)}">
          ${EventCard.heartMarkup(Boolean(featured.isBookmarked))}
        </button>
      </div>
      <div class="hero-content">
        <h1 class="hero-title">${EventCard.esc(featured.title)}</h1>
        <p class="hero-desc">${EventCard.esc((featured.description || '').slice(0, 150))}...</p>
        <div class="hero-meta">
          <span><i class="fa-solid fa-location-dot c-blue mr-4"></i> ${EventCard.esc(featured.venue || 'Bangkok Arena')}</span>
          <span>•</span>
          <span><i class="fa-solid fa-calendar-days mr-4"></i> ${EventCard.esc(dateStr)}</span>
        </div>
      </div>
      <div class="hero-bottom">
        <a href="/event?id=${encodeURIComponent(featured.id)}" class="btn-pill-red fs-11 p-12-32">
          Buy Now
        </a>
      </div>
    `;

    EventCard.bindBookmarkButtons(heroBanner);
  }

  function renderCarouselSection(container, events, emptyMsg, cardOptions) {
    if (!container) return;
    if (events.length === 0) {
      container.innerHTML = `<p class="empty-events-msg">${EventCard.esc(emptyMsg)}</p>`;
      return;
    }

    container.innerHTML = events.map((e) => EventCard.renderCard(e, cardOptions(e))).join('');
    EventCard.bindBookmarkButtons(container);
  }

  async function filterAndRenderEvents() {
    const seq = ++requestSeq;
    try {
      const res = await API.events.list(buildFilterParams());
      if (seq !== requestSeq) return;
      const events = (res && res.events) || [];

      const popular = events.filter((e) => e.status === 'On Sale' || e.isFeatured);
      const soon = events.filter((e) => e.status !== 'On Sale');

      renderCarouselSection(popularContainer, popular, 'No popular events match your search criteria.', (e) => ({
        layout: 'home',
        variant: 'popular',
        ctaText: e.status === 'On Sale' ? 'Buy Now' : (e.status || 'View')
      }));

      renderCarouselSection(soonContainer, soon, 'No upcoming events in this category.', (e) => ({
        layout: 'home',
        variant: 'soon',
        ctaText: e.status === 'Coming Soon' ? 'Soon' : (e.status || 'View'),
        preferPoster: true
      }));
    } catch (err) {
      if (seq !== requestSeq) return;
      console.error('Failed to filter events:', err);
      const msg = '<p class="empty-events-msg">Unable to load events. Please try again.</p>';
      if (popularContainer) popularContainer.innerHTML = msg;
      if (soonContainer) soonContainer.innerHTML = msg;
    }
  }

  try {
    const [res, categoryRes] = await Promise.all([
      API.events.list(),
      API.categories.list()
    ]);
    const allEvents = (res && res.events) || [];
    renderFeaturedHero(allEvents);
    populateFilterOptions(allEvents, (categoryRes && categoryRes.categories) || []);
    await filterAndRenderEvents();
  } catch (err) {
    console.error('Failed to load events:', err);
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(filterAndRenderEvents, 250);
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

  document.querySelectorAll('.carousel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const container = document.getElementById(btn.dataset.target);
      if (container) {
        const firstCard = container.querySelector('.card-home, .card-popular, .card-soon');
        const step = firstCard ? firstCard.offsetWidth + 24 : 444;
        container.scrollBy({
          left: btn.dataset.direction === 'left' ? -step : step,
          behavior: 'smooth'
        });
      }
    });
  });
});
