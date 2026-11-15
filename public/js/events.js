/**
 * TicketHub - All Events Listing Controller (/event)
 * Displays all events with search, category, status, date, province, active-sale filter, sort, and bookmarking.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('allEventsGrid');
  const countBadge = document.getElementById('eventsResultCount');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const statusFilter = document.getElementById('statusFilter');
  const provinceFilter = document.getElementById('provinceFilter');
  const dateFilter = document.getElementById('dateFilter');
  const saleActiveFilter = document.getElementById('saleActiveFilter');
  const sortFilter = document.getElementById('sortFilter');
  const resetFilters = document.getElementById('resetFilters');
  const navSearchTrigger = document.getElementById('navSearchTrigger');

  let requestSeq = 0;
  let searchTimer = null;

  function buildFilterParams() {
    return {
      search: searchInput ? searchInput.value.trim() : '',
      category: categoryFilter ? categoryFilter.value : '',
      status: statusFilter ? statusFilter.value : '',
      province: provinceFilter ? provinceFilter.value : '',
      date: dateFilter ? dateFilter.value : '',
      saleActive: saleActiveFilter && saleActiveFilter.checked ? 'true' : '',
      sort: sortFilter ? sortFilter.value : ''
    };
  }

  function renderEvents(events) {
    if (!grid) return;
    if (countBadge) {
      countBadge.textContent = `${events.length} Event${events.length === 1 ? '' : 's'}`;
    }

    if (events.length === 0) {
      grid.innerHTML = '<p class="empty-events-msg">No events match your search or filter criteria.</p>';
      return;
    }

    grid.innerHTML = events
      .map((e) =>
        EventCard.renderCard(e, {
          variant: e.status === 'On Sale' ? 'popular' : 'soon',
          badgeText: `${e.category || 'Event'} • ${e.status || 'On Sale'}`,
          showCategorySubtitle: true,
          preferPoster: true
        })
      )
      .join('');

    EventCard.bindBookmarkButtons(grid);
  }

  async function fetchAndRender() {
    const seq = ++requestSeq;
    try {
      const res = await API.events.list(buildFilterParams());
      if (seq !== requestSeq) return;
      renderEvents((res && res.events) || []);
    } catch (err) {
      if (seq !== requestSeq) return;
      console.error('Failed to load events:', err);
      if (countBadge) countBadge.textContent = '0 Events';
      if (grid) grid.innerHTML = '<p class="empty-events-msg">Unable to load events. Please try again.</p>';
    }
  }

  try {
    const [eventsRes, categoriesRes] = await Promise.all([
      API.events.list(),
      API.categories.list()
    ]);
    const allEvents = (eventsRes && eventsRes.events) || [];
    const categories = (categoriesRes && categoriesRes.categories) || [];
    EventCard.populateSelectOptions(allEvents, categories, {
      categoryEl: categoryFilter,
      provinceEl: provinceFilter
    });

    const params = new URLSearchParams(window.location.search);
    if (searchInput && params.get('search')) searchInput.value = params.get('search');
    if (categoryFilter && params.get('category')) categoryFilter.value = params.get('category');
    if (statusFilter && params.get('status')) statusFilter.value = params.get('status');

    if (params.toString()) {
      await fetchAndRender();
    } else {
      renderEvents(allEvents);
    }
  } catch (err) {
    console.error('Failed to initialize all events page:', err);
    if (grid) grid.innerHTML = '<p class="empty-events-msg">Unable to load events. Please try again.</p>';
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(fetchAndRender, 250);
    });
  }

  [categoryFilter, statusFilter, provinceFilter, dateFilter, saleActiveFilter, sortFilter].forEach((el) => {
    if (el) el.addEventListener('change', fetchAndRender);
  });

  if (resetFilters) {
    resetFilters.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      [categoryFilter, statusFilter, provinceFilter, dateFilter, sortFilter].forEach((el) => {
        if (el) el.value = '';
      });
      if (saleActiveFilter) saleActiveFilter.checked = false;
      fetchAndRender();
    });
  }

  if (navSearchTrigger && searchInput) {
    navSearchTrigger.addEventListener('click', () => {
      searchInput.focus();
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
});
