/**
 * TicketHub - Authentication & Session Manager (Vanilla JS)
 * Manages user session, modal dialogs, and navbar auth state.
 */

const Auth = {
  currentUser: null,
  onAuthChangeCallbacks: [],

  async init() {
    this.createAuthModalDOM();
    await this.fetchCurrentUser();
    this.renderNavbarAuth();
  },

  onAuthChange(cb) {
    if (typeof cb === 'function') {
      this.onAuthChangeCallbacks.push(cb);
    }
  },

  notifyAuthChange() {
    for (const cb of this.onAuthChangeCallbacks) {
      try {
        cb(this.currentUser);
      } catch (e) {
        console.error(e);
      }
    }
  },

  async fetchCurrentUser() {
    try {
      const res = await API.auth.getMe();
      if (res && res.user) {
        this.currentUser = res.user;
        localStorage.setItem('tickethub_user', JSON.stringify(res.user));
        return res.user;
      }
    } catch (_) {
      // If unauthorized or token missing
      this.currentUser = null;
      localStorage.removeItem('tickethub_user');
    }
    return null;
  },

  isLoggedIn() {
    return !!this.currentUser;
  },

  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  },

  isStaff() {
    return this.currentUser && (this.currentUser.role === 'staff' || this.currentUser.role === 'admin');
  },

  renderNavbarAuth() {
    const avatarPill = document.querySelector('.avatar-pill');
    if (!avatarPill) return;

    if (this.currentUser) {
      if (this.currentUser.avatarUrl) {
        avatarPill.innerHTML = `<img src="${this.currentUser.avatarUrl}" alt="${this.currentUser.name}">`;
      } else {
        const initials = (this.currentUser.name || 'U').slice(0, 2).toUpperCase();
        avatarPill.textContent = initials;
      }
      avatarPill.title = `${this.currentUser.name} (${this.currentUser.email})`;
      avatarPill.onclick = (e) => {
        e.stopPropagation();
        this.toggleUserMenu(avatarPill);
      };
    } else {
      avatarPill.innerHTML = `👤`;
      avatarPill.title = 'Sign In';
      avatarPill.onclick = () => this.openAuthModal();
    }
  },

  toggleUserMenu(anchor) {
    let menu = document.getElementById('userDropdownMenu');
    if (menu) {
      menu.remove();
      return;
    }

    menu = document.createElement('div');
    menu.id = 'userDropdownMenu';
    menu.style.position = 'absolute';
    menu.style.top = '72px';
    menu.style.right = '20px';
    menu.style.background = '#FFFFFF';
    menu.style.borderRadius = '16px';
    menu.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
    menu.style.border = '1px solid #E5E7EB';
    menu.style.padding = '12px 0';
    menu.style.minWidth = '220px';
    menu.style.zIndex = '500';

    const points = this.currentUser.points || 0;
    const currentRole = (this.currentUser.role || 'customer').toLowerCase();
    const isUserAdmin = this.isAdmin();
    const isUserStaff = currentRole === 'staff';
    const roleBadgeText = currentRole.toUpperCase();
    const roleBadgeClass = isUserAdmin ? 'badge-pill-red' : (isUserStaff ? 'badge-pill-blue' : 'badge-pill-outline');

    menu.innerHTML = `
      <div style="padding: 10px 18px; border-bottom: 1px solid #E5E7EB;">
        <div style="font-weight: 700; color: #111827;">${this.currentUser.name}</div>
        <div style="font-size: 0.8rem; color: #6B7280;">${this.currentUser.email}</div>
        <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span style="font-size: 0.75rem; font-weight: 700; color: #1D56CF; background: #EBF1FD; padding: 2px 8px; border-radius: 9999px;">
            ★ ${points} Points
          </span>
          <span class="${roleBadgeClass}" style="font-size: 0.75rem; padding: 2px 8px; border-radius: 9999px; text-transform: uppercase;">
            ${roleBadgeText}
          </span>
        </div>
      </div>
      <a href="/profile.html" style="display: block; padding: 10px 18px; color: #111827; font-weight: 600; text-decoration: none;">My Profile</a>
      <a href="/my-tickets.html" style="display: block; padding: 10px 18px; color: #111827; font-weight: 600; text-decoration: none;">My Tickets</a>
      <a href="/support.html" style="display: block; padding: 10px 18px; color: #111827; font-weight: 600; text-decoration: none;">Help & Support</a>
      ${isUserAdmin ? `
        <a href="/admin.html" style="display: block; padding: 10px 18px; color: #1D56CF; font-weight: 700; text-decoration: none;">Staff & Admin Portal</a>
        <a href="/admin.html?tab=scanner" style="display: block; padding: 10px 18px; color: #0D9488; font-weight: 700; text-decoration: none;">Gate Scanner</a>
      ` : (isUserStaff ? `
        <a href="/admin.html" style="display: block; padding: 10px 18px; color: #1D56CF; font-weight: 700; text-decoration: none;">Staff Operations Portal</a>
        <a href="/admin.html?tab=scanner" style="display: block; padding: 10px 18px; color: #0D9488; font-weight: 700; text-decoration: none;">Gate Scanner</a>
      ` : '')}
      <div style="border-top: 1px solid #E5E7EB; margin-top: 6px;"></div>
      <button id="logoutBtn" style="width: 100%; text-align: left; background: none; border: none; padding: 10px 18px; color: #FF0800; font-weight: 700; cursor: pointer;">
        Log Out
      </button>
    `;

    document.body.appendChild(menu);

    const closeHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);

    const logoutBtn = menu.querySelector('#logoutBtn');
    logoutBtn.addEventListener('click', async () => {
      await API.auth.logout();
      API.setToken('');
      this.currentUser = null;
      menu.remove();
      this.renderNavbarAuth();
      this.notifyAuthChange();
      window.location.reload();
    });
  },

  createAuthModalDOM() {
    if (document.getElementById('authModal')) return;

    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 440px;">
        <div class="modal-header">
          <h3 id="authModalTitle" style="font-size: 1.35rem; font-weight: 800; color: #1D56CF;">Sign In to TicketHub</h3>
          <button id="closeAuthModal" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#6B7280;">✕</button>
        </div>
        <div class="modal-body">
          <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 2px solid #E5E7EB; padding-bottom: 8px;">
            <button id="tabLogin" style="flex:1; border:none; background:none; font-weight:700; padding:8px; cursor:pointer; border-bottom: 3px solid #1D56CF; color:#1D56CF;">Log In</button>
            <button id="tabRegister" style="flex:1; border:none; background:none; font-weight:600; padding:8px; cursor:pointer; color:#6B7280;">Register</button>
            <button id="tabSocial" style="flex:1; border:none; background:none; font-weight:600; padding:8px; cursor:pointer; color:#6B7280;">Social / OTP</button>
          </div>

          <!-- Alert area -->
          <div id="authAlert" style="display:none; padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:0.9rem; font-weight:600;"></div>

          <!-- Login Form -->
          <form id="formLogin">
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input type="email" id="loginEmail" class="form-control" placeholder="user@ticket.com" required>
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" id="loginPassword" class="form-control" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn-pill-blue" style="width:100%; padding:12px; margin-top:8px;">Sign In</button>
            
            <div style="margin-top:16px; font-size:0.85rem; color:#6B7280; text-align:center;">
              Demo accounts:<br>
              <strong>Customer:</strong> user@ticket.com / password123<br>
              <strong>Admin:</strong> admin@ticket.com / admin123<br>
              <strong>Staff:</strong> staff@ticket.com / staff123
            </div>
          </form>

          <!-- Register Form -->
          <form id="formRegister" style="display:none;">
            <div class="form-group">
              <label class="form-label">Full Name *</label>
              <input type="text" id="regName" class="form-control" placeholder="Alex Rivers" required>
            </div>
            <div class="form-group">
              <label class="form-label">Email Address *</label>
              <input type="email" id="regEmail" class="form-control" placeholder="alex@example.com" required>
            </div>
            <div class="form-group">
              <label class="form-label">Password *</label>
              <input type="password" id="regPassword" class="form-control" placeholder="At least 6 characters" required>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
              <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="text" id="regPhone" class="form-control" placeholder="0812345678">
              </div>
              <div class="form-group">
                <label class="form-label">Age</label>
                <input type="number" id="regAge" class="form-control" placeholder="24">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">National ID / Passport</label>
              <input type="text" id="regNationalId" class="form-control" placeholder="13-digit ID">
            </div>
            <button type="submit" class="btn-pill-red" style="width:100%; padding:12px; margin-top:8px;">Create Account</button>
          </form>

          <!-- Social Login Form -->
          <div id="formSocial" style="display:none; text-align:center;">
            <p style="font-size:0.9rem; color:#6B7280; margin-bottom:16px;">
              Select a simulated provider to instantly authenticate without password:
            </p>
            <button id="btnSocialGoogle" class="btn-pill-outline" style="width:100%; margin-bottom:10px; display:flex; align-items:center; justify-content:center; gap:8px;">
              <span>🔴</span> Sign in with Google (Gmail)
            </button>
            <button id="btnSocialFB" class="btn-pill-outline" style="width:100%; margin-bottom:10px; display:flex; align-items:center; justify-content:center; gap:8px; border-color:#1D56CF; color:#1D56CF;">
              <span>🔵</span> Sign in with Facebook
            </button>
            <div style="border-top:1px dashed #E5E7EB; margin:16px 0;"></div>
            <div class="form-group" style="text-align:left;">
              <label class="form-label">Simulated Phone OTP</label>
              <input type="text" id="socialPhone" class="form-control" placeholder="0899998888">
            </div>
            <button id="btnSocialOTP" class="btn-pill-blue" style="width:100%; padding:10px;">
              Request & Verify OTP
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#closeAuthModal');
    closeBtn.onclick = () => (modal.style.display = 'none');

    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = 'none';
    };

    // Tab Switching
    const tabLogin = modal.querySelector('#tabLogin');
    const tabRegister = modal.querySelector('#tabRegister');
    const tabSocial = modal.querySelector('#tabSocial');
    const formLogin = modal.querySelector('#formLogin');
    const formRegister = modal.querySelector('#formRegister');
    const formSocial = modal.querySelector('#formSocial');
    const authAlert = modal.querySelector('#authAlert');

    const showTab = (tab) => {
      authAlert.style.display = 'none';
      tabLogin.style.borderBottom = tab === 'login' ? '3px solid #1D56CF' : 'none';
      tabLogin.style.color = tab === 'login' ? '#1D56CF' : '#6B7280';
      tabRegister.style.borderBottom = tab === 'register' ? '3px solid #1D56CF' : 'none';
      tabRegister.style.color = tab === 'register' ? '#1D56CF' : '#6B7280';
      tabSocial.style.borderBottom = tab === 'social' ? '3px solid #1D56CF' : 'none';
      tabSocial.style.color = tab === 'social' ? '#1D56CF' : '#6B7280';

      formLogin.style.display = tab === 'login' ? 'block' : 'none';
      formRegister.style.display = tab === 'register' ? 'block' : 'none';
      formSocial.style.display = tab === 'social' ? 'block' : 'none';
    };

    tabLogin.onclick = () => showTab('login');
    tabRegister.onclick = () => showTab('register');
    tabSocial.onclick = () => showTab('social');

    // Handle Login Submit
    formLogin.onsubmit = async (e) => {
      e.preventDefault();
      authAlert.style.display = 'none';
      try {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const res = await API.auth.login({ email, password });
        API.setToken(res.token);
        this.currentUser = res.user;
        modal.style.display = 'none';
        this.renderNavbarAuth();
        this.notifyAuthChange();
        if (this.onSuccessCallback) this.onSuccessCallback(res.user);
      } catch (err) {
        authAlert.style.display = 'block';
        authAlert.style.background = '#FFE5E5';
        authAlert.style.color = '#CC0600';
        authAlert.textContent = err.message;
      }
    };

    // Handle Register Submit
    formRegister.onsubmit = async (e) => {
      e.preventDefault();
      authAlert.style.display = 'none';
      try {
        const body = {
          name: document.getElementById('regName').value,
          email: document.getElementById('regEmail').value,
          password: document.getElementById('regPassword').value,
          phone: document.getElementById('regPhone').value,
          age: Number(document.getElementById('regAge').value) || undefined,
          nationalId: document.getElementById('regNationalId').value || undefined
        };
        const res = await API.auth.register(body);
        API.setToken(res.token);
        this.currentUser = res.user;
        modal.style.display = 'none';
        this.renderNavbarAuth();
        this.notifyAuthChange();
        if (this.onSuccessCallback) this.onSuccessCallback(res.user);
      } catch (err) {
        authAlert.style.display = 'block';
        authAlert.style.background = '#FFE5E5';
        authAlert.style.color = '#CC0600';
        authAlert.textContent = err.message;
      }
    };

    // Social & Phone OTP Handlers
    modal.querySelector('#btnSocialGoogle').onclick = async () => {
      try {
        const res = await API.auth.socialLogin({ provider: 'gmail', name: 'Google User', email: 'google.user@example.com' });
        API.setToken(res.token);
        this.currentUser = res.user;
        modal.style.display = 'none';
        this.renderNavbarAuth();
        this.notifyAuthChange();
        if (this.onSuccessCallback) this.onSuccessCallback(res.user);
      } catch (err) {
        authAlert.style.display = 'block';
        authAlert.style.background = '#FFE5E5';
        authAlert.style.color = '#CC0600';
        authAlert.textContent = err.message;
      }
    };

    modal.querySelector('#btnSocialFB').onclick = async () => {
      try {
        const res = await API.auth.socialLogin({ provider: 'facebook', name: 'Facebook User', identifier: 'fb_user_12345' });
        API.setToken(res.token);
        this.currentUser = res.user;
        modal.style.display = 'none';
        this.renderNavbarAuth();
        this.notifyAuthChange();
        if (this.onSuccessCallback) this.onSuccessCallback(res.user);
      } catch (err) {
        authAlert.style.display = 'block';
        authAlert.style.background = '#FFE5E5';
        authAlert.style.color = '#CC0600';
        authAlert.textContent = err.message;
      }
    };

    modal.querySelector('#btnSocialOTP').onclick = async () => {
      const phone = document.getElementById('socialPhone').value.trim();
      if (!phone) {
        authAlert.style.display = 'block';
        authAlert.style.background = '#FFE5E5';
        authAlert.style.color = '#CC0600';
        authAlert.textContent = 'Please enter a valid phone number.';
        return;
      }
      try {
        const res = await API.auth.socialLogin({ provider: 'phone', phone, identifier: phone });
        API.setToken(res.token);
        this.currentUser = res.user;
        modal.style.display = 'none';
        this.renderNavbarAuth();
        this.notifyAuthChange();
        if (this.onSuccessCallback) this.onSuccessCallback(res.user);
      } catch (err) {
        authAlert.style.display = 'block';
        authAlert.style.background = '#FFE5E5';
        authAlert.style.color = '#CC0600';
        authAlert.textContent = err.message;
      }
    };
  },

  openAuthModal(callback) {
    this.onSuccessCallback = callback;
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.style.display = 'flex';
      const emailField = document.getElementById('loginEmail');
      if (emailField) emailField.focus();
    }
  }
};

window.Auth = Auth;
document.addEventListener('DOMContentLoaded', () => Auth.init());
