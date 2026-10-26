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
    socialLogin: (body) => API.request('/auth/social-login', { method: 'POST', body: JSON.stringify(body) }),
    logout: () => API.request('/auth/logout', { method: 'POST' }),
    getMe: () => API.request('/auth/me'),
    getProfile: () => API.request('/auth/profile'),
    updateProfile: (body) => API.request('/auth/profile', { method: 'PUT', body: JSON.stringify(body) }),
    uploadAvatar: (formData) => API.request('/auth/avatar', { method: 'POST', body: formData })
  },

  events: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return API.request(`/events${q ? `?${q}` : ''}`);
    },
    getById: (id) => API.request(`/events/${id}`),
    toggleBookmark: (id) => API.request(`/events/${id}/bookmark`, { method: 'POST' }),
    create: (body) => API.request('/events', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => API.request(`/events/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => API.request(`/events/${id}`, { method: 'DELETE' })
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
