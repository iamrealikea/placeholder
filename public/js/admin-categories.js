(() => {
  const tableBody = document.getElementById('admin-categories-table-body');
  const form = document.getElementById('create-category-form');
  const nameInput = document.getElementById('new-category-name');
  const submitButton = document.getElementById('create-category-btn');
  const message = document.getElementById('category-manager-message');

  if (!tableBody || !form || !nameInput || !submitButton || !message) return;

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.className = isError ? 'mt-12 c-red' : 'mt-12 c-green';
  }

  async function loadCategories() {
    tableBody.innerHTML = '<tr><td colspan="2" class="c-muted tc">Loading categories...</td></tr>';
    try {
      const result = await API.categories.list();
      const categories = result.categories || [];
      if (categories.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="2" class="c-muted tc">No categories yet.</td></tr>';
        return;
      }

      tableBody.innerHTML = categories.map((category) => {
        const createdAt = category.createdAt ? new Date(category.createdAt).toLocaleDateString() : '—';
        return `<tr><td><strong>${escapeHtml(category.name)}</strong></td><td>${escapeHtml(createdAt)}</td></tr>`;
      }).join('');
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="2" class="c-red tc">Unable to load categories.</td></tr>';
      setMessage(err.message || 'Unable to load categories.', true);
    }
  }

  window.loadAdminCategories = loadCategories;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;

    submitButton.disabled = true;
    setMessage('');
    try {
      const result = await API.categories.create({ name });
      nameInput.value = '';
      setMessage(result.message || 'Category created successfully.');
      await loadCategories();
    } catch (err) {
      setMessage(err.message || 'Unable to create category.', true);
    } finally {
      submitButton.disabled = false;
    }
  });
})();
