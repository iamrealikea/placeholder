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
      const safeAvatar = typeof window !== 'undefined' && typeof window.sanitizeUrl === 'function'
        ? window.sanitizeUrl(this.currentUser.avatarUrl)
        : ((this.currentUser.avatarUrl && /^(https?:\/\/|\/uploads\/)/i.test(this.currentUser.avatarUrl))
          ? escapeHtml(this.currentUser.avatarUrl)
          : '');
      if (safeAvatar) {
        avatarPill.innerHTML = `<img src="${safeAvatar}" alt="${escapeHtml(this.currentUser.name || 'User')}">`;
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
      avatarPill.innerHTML = `<i class="fa-solid fa-user"></i>`;
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
    menu.className = 'user-dropdown-menu';

    const points = this.currentUser.points || 0;
    const currentRole = (this.currentUser.role || 'customer').toLowerCase();
    const isUserAdmin = this.isAdmin();
    const isUserStaff = currentRole === 'staff';
    const roleBadgeText = currentRole.toUpperCase();
    const roleBadgeClass = isUserAdmin ? 'badge-pill-red' : (isUserStaff ? 'badge-pill-blue' : 'badge-pill-outline');

    menu.innerHTML = `
      <div class="user-dropdown-header">
        <div class="fw-7 c-ink">${escapeHtml(this.currentUser.name)}</div>
        <div class="fs-08 c-muted">${escapeHtml(this.currentUser.email)}</div>
        <div class="mt-6 flex items-c gap-6 wrap">
          <span class="user-menu-points-badge">
            <i class="fa-solid fa-star c-blue mr-2"></i> ${escapeHtml(points)} Points
          </span>
          <span class="${roleBadgeClass} fs-075 p-2-7 r-9999 uppercase">
            ${escapeHtml(roleBadgeText)}
          </span>
        </div>
      </div>
      <a href="/profile" class="user-dropdown-link">My Profile</a>
      <a href="/my-tickets" class="user-dropdown-link">My Tickets</a>
      <a href="/support" class="user-dropdown-link">Help & Support</a>
      ${isUserAdmin ? `
        <a href="/admin" class="user-dropdown-link user-dropdown-link--blue">Staff & Admin Portal</a>
        <a href="/admin?tab=scanner" class="user-dropdown-link user-dropdown-link--teal">Gate Scanner</a>
      ` : (isUserStaff ? `
        <a href="/admin" class="user-dropdown-link user-dropdown-link--blue">Staff Operations Portal</a>
        <a href="/admin?tab=scanner" class="user-dropdown-link user-dropdown-link--teal">Gate Scanner</a>
      ` : '')}
      <div class="border-t-subtle mt-6"></div>
      <button id="logoutBtn" class="user-dropdown-logout">
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
      await API.auth.logout().catch(() => { });
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
    modal.className = 'modal-overlay d-none';
    modal.hidden = true;

    modal.innerHTML = `
      <div class="modal-content th-popup th-popup--big auth-modal-dialog">
        <div class="th-popup-header mb-16 border-none p-0">
          <h3 id="authModalTitle" class="th-popup-title fs-18 fw-7 c-ink">Sign In to TicketHub</h3>
          <button id="closeAuthModal" class="th-popup-close" title="Close" aria-label="Close">
            <img src="/images/popup-close-icon.svg" alt="Close" class="w-24 h-24">
          </button>
        </div>
        <div class="modal-body p-0">
          <div class="auth-tabs">
            <button id="tabLogin" class="auth-tab active">Log In</button>
            <button id="tabRegister" class="auth-tab">Register</button>
            <button id="tabSocial" class="auth-tab">Social / OTP</button>
          </div>

          <!-- Alert area -->
          <div id="authAlert" class="auth-alert d-none"></div>

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
            <button type="submit" class="th-popup-btn th-popup-btn--primary auth-submit-btn">Sign In</button>
            
            <div class="mt-16 fs-085 c-muted tc">
              Demo accounts:<br>
              <strong>Customer:</strong> user@ticket.com / password123<br>
              <strong>Admin:</strong> admin@ticket.com / admin123<br>
              <strong>Staff:</strong> staff@ticket.com / staff123
            </div>
          </form>

          <!-- Register Form -->
          <form id="formRegister" class="d-none">
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
            <div class="grid-2col">
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
            <button type="submit" class="th-popup-btn th-popup-btn--destructive auth-submit-btn">Create Account</button>
          </form>

          <!-- Social Login Form -->
          <div id="formSocial" class="d-none tc">
            <p class="fs-09 c-muted mb-16">
              Sign in with your Google or Facebook account:
            </p>
            <div id="googleSignInHost" class="flex justify-c mb-10"></div>
            <button id="btnSocialFB" class="btn-pill-outline w-100 mb-10 flex items-c justify-c gap-8 border-blue c-blue">
              <i class="fa-brands fa-facebook c-blue"></i> Sign in with Facebook
            </button>
            <div id="phoneDemoSection">
              <div class="border-dashed-subtle my-16"></div>
              <div class="form-group tl">
                <label class="form-label">Phone OTP (demo only, no real OTP is sent)</label>
                <input type="text" id="socialPhone" class="form-control" placeholder="0899998888">
              </div>
              <button id="btnSocialOTP" class="th-popup-btn th-popup-btn--primary w-100 fs-105 py-14">
                Request & Verify OTP
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
      modal.classList.add('d-none');
      modal.hidden = true;
    };
    const openModal = () => {
      modal.classList.remove('d-none');
      modal.hidden = false;
    };

    const closeBtn = modal.querySelector('#closeAuthModal');
    closeBtn.onclick = closeModal;

    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('d-none')) {
        closeModal();
      }
    });

    // Tab Switching
    const tabLogin = modal.querySelector('#tabLogin');
    const tabRegister = modal.querySelector('#tabRegister');
    const tabSocial = modal.querySelector('#tabSocial');
    const formLogin = modal.querySelector('#formLogin');
    const formRegister = modal.querySelector('#formRegister');
    const formSocial = modal.querySelector('#formSocial');
    const authAlert = modal.querySelector('#authAlert');

    const showAlert = (msg, isError = true) => {
      authAlert.textContent = msg;
      authAlert.className = `auth-alert ${isError ? 'auth-alert--error' : 'auth-alert--success'}`;
      authAlert.classList.remove('d-none');
    };
    const hideAlert = () => {
      authAlert.classList.add('d-none');
      authAlert.textContent = '';
    };

    const showTab = (tab) => {
      hideAlert();
      tabLogin.classList.toggle('active', tab === 'login');
      tabRegister.classList.toggle('active', tab === 'register');
      tabSocial.classList.toggle('active', tab === 'social');

      formLogin.classList.toggle('d-none', tab !== 'login');
      formRegister.classList.toggle('d-none', tab !== 'register');
      formSocial.classList.toggle('d-none', tab !== 'social');
    };

    tabLogin.onclick = () => showTab('login');
    tabRegister.onclick = () => showTab('register');
    tabSocial.onclick = () => {
      showTab('social');
      initSocialProviders();
    };

    // Handle Login Submit
    formLogin.onsubmit = async (e) => {
      e.preventDefault();
      hideAlert();
      try {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const res = await API.auth.login({ email, password });
        API.setToken(res.token);
        this.currentUser = res.user;
        closeModal();
        this.renderNavbarAuth();
        this.notifyAuthChange();
        if (this.onSuccessCallback) this.onSuccessCallback(res.user);
      } catch (err) {
        showAlert(err.message);
      }
    };

    // Handle Register Submit
    formRegister.onsubmit = async (e) => {
      e.preventDefault();
      hideAlert();
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
        closeModal();
        this.renderNavbarAuth();
        this.notifyAuthChange();
        if (this.onSuccessCallback) this.onSuccessCallback(res.user);
      } catch (err) {
        showAlert(err.message);
      }
    };

    // Social login (Google / Facebook): the provider returns a token, the server verifies it.
    const finishLogin = (res) => {
      API.setToken(res.token);
      this.currentUser = res.user;
      closeModal();
      this.renderNavbarAuth();
      this.notifyAuthChange();
      if (this.onSuccessCallback) this.onSuccessCallback(res.user);
    };

    const socialLoginWith = async (body) => {
      hideAlert();
      try {
        finishLogin(await API.auth.socialLogin(body));
      } catch (err) {
        showAlert(err.message);
      }
    };

    const scriptPromises = {};
    const loadScript = (src) => {
      if (!scriptPromises[src]) {
        scriptPromises[src] = new Promise((resolve, reject) => {
          const el = document.createElement('script');
          el.src = src;
          el.async = true;
          el.onload = resolve;
          el.onerror = () => reject(new Error(`Failed to load ${src}`));
          document.head.appendChild(el);
        });
      }
      return scriptPromises[src];
    };

    let socialInitStarted = false;
    const initSocialProviders = async () => {
      if (socialInitStarted) return;
      socialInitStarted = true;

      const googleHost = modal.querySelector('#googleSignInHost');
      const fbBtn = modal.querySelector('#btnSocialFB');
      const phoneSection = modal.querySelector('#phoneDemoSection');

      let cfg;
      try {
        cfg = await API.auth.socialConfig();
      } catch (err) {
        socialInitStarted = false; // allow retry next time the tab is opened
        showAlert('Unable to load social login settings. Please try again.');
        return;
      }

      const g = cfg.google || {};
      const f = cfg.facebook || {};
      if (phoneSection) phoneSection.classList.toggle('d-none', !cfg.phoneDemo);

      // Google Identity Services renders its own official button
      if (g.enabled && g.clientId) {
        try {
          await loadScript('https://accounts.google.com/gsi/client');
          window.google.accounts.id.initialize({
            client_id: g.clientId,
            callback: (resp) => {
              if (resp && resp.credential) {
                socialLoginWith({ provider: 'gmail', idToken: resp.credential });
              }
            }
          });
          window.google.accounts.id.renderButton(googleHost, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            text: 'signin_with',
            width: 280
          });
        } catch (err) {
          googleHost.textContent = 'Google sign-in is currently unavailable.';
        }
      } else {
        googleHost.textContent = 'Google sign-in is not configured.';
      }

      // Facebook JS SDK
      if (f.enabled && f.appId) {
        try {
          await loadScript('https://connect.facebook.net/en_US/sdk.js');
          window.FB.init({ appId: f.appId, cookie: false, xfbml: false, version: 'v27.0' });
        } catch (err) {
          fbBtn.disabled = true;
          fbBtn.title = 'Facebook sign-in is currently unavailable.';
        }
      } else {
        fbBtn.disabled = true;
        fbBtn.title = 'Facebook sign-in is not configured.';
      }
    };

    // Must call FB.login directly from the click so the popup is not blocked
    modal.querySelector('#btnSocialFB').onclick = () => {
      if (!window.FB) {
        showAlert('Facebook sign-in is not available right now.');
        return;
      }
      window.FB.login((resp) => {
        if (resp && resp.authResponse && resp.authResponse.accessToken) {
          socialLoginWith({ provider: 'facebook', accessToken: resp.authResponse.accessToken });
        } else {
          showAlert('Facebook login was cancelled.');
        }
      }, { scope: 'public_profile,email' });
    };

    // Demo-only simulated phone OTP (server disables it in production)
    modal.querySelector('#btnSocialOTP').onclick = async () => {
      const phone = document.getElementById('socialPhone').value.trim();
      if (!phone) {
        showAlert('Please enter a valid phone number.');
        return;
      }
      await socialLoginWith({ provider: 'phone', phone, identifier: phone });
    };
  },

  openAuthModal(callback) {
    this.onSuccessCallback = callback;
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.remove('d-none');
      modal.hidden = false;
      const emailField = document.getElementById('loginEmail');
      if (emailField) emailField.focus();
    }
  }
};

window.Auth = Auth;

// Expose a promise pages can await before checking login state
Auth.ready = new Promise((resolve) => {
  const run = async () => {
    await Auth.init();
    resolve();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
});

// Sync session across tabs: reload whenever another tab changes the token
window.addEventListener('storage', (e) => {
  if (e.key === 'tickethub_token') {
    window.location.reload();
  }
});