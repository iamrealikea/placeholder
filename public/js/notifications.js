/**
 * TicketHub - In-App Notifications Controller (Vanilla JS)
 * Polls user notifications, manages the bell badge count, and renders the dropdown drawer.
 */

const Notifications = {
  items: [],
  pollInterval: null,

  async init() {
    this.bindEvents();
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
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
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
        <li style="padding: 24px; text-align: center; color: #6B7280; font-size: 0.9rem;">
          No notifications yet.
        </li>
      `;
    } else {
      itemsHtml = this.items
        .map((n) => {
          const dateStr = new Date(n.createdAt).toLocaleString();
          return `
            <li class="notification-item ${n.isRead ? '' : 'unread'}" data-id="${n.id}">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                <strong style="font-size:0.9rem; color:#111827;">${n.subject || 'Notification'}</strong>
                <span style="font-size:0.75rem; color:#9CA3AF;">${dateStr}</span>
              </div>
              <p style="font-size:0.85rem; color:#4B5563; margin-bottom:6px; line-height:1.4;">${n.message || ''}</p>
              ${
                !n.isRead
                  ? `<button class="btn-mark-read" data-id="${n.id}" style="background:none; border:none; color:#1D56CF; font-size:0.75rem; font-weight:700; cursor:pointer; padding:0;">Mark as read</button>`
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
