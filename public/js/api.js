/**
 * TicketHub - Unified API Client (Vanilla JS)
 * Handles REST requests, JWT tokens, cookie authentication, and error normalization.
 */

const API = {
  baseUrl: '/api',

  getToken() {
    return localStorage.getItem('tickethub_token') || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('tickethub_token', token);
    } else {
      localStorage.removeItem('tickethub_token');
    }
  },

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();
    const headers = {
      ...(options.headers || {})
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include' // Sends tickethub_token cookie
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data.error || data.message || `HTTP ${res.status}: Request failed`;
      const err = new Error(errorMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  },

  auth: {
    login: (body) => API.request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    register: (body) => API.request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    socialConfig: () => API.request('/auth/social-config'),
    socialLogin: (body) => API.request('/auth/social-login', { method: 'POST', body: JSON.stringify(body) }),
    logout: () => API.request('/auth/logout', { method: 'POST' }),
    getMe: () => API.request('/auth/me'),
    getProfile: () => API.request('/auth/profile'),
    updateProfile: (body) => API.request('/auth/profile', { method: 'PUT', body: JSON.stringify(body) }),
    uploadAvatar: (formData) => API.request('/auth/avatar', { method: 'POST', body: formData })
  },

  events: {
    // Supported params: search, category, status, province, location, month (YYYY-MM | 1-12), sort (price_asc | price_desc)
    // Empty / null / undefined values are dropped so they are never sent as "?province=".
    list: (params = {}) => {
      const clean = new URLSearchParams();
      for (const [key, val] of Object.entries(params || {})) {
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          clean.set(key, String(val).trim());
        }
      }
      const q = clean.toString();
      return API.request(`/events${q ? `?${q}` : ''}`);
    },
    getById: (id) => API.request(`/events/${id}`),
    templates: () => API.request('/events/templates'),
    toggleBookmark: (id) => API.request(`/events/${id}/bookmark`, { method: 'POST' }),
    create: (body) => API.request('/events', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => API.request(`/events/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id, password) => API.request(`/events/${id}`, { method: 'DELETE', body: JSON.stringify(typeof password === 'object' && password !== null ? password : { password }) })
  },

  categories: {
    list: () => API.request('/categories'),
    create: (body) => API.request('/categories', { method: 'POST', body: JSON.stringify(body) })
  },

  booking: {
    getSeats: (eventId, roundId) => API.request(`/bookings/events/${eventId}/rounds/${roundId}/seats`),
    holdSeats: (body) => API.request('/bookings/hold', { method: 'POST', body: JSON.stringify(body) }),
    getSummary: (bookingId) => API.request(`/bookings/${bookingId}/summary`),
    applyDiscount: (bookingId, body) => API.request(`/bookings/${bookingId}/apply-discount`, { method: 'POST', body: JSON.stringify(body) }),
    pay: (bookingId, body) => API.request(`/bookings/${bookingId}/pay`, { method: 'POST', body: JSON.stringify(body) }),
    cancel: (bookingId) => API.request(`/bookings/${bookingId}/cancel`, { method: 'POST' })
  },

  tickets: {
    getMyTickets: () => API.request('/tickets/my'),
    getHistory: () => API.request('/tickets/history'),
    validate: (body) => API.request('/tickets/validate', { method: 'POST', body: JSON.stringify(body) }),
    validateTicket: (ticketCode) => API.request('/tickets/validate', { method: 'POST', body: JSON.stringify({ ticketCode }) })
  },

  admin: {
    getDashboard: () => API.request('/admin/dashboard'),
    updateSeating: (eventId, body) => API.request(`/admin/events/${eventId}/seating`, { method: 'PUT', body: JSON.stringify(body) }),
    getBackups: () => API.request('/admin/backups'),
    createBackup: (body = {}) => API.request('/admin/backups', { method: 'POST', body: JSON.stringify(body) }),
    restoreBackup: (body) => API.request('/admin/backups/restore', { method: 'POST', body: JSON.stringify(body) }),
    getNotifications: () => API.request('/admin/notifications'),
    markNotificationRead: (id) => API.request(`/admin/notifications/${id}/read`, { method: 'PUT' }),
    getUsers: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return API.request(`/admin/users${q ? `?${q}` : ''}`);
    },
    updateUserRole: (userId, body) => {
      return API.request(`/admin/users/${encodeURIComponent(userId)}/role`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    },
    inspectEvent: (id) => API.request('/admin/events/' + encodeURIComponent(id || '') + '/inspect'),
    getTransactions: (filters = {}) => {
      let q = '';
      if (typeof filters === 'string') {
        q = filters.startsWith('?') ? filters.slice(1) : filters;
      } else if (typeof URLSearchParams !== 'undefined' && filters instanceof URLSearchParams) {
        q = filters.toString();
      } else if (filters && typeof filters === 'object') {
        const params = new URLSearchParams();
        for (const [key, val] of Object.entries(filters)) {
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            params.set(key, String(val).trim());
          }
        }
        q = params.toString();
      }
      return API.request(`/admin/transactions${q ? `?${q}` : ''}`);
    }
  },

  support: {
    submit: (body) => API.request('/support', { method: 'POST', body: JSON.stringify(body) }),
    getMy: () => API.request('/support/my'),
    getAll: () => API.request('/support/all'),
    reply: (id, body) => API.request(`/support/${id}/reply`, { method: 'PUT', body: JSON.stringify(body) })
  }
};

window.API = API;

/**
 * TicketHub - Unified Popup Controller (Vanilla JS & Native <dialog>)
 * Matches Figma 86:214 (Small Option Popup) and 86:161 (Big Option Popup)
 */
function escapePopupHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeSafeUrl(url, fallback = '') {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (/^(https?:\/\/|\/uploads\/)/i.test(trimmed)) {
    return escapePopupHtml(trimmed);
  }
  return fallback;
}

if (typeof window !== 'undefined') {
  window.escapeHtml = escapePopupHtml;
  window.sanitizeUrl = sanitizeSafeUrl;
}
if (typeof global !== 'undefined') {
  global.escapeHtml = escapePopupHtml;
  global.sanitizeUrl = sanitizeSafeUrl;
}

const Popup = {
  escapeHtml: escapePopupHtml,
  sanitizeUrl: sanitizeSafeUrl,

  alert(message, options = {}) {
    return new Promise((resolve) => {
      const opts = typeof options === 'string' ? { title: options } : (options || {});
      const title = opts.title || 'Alert';
      const buttonText = opts.buttonText || opts.confirmText || opts.okText || 'OK';
      const variant = opts.variant || 'small';
      const titleId = 'th-popup-title-' + Math.random().toString(36).slice(2, 9);

      const dialog = document.createElement('dialog');
      dialog.className = 'th-popup-dialog';
      dialog.setAttribute('closedby', 'any');
      dialog.setAttribute('aria-labelledby', titleId);

      dialog.innerHTML = `
        <div class="th-popup th-popup--${variant}">
          <div class="th-popup-header">
            <h3 class="th-popup-title" id="${titleId}">${escapePopupHtml(title)}</h3>
            ${variant === 'big' ? `
            <button type="button" class="th-popup-close" aria-label="Close">
              <img src="/images/popup-close-icon.svg" alt="Close">
            </button>` : ''}
          </div>
          <div class="th-popup-body">
            <p>${escapePopupHtml(message)}</p>
          </div>
          <div class="th-popup-actions--${variant}">
            <button type="button" class="th-popup-btn th-popup-btn--primary" autofocus>${escapePopupHtml(buttonText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (dialog.open && typeof dialog.close === 'function') dialog.close();
        dialog.remove();
        resolve();
      };

      const primaryBtn = dialog.querySelector('.th-popup-btn--primary');
      if (primaryBtn) primaryBtn.onclick = finish;

      const closeBtn = dialog.querySelector('.th-popup-close');
      if (closeBtn) closeBtn.onclick = finish;

      dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          finish();
        }
      });

      dialog.addEventListener('close', finish, { once: true });

      // Fallback for browsers without closedby support (modern-web-guidance)
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        const isOutside = (e) => {
          const rect = dialog.getBoundingClientRect();
          return (
            e.clientY < rect.top ||
            e.clientY > rect.bottom ||
            e.clientX < rect.left ||
            e.clientX > rect.right
          );
        };
        let pressedOutside = false;
        dialog.addEventListener('pointerdown', (e) => {
          pressedOutside = (e.target === dialog) && isOutside(e);
        });
        dialog.addEventListener('pointerup', (e) => {
          if (pressedOutside && (e.target === dialog) && isOutside(e)) {
            finish();
          }
        });
        dialog.addEventListener('click', (e) => {
          if ((e.target === dialog) && isOutside(e)) {
            finish();
          }
        });
      }

      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    });
  },

  confirm(message, options = {}) {
    return new Promise((resolve) => {
      const opts = typeof options === 'string' ? { title: options } : (options || {});
      const title = opts.title || 'Confirm';
      const confirmText = opts.confirmText || opts.buttonText || opts.okText || 'Confirm';
      const cancelText = opts.cancelText || 'Cancel';
      const variant = opts.variant || 'small';
      const destructive = !!opts.destructive;
      const primaryBtnClass = 'th-popup-btn th-popup-btn--primary' + (destructive ? ' th-popup-btn--destructive' : '');
      const titleId = 'th-popup-title-' + Math.random().toString(36).slice(2, 9);

      const dialog = document.createElement('dialog');
      dialog.className = 'th-popup-dialog';
      dialog.setAttribute('closedby', 'any');
      dialog.setAttribute('aria-labelledby', titleId);

      let actionsHtml = '';
      if (variant === 'big') {
        actionsHtml = `
          <div class="th-popup-actions--big">
            <button type="button" class="${primaryBtnClass}" ${destructive ? '' : 'autofocus'}>${escapePopupHtml(confirmText)}</button>
            <button type="button" class="th-popup-btn th-popup-btn--secondary" ${destructive ? 'autofocus' : ''}>${escapePopupHtml(cancelText)}</button>
          </div>
        `;
      } else {
        actionsHtml = `
          <div class="th-popup-actions--small">
            <button type="button" class="th-popup-btn th-popup-btn--secondary" ${destructive ? 'autofocus' : ''}>${escapePopupHtml(cancelText)}</button>
            <button type="button" class="${primaryBtnClass}" ${destructive ? '' : 'autofocus'}>${escapePopupHtml(confirmText)}</button>
          </div>
        `;
      }

      dialog.innerHTML = `
        <div class="th-popup th-popup--${variant}">
          <div class="th-popup-header">
            <h3 class="th-popup-title" id="${titleId}">${escapePopupHtml(title)}</h3>
            ${variant === 'big' ? `
            <button type="button" class="th-popup-close" aria-label="Close">
              <img src="/images/popup-close-icon.svg" alt="Close">
            </button>` : ''}
          </div>
          <div class="th-popup-body">
            <p>${escapePopupHtml(message)}</p>
          </div>
          ${actionsHtml}
        </div>
      `;

      document.body.appendChild(dialog);

      let resolved = false;
      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        if (dialog.open && typeof dialog.close === 'function') dialog.close();
        dialog.remove();
        resolve(result);
      };

      const primaryBtn = dialog.querySelector('.th-popup-btn--primary');
      if (primaryBtn) primaryBtn.onclick = () => finish(true);

      const secondaryBtn = dialog.querySelector('.th-popup-btn--secondary');
      if (secondaryBtn) secondaryBtn.onclick = () => finish(false);

      const closeBtn = dialog.querySelector('.th-popup-close');
      if (closeBtn) closeBtn.onclick = () => finish(false);

      dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      });

      dialog.addEventListener('close', () => finish(false), { once: true });

      // Fallback for browsers without closedby support
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        const isOutside = (e) => {
          const rect = dialog.getBoundingClientRect();
          return (
            e.clientY < rect.top ||
            e.clientY > rect.bottom ||
            e.clientX < rect.left ||
            e.clientX > rect.right
          );
        };
        let pressedOutside = false;
        dialog.addEventListener('pointerdown', (e) => {
          pressedOutside = (e.target === dialog) && isOutside(e);
        });
        dialog.addEventListener('pointerup', (e) => {
          if (pressedOutside && (e.target === dialog) && isOutside(e)) {
            finish(false);
          }
        });
        dialog.addEventListener('click', (e) => {
          if ((e.target === dialog) && isOutside(e)) {
            finish(false);
          }
        });
      }

      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    });
  },

  prompt(message, defaultValue = '', options = {}) {
    return new Promise((resolve) => {
      let defaultVal = defaultValue;
      let opts = options;
      if (typeof defaultValue === 'object' && defaultValue !== null) {
        opts = Object.assign({}, defaultValue, typeof options === 'object' && options !== null ? options : {});
        defaultVal = opts.defaultValue !== undefined ? opts.defaultValue : (opts.value !== undefined ? opts.value : '');
      } else if (typeof options === 'string') {
        opts = { title: options };
      } else {
        opts = opts || {};
      }

      const title = opts.title || 'Prompt';
      const confirmText = opts.confirmText || opts.buttonText || opts.okText || 'OK';
      const cancelText = opts.cancelText || 'Cancel';
      const placeholder = opts.placeholder || '';
      const inputType = opts.inputType || 'text';
      const titleId = 'th-popup-title-' + Math.random().toString(36).slice(2, 9);

      const dialog = document.createElement('dialog');
      dialog.className = 'th-popup-dialog';
      dialog.setAttribute('closedby', 'any');
      dialog.setAttribute('aria-labelledby', titleId);

      dialog.innerHTML = `
        <div class="th-popup th-popup--big">
          <div class="th-popup-header">
            <h3 class="th-popup-title" id="${titleId}">${escapePopupHtml(title)}</h3>
            <button type="button" class="th-popup-close" aria-label="Close">
              <img src="/images/popup-close-icon.svg" alt="Close">
            </button>
          </div>
          <div class="th-popup-body">
            <p class="th-popup-prompt-msg">${escapePopupHtml(message)}</p>
            <input type="${escapePopupHtml(inputType)}" class="th-popup-prompt-input form-control" value="${escapePopupHtml(defaultVal)}" placeholder="${escapePopupHtml(placeholder)}" autofocus>
          </div>
          <div class="th-popup-actions--big">
            <button type="button" class="th-popup-btn th-popup-btn--primary">${escapePopupHtml(confirmText)}</button>
            <button type="button" class="th-popup-btn th-popup-btn--secondary">${escapePopupHtml(cancelText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      const input = dialog.querySelector('.th-popup-prompt-input');

      let resolved = false;
      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        if (dialog.open && typeof dialog.close === 'function') dialog.close();
        dialog.remove();
        resolve(result);
      };

      const primaryBtn = dialog.querySelector('.th-popup-btn--primary');
      if (primaryBtn) primaryBtn.onclick = () => finish(input.value);

      const secondaryBtn = dialog.querySelector('.th-popup-btn--secondary');
      if (secondaryBtn) secondaryBtn.onclick = () => finish(null);

      const closeBtn = dialog.querySelector('.th-popup-close');
      if (closeBtn) closeBtn.onclick = () => finish(null);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      });

      dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      });

      dialog.addEventListener('close', () => finish(null), { once: true });

      if (!('closedBy' in HTMLDialogElement.prototype)) {
        const isOutside = (e) => {
          const rect = dialog.getBoundingClientRect();
          return (
            e.clientY < rect.top ||
            e.clientY > rect.bottom ||
            e.clientX < rect.left ||
            e.clientX > rect.right
          );
        };
        let pressedOutside = false;
        dialog.addEventListener('pointerdown', (e) => {
          pressedOutside = (e.target === dialog) && isOutside(e);
        });
        dialog.addEventListener('pointerup', (e) => {
          if (pressedOutside && (e.target === dialog) && isOutside(e)) {
            finish(null);
          }
        });
        dialog.addEventListener('click', (e) => {
          if ((e.target === dialog) && isOutside(e)) {
            finish(null);
          }
        });
      }

      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }

      setTimeout(() => {
        if (input) {
          input.focus();
          input.select();
        }
      }, 50);
    });
  },

  toast(message, type = 'info', duration = 3500) {
    let container = document.querySelector('.th-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'th-toast-container';
      document.body.appendChild(container);
    }

    const toastEl = document.createElement('div');
    toastEl.className = `th-toast th-toast--${type}`;
    toastEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toastEl.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toastEl.textContent = message;
    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.classList.add('is-fading');
      setTimeout(() => toastEl.remove(), 300);
    }, duration);
  }
};

window.Popup = Popup;