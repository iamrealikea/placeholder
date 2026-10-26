/**
 * TicketHub - Home Page Controller (public/js/index.js)
 * Loads featured hero, popular events, and coming soon events, and manages search & filtering.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const heroBanner = document.getElementById('heroBanner');
  const popularContainer = document.getElementById('popularContainer');
  const soonContainer = document.getElementById('soonContainer');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const statusFilter = document.getElementById('statusFilter');

  let allEvents = [];

  async function loadEvents() {
    try {
      const res = await API.events.list();
      allEvents = (res && res.events) || [];
      renderFeaturedHero(allEvents);
      filterAndRenderEvents();
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
    const bgImage = featured.posterUrl || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1400&q=80';

    heroBanner.style.background = `linear-gradient(180deg, rgba(17, 24, 39, 0.4) 0%, rgba(17, 24, 39, 0.88) 100%), url('${bgImage}') center/cover no-repeat`;

    heroBanner.innerHTML = `
      <div class="hero-top">
        <span class="badge-pill-red">Feature Event</span>
        <button class="btn-icon" style="color: #FFFFFF; background: rgba(0,0,0,0.4);" onclick="toggleBookmark('${featured.id}', this)" title="Bookmark event">
          ${featured.isBookmarked ? '❤️' : '🤍'}
        </button>
      </div>
      <div class="hero-content">
        <h1 class="hero-title">${featured.title}</h1>
        <p class="hero-desc">${(featured.description || '').slice(0, 150)}...</p>
        <div class="hero-meta">
          <span>📍 ${featured.venue || 'Bangkok Arena'}</span>
          <span>•</span>
          <span>📅 ${dateStr}</span>
        </div>
      </div>
      <div class="hero-bottom">
        <a href="/event.html?id=${featured.id}" class="btn-pill-red" style="font-size: 1.1rem; padding: 12px 32px;">
          Buy Now
        </a>
      </div>
    `;
  }

  function filterAndRenderEvents() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const cat = categoryFilter.value;
    const stat = statusFilter.value;

    let filtered = allEvents.filter((e) => {
      const matchQ =
        !query ||
        e.title.toLowerCase().includes(query) ||
        (e.artist && e.artist.toLowerCase().includes(query)) ||
        (e.venue && e.venue.toLowerCase().includes(query));
      const matchCat = !cat || e.category.toLowerCase() === cat.toLowerCase();
      const matchStat = !stat || e.status.toLowerCase() === stat.toLowerCase();
      return matchQ && matchCat && matchStat;
    });

    renderPopular(filtered);
    renderSoon(filtered);
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
                <span>📍 ${e.venue}</span>
                <span>•</span>
                <span>📅 ${round.date || 'TBD'}</span>
              </div>
              <div class="card-footer">
                <div class="card-price">
                  <small>Starts from</small><br>
                  ${minPrice.toLocaleString()} THB
                </div>
                <a href="/event.html?id=${e.id}" class="btn-pill-red">
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
                <span>📍 ${e.venue}</span>
                <span>•</span>
                <span>📅 ${round.date || 'Announcing Soon'}</span>
              </div>
              <div class="card-footer">
                <div class="card-price">
                  <small>Expected from</small><br>
                  ${minPrice.toLocaleString()} THB
                </div>
                <a href="/event.html?id=${e.id}" class="btn-pill-blue">
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
  searchInput.addEventListener('input', () => filterAndRenderEvents());
  categoryFilter.addEventListener('change', () => filterAndRenderEvents());
  statusFilter.addEventListener('change', () => filterAndRenderEvents());

  // Bookmark toggle
  window.toggleBookmark = async (eventId, btn) => {
    if (!Auth.isLoggedIn()) {
      Auth.openAuthModal();
      return;
    }
    try {
      const res = await API.events.toggleBookmark(eventId);
      btn.textContent = res.isBookmarked ? '❤️' : '🤍';
    } catch (err) {
      alert(err.message);
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
