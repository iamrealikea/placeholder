/**
 * TicketHub - Customer Support & Inquiries Controller (public/js/support.js)
 * Allows submitting support tickets and tracking status / admin replies.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const supportForm = document.getElementById('supportForm');
  const subjectInput = document.getElementById('supportSubject');
  const categorySelect = document.getElementById('supportCategory');
  const messageInput = document.getElementById('supportMessage');
  const myInquiriesContainer = document.getElementById('myInquiriesContainer');

  async function loadMyInquiries() {
    if (!Auth.isLoggedIn()) {
      if (myInquiriesContainer) {
        myInquiriesContainer.innerHTML = `
          <div class="tc p-24 c-muted">
            Please log in to view your submitted support inquiries.
          </div>
        `;
      }
      return;
    }

    try {
      const res = await API.support.getMy();
      const list = res.tickets || [];
      renderInquiries(list);
    } catch (err) {
      console.error('Failed to load support inquiries:', err);
    }
  }

  function renderInquiries(list) {
    if (!myInquiriesContainer) return;

    if (list.length === 0) {
      myInquiriesContainer.innerHTML = `
        <div class="tc p-32 c-muted">
          No support inquiries found. Submit your question using the form.
        </div>
      `;
      return;
    }

    myInquiriesContainer.innerHTML = list
      .map((item) => {
        const isResolved = item.status === 'RESOLVED';
        const dateStr = new Date(item.createdAt).toLocaleString();

        return `
          <div class="support-card">
            <div class="flex between items-start mb-8">
              <div>
                <span class="fs-075 uppercase fw-7 c-muted">${escapeHtml(item.category)}</span>
                <h4 class="fs-115 c-ink mt-2">${escapeHtml(item.subject)}</h4>
              </div>
              <span class="badge-pill-${isResolved ? 'blue' : 'red'} fs-08">
                ${escapeHtml(item.status)}
              </span>
            </div>
            
            <p class="c-ink-2 fs-095 mb-12 lh-15">${escapeHtml(item.message)}</p>
            <div class="fs-08 c-faint mb-12">Submitted on ${escapeHtml(dateStr)}</div>

            ${
              isResolved && item.adminReply
                ? `
                  <div class="support-admin-reply">
                    <div class="fs-08 fw-7 c-blue mb-4">TicketHub Support Team Reply:</div>
                    <div class="c-ink fs-095">${escapeHtml(item.adminReply)}</div>
                  </div>
                `
                : ''
            }
          </div>
        `;
      })
      .join('');
  }

  if (supportForm) {
    supportForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!Auth.isLoggedIn()) {
        Auth.openAuthModal(async () => {
          await submitTicket();
        });
        return;
      }

      await submitTicket();
    });
  }

  async function submitTicket() {
    const subject = subjectInput.value.trim();
    const category = categorySelect.value;
    const message = messageInput.value.trim();

    if (!subject || !message) {
      await Popup.alert('Please fill in both subject and message.', { title: 'Required Fields' });
      return;
    }

    try {
      await API.support.submit({ subject, category, message });
      await Popup.alert('Support inquiry submitted! We will respond shortly.', { title: 'Inquiry Submitted' });
      subjectInput.value = '';
      messageInput.value = '';
      await loadMyInquiries();
    } catch (err) {
      await Popup.alert(err.message || 'Failed to submit inquiry.', { title: 'Submission Error' });
    }
  }

  await Auth.ready;
  await loadMyInquiries();
});
