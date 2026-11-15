/**
 * TicketHub - In-App Notifications Controller (Vanilla JS)
 * Polls user notifications, manages the bell badge count, and renders the dropdown drawer.
 */

const Notifications = {
  items: [],
  pollInterval: null,

  async init() {
    this.bindEvents();
    if (window.Auth && Auth.ready) {
      await Auth.ready;
    }
    if (Auth.isLoggedIn()) {
      await this.fetch();
      this.startPolling();
    }
    Auth.onAuthChange((user) => {
      if (user) {
        this.fetch();
        this.startPolling();
      } else {
        this.stopPolling();
        this.items = [];
        this.updateBadge(0);
      }
    });
  },

  startPolling() {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      if (Auth.isLoggedIn()) {
        this.fetch();
      }
    }, 15000); // Poll every 15s
  },

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  },

  async fetch() {
    try {
      const res = await API.admin.getNotifications();
      this.items = (res && res.notifications) || [];
      const unreadCount = this.items.filter((n) => !n.isRead).length;
      this.updateBadge(unreadCount);
      return this.items;
    } catch (_) {
      // User might be unauthenticated
      return [];
    }
  },

  updateBadge(count) {
    const badge = document.querySelector('.notification-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('d-none');
      badge.hidden = false;
    } else {
      badge.classList.add('d-none');
      badge.hidden = true;
    }
  },

  bindEvents() {
    const bellBtn = document.querySelector('.notification-bell-btn');
    if (!bellBtn) return;

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!Auth.isLoggedIn()) {
        Auth.openAuthModal();
        return;
      }
      this.toggleDropdown(bellBtn);
    });
  },

  toggleDropdown(anchor) {
    let dropdown = document.getElementById('notificationDropdownDrawer');
    if (dropdown) {
      dropdown.remove();
      return;
    }

    dropdown = document.createElement('div');
    dropdown.id = 'notificationDropdownDrawer';
    dropdown.className = 'notification-dropdown';

    const unreadCount = this.items.filter((n) => !n.isRead).length;

    let itemsHtml = '';
    if (this.items.length === 0) {
      itemsHtml = `
        <li class="tc p-24 c-muted fs-09">
          No notifications yet.
        </li>
      `;
    } else {
      itemsHtml = this.items
        .map((n) => {
          const dateStr = new Date(n.createdAt).toLocaleString();
          return `
            <li class="notification-item ${n.isRead ? '' : 'unread'}" data-id="${escapeHtml(n.id)}">
              <div class="flex between items-start mb-4">
                <strong class="fs-09 c-ink">${escapeHtml(n.subject || 'Notification')}</strong>
                <span class="fs-075 c-faint">${escapeHtml(dateStr)}</span>
              </div>
              <p class="fs-085 c-ink-2 mb-6 lh-14">${escapeHtml(n.message || '')}</p>
              ${
                !n.isRead
                  ? `<button class="btn-mark-read border-none bg-white c-blue fs-075 fw-7 cursor-pointer p-0" data-id="${escapeHtml(n.id)}">Mark as read</button>`
                  : ''
              }
            </li>
          `;
        })
        .join('');
    }

    dropdown.innerHTML = `
      <div class="notification-dropdown-header">
        <span>Notifications (${unreadCount} unread)</span>
      </div>
      <ul class="notification-dropdown-list">
        ${itemsHtml}
      </ul>
    `;

    document.body.appendChild(dropdown);

    // Close on click outside
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);

    // Bind mark-read buttons
    dropdown.querySelectorAll('.btn-mark-read').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        try {
          await API.admin.markNotificationRead(id);
          const item = this.items.find((x) => x.id === id);
          if (item) item.isRead = true;
          const li = btn.closest('.notification-item');
          if (li) li.classList.remove('unread');
          btn.remove();
          const newUnread = this.items.filter((x) => !x.isRead).length;
          this.updateBadge(newUnread);
          const countSpan = dropdown.querySelector('.notification-dropdown-header span');
          if (countSpan) countSpan.textContent = `Notifications (${newUnread} unread)`;
        } catch (err) {
          console.error('Failed to mark read', err);
        }
      });
    });
  }
};

window.Notifications = Notifications;
document.addEventListener('DOMContentLoaded', () => Notifications.init());
