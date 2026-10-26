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
    if (profileNameEl) profileNameEl.textContent = user.name;
    if (profileEmailEl) profileEmailEl.textContent = user.email;
    if (profileRoleBadge) profileRoleBadge.textContent = (user.role || 'Customer').toUpperCase();
    if (loyaltyPointsCount) loyaltyPointsCount.textContent = (user.points || 0).toLocaleString();

    if (user.avatarUrl) {
      profileAvatarImg.src = user.avatarUrl;
      profileAvatarImg.style.display = 'block';
      avatarInitials.style.display = 'none';
    } else {
      profileAvatarImg.style.display = 'none';
      avatarInitials.style.display = 'flex';
      avatarInitials.textContent = (user.name || 'U').slice(0, 2).toUpperCase();
    }

    if (inputName) inputName.value = user.name || '';
    if (inputPhone) inputPhone.value = user.phone || '';
    if (inputAge) inputAge.value = user.age || '';
    if (inputDob) inputDob.value = user.dob || '';
    if (inputGender) inputGender.value = user.gender || 'Unspecified';
    if (inputNationalId) inputNationalId.value = user.nationalId || '';
    if (inputAddress) inputAddress.value = user.address || '';
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

        const res = await API.auth.updateProfile(body);
        alert('Profile updated successfully!');
        Auth.currentUser = res.user;
        renderUserData(res.user);
        Auth.renderNavbarAuth();
      } catch (err) {
        alert(err.message || 'Failed to update profile.');
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
        alert('Avatar uploaded successfully!');
        Auth.currentUser = res.user;
        renderUserData(res.user);
        Auth.renderNavbarAuth();
      } catch (err) {
        alert(err.message || 'Failed to upload avatar image.');
      }
    });
  }

  // Avatar URL Upload
  if (uploadAvatarUrlBtn) {
    uploadAvatarUrlBtn.addEventListener('click', async () => {
      const url = avatarUrlInput.value.trim();
      if (!url) {
        alert('Please enter an image URL.');
        return;
      }

      try {
        const res = await API.request('/auth/avatar', {
          method: 'POST',
          body: JSON.stringify({ avatarUrl: url })
        });
        alert('Avatar URL updated!');
        Auth.currentUser = res.user;
        renderUserData(res.user);
        Auth.renderNavbarAuth();
      } catch (err) {
        alert(err.message || 'Failed to update avatar.');
      }
    });
  }

  // Bookmarks Loader
  async function loadBookmarks(bookmarkIds) {
    if (!bookmarksContainer) return;
    if (bookmarkIds.length === 0) {
      bookmarksContainer.innerHTML = `<p style="grid-column: 1/-1; color: #6B7280; padding: 24px; text-align: center;">You have not bookmarked any events yet.</p>`;
      return;
    }

    try {
      const res = await API.events.list();
      const allEvents = res.events || [];
      const bookmarked = allEvents.filter((e) => bookmarkIds.includes(e.id));

      if (bookmarked.length === 0) {
        bookmarksContainer.innerHTML = `<p style="grid-column: 1/-1; color: #6B7280; padding: 24px; text-align: center;">No bookmarked events found.</p>`;
        return;
      }

      bookmarksContainer.innerHTML = bookmarked
        .map((e) => {
          const img = e.posterUrl || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80';
          return `
            <div class="card-popular" style="border-width: 2px;">
              <div class="card-image-wrap" style="height: 140px;">
                <img src="${img}" alt="${e.title}">
              </div>
              <div class="card-body" style="padding: 16px;">
                <h4 style="font-size: 1.1rem; margin-bottom: 6px;">${e.title}</h4>
                <div style="font-size: 0.85rem; color: #6B7280; margin-bottom: 12px;">📍 ${e.venue}</div>
                <div style="display: flex; gap: 8px;">
                  <a href="/event.html?id=${e.id}" class="btn-pill-red" style="font-size: 0.85rem; padding: 6px 16px; flex: 1; text-align: center;">View</a>
                  <button class="btn-pill-outline btn-remove-bm" data-id="${e.id}" style="padding: 6px 12px; font-size: 0.85rem;">Remove</button>
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
        profileNotificationsList.innerHTML = `<li style="padding: 16px; color: #6B7280;">No notifications received yet.</li>`;
        return;
      }

      profileNotificationsList.innerHTML = notifs
        .slice(0, 5)
        .map(
          (n) => `
            <li style="padding: 12px 16px; border-bottom: 1px solid #E5E7EB;">
              <div style="display: flex; justify-content: space-between;">
                <strong>${n.subject}</strong>
                <span style="font-size: 0.75rem; color: #9CA3AF;">${new Date(n.createdAt).toLocaleDateString()}</span>
              </div>
              <div style="font-size: 0.85rem; color: #4B5563; margin-top: 4px;">${n.message}</div>
            </li>
          `
        )
        .join('');
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }

  await loadProfile();
});
