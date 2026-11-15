/**
 * TicketHub - Profile Controller (public/js/profile.js)
 * Manages user profile updates, circular avatar upload, loyalty points balance,
 * bookmarks grid, and notifications inbox.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const profileAvatarImg = document.getElementById('profileAvatarImg');
  const avatarInitials = document.getElementById('avatarInitials');
  const profileNameEl = document.getElementById('profileName');
  const profileEmailEl = document.getElementById('profileEmail');
  const profileRoleBadge = document.getElementById('profileRoleBadge');
  const loyaltyPointsCount = document.getElementById('loyaltyPointsCount');
  const bookmarksContainer = document.getElementById('bookmarksContainer');
  const profileNotificationsList = document.getElementById('profileNotificationsList');

  // Form Elements
  const editProfileForm = document.getElementById('editProfileForm');
  const inputName = document.getElementById('profileInputName');
  const inputPhone = document.getElementById('profileInputPhone');
  const inputAge = document.getElementById('profileInputAge');
  const inputDob = document.getElementById('profileInputDob');
  const inputGender = document.getElementById('profileInputGender');
  const inputNationalId = document.getElementById('profileInputNationalId');
  const inputAddress = document.getElementById('profileInputAddress');

  if (inputDob) {
    const today = new Date();
    inputDob.max = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  const avatarFileInput = document.getElementById('avatarFileInput');
  const avatarUrlInput = document.getElementById('avatarUrlInput');
  const uploadAvatarUrlBtn = document.getElementById('uploadAvatarUrlBtn');

  async function loadProfile() {
    if (!Auth.isLoggedIn()) {
      Auth.openAuthModal(async () => {
        await loadProfile();
      });
      return;
    }

    try {
      const res = await API.auth.getProfile();
      const user = res.user;
      renderUserData(user);
      await loadBookmarks(user.bookmarks || []);
      await loadUserNotifications();
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  }

  function renderUserData(user) {
    if (!user) return;
    if (profileNameEl) profileNameEl.textContent = user.name;
    if (profileEmailEl) profileEmailEl.textContent = user.email;
    if (profileRoleBadge) profileRoleBadge.textContent = (user.role || 'Customer').toUpperCase();
    if (loyaltyPointsCount) loyaltyPointsCount.textContent = (user.points || 0).toLocaleString();

    const safeAvatar = typeof window !== 'undefined' && typeof window.sanitizeUrl === 'function'
      ? window.sanitizeUrl(user.avatarUrl)
      : ((user.avatarUrl && /^(https?:\/\/|\/uploads\/)/i.test(user.avatarUrl)) ? user.avatarUrl : null);
    if (safeAvatar) {
      if (profileAvatarImg) {
        profileAvatarImg.src = safeAvatar;
        profileAvatarImg.classList.remove('d-none');
        profileAvatarImg.hidden = false;
      }
      if (avatarInitials) {
        avatarInitials.classList.add('d-none');
        avatarInitials.hidden = true;
      }
    } else {
      if (profileAvatarImg) {
        profileAvatarImg.classList.add('d-none');
        profileAvatarImg.hidden = true;
      }
      if (avatarInitials) {
        avatarInitials.classList.remove('d-none');
        avatarInitials.hidden = false;
        avatarInitials.textContent = (user.name || 'U').slice(0, 2).toUpperCase();
      }
    }

    if (inputName) inputName.value = user.name || '';
    if (inputPhone) inputPhone.value = user.phone || '';
    if (inputAge) inputAge.value = user.age ?? '';
    if (inputDob) inputDob.value = (user.dob || '').slice(0, 10);
    if (inputGender) inputGender.value = user.gender || 'Unspecified';
    if (inputNationalId) inputNationalId.value = user.nationalId || '';
    if (inputAddress) inputAddress.value = user.address || '';
  }

  function syncAuthUser(user) {
    Auth.currentUser = user;
    localStorage.setItem('tickethub_user', JSON.stringify(user));
    Auth.notifyAuthChange();
    Auth.renderNavbarAuth();
  }

  // Profile Form Submit
  if (editProfileForm) {
    editProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const body = {
          name: inputName.value,
          phone: inputPhone.value,
          age: Number(inputAge.value) || 0,
          dob: inputDob.value,
          gender: inputGender.value,
          nationalId: inputNationalId.value,
          address: inputAddress.value
        };

        if (inputDob) {
          inputDob.setCustomValidity('');
          if (inputDob.value > inputDob.max) {
            inputDob.setCustomValidity('Date of birth cannot be in the future.');
            inputDob.reportValidity();
            return;
          }
        }

        const res = await API.auth.updateProfile(body);
        await Popup.alert('Profile updated successfully!', { title: 'Profile Updated' });
        Auth.currentUser = res.user;
        renderUserData(res.user);
        Auth.renderNavbarAuth();
      } catch (err) {
        await Popup.alert(err.message || 'Failed to update profile.', { title: 'Update Error' });
      }
    });
  }

  // Avatar File Upload via Multer
  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', async () => {
      if (!avatarFileInput.files || !avatarFileInput.files[0]) return;
      const file = avatarFileInput.files[0];
      const formData = new FormData();
      formData.append('avatar', file);

      try {
        const res = await API.auth.uploadAvatar(formData);
        await Popup.alert('Avatar uploaded successfully!', { title: 'Avatar Uploaded' });
        Auth.currentUser = res.user;
        renderUserData(res.user);
      } catch (err) {
        await Popup.alert(err.message || 'Failed to upload avatar image.', { title: 'Upload Error' });
      }
    });
  }

  // Avatar URL Upload
  if (uploadAvatarUrlBtn) {
    uploadAvatarUrlBtn.addEventListener('click', async () => {
      const url = avatarUrlInput.value.trim();
      if (!url) {
        await Popup.alert('Please enter an image URL.', { title: 'Invalid URL' });
        return;
      }

      try {
        const res = await API.request('/auth/avatar', {
          method: 'POST',
          body: JSON.stringify({ avatarUrl: url })
        });
        await Popup.alert('Avatar URL updated!', { title: 'Avatar Updated' });
        Auth.currentUser = res.user;
        renderUserData(res.user);
      } catch (err) {
        await Popup.alert(err.message || 'Failed to update avatar.', { title: 'Update Error' });
      }
    });
  }

  // Bookmarks Loader
  async function loadBookmarks(bookmarkIds) {
    if (!bookmarksContainer) return;
    if (bookmarkIds.length === 0) {
      bookmarksContainer.innerHTML = `<p class="tc p-24 c-muted">You have not bookmarked any events yet.</p>`;
      return;
    }

    try {
      const res = await API.events.list();
      const allEvents = res.events || [];
      const bookmarked = allEvents.filter((e) => bookmarkIds.includes(e.id));

      if (bookmarked.length === 0) {
        bookmarksContainer.innerHTML = `<p class="tc p-24 c-muted">No bookmarked events found.</p>`;
        return;
      }

      bookmarksContainer.innerHTML = bookmarked
        .map((e) => {
          const rawImg = e.posterUrl || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80';
          const img = (typeof window.sanitizeUrl === 'function') ? window.sanitizeUrl(rawImg, '') : escapeHtml(rawImg);
          return `
            <div class="card-popular border-strong">
              <div class="card-image-wrap h-140">
                <img src="${img}" alt="${escapeHtml(e.title)}">
              </div>
              <div class="card-body p-16">
                <h4 class="fs-11 mb-6">${escapeHtml(e.title)}</h4>
                <div class="fs-085 c-muted mb-12"><i class="fa-solid fa-location-dot c-blue mr-4"></i> ${escapeHtml(e.venue)}</div>
                <div class="flex gap-8">
                  <a href="/event?id=${encodeURIComponent(e.id)}" class="btn-pill-red fs-085 p-6-16 flex-1 tc">View</a>
                  <button class="btn-pill-outline btn-remove-bm fs-085 p-6-16" data-id="${escapeHtml(e.id)}">Remove</button>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      bookmarksContainer.querySelectorAll('.btn-remove-bm').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          await API.events.toggleBookmark(id);
          const idx = bookmarkIds.indexOf(id);
          if (idx !== -1) bookmarkIds.splice(idx, 1);
          await loadBookmarks(bookmarkIds);
        });
      });
    } catch (err) {
      console.error('Error loading bookmarks:', err);
    }
  }

  // Load In-App Notifications
  async function loadUserNotifications() {
    if (!profileNotificationsList) return;
    try {
      const res = await API.admin.getNotifications();
      const notifs = res.notifications || [];
      if (notifs.length === 0) {
        profileNotificationsList.innerHTML = `<li class="p-16 c-muted">No notifications received yet.</li>`;
        return;
      }

      profileNotificationsList.innerHTML = notifs
        .slice(0, 5)
        .map(
          (n) => `
            <li class="p-12 border-b-subtle">
              <div class="flex between items-c">
                <strong class="c-ink">${escapeHtml(n.subject)}</strong>
                <span class="fs-075 c-faint">${escapeHtml(new Date(n.createdAt).toLocaleDateString())}</span>
              </div>
              <div class="fs-085 c-ink-2 mt-4">${escapeHtml(n.message)}</div>
            </li>
          `
        )
        .join('');
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }

  await Auth.ready;
  await loadProfile();
});
