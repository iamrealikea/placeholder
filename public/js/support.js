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
          <div style="text-align: center; padding: 24px; color: #6B7280;">
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
        <div style="text-align: center; padding: 32px; color: #6B7280;">
          No support inquiries found. Submit your question using the form.
        </div>
      `;
      return;
    }

    myInquiriesContainer.innerHTML = list
      .map((item) => {
        const isResolved = item.status === 'RESOLVED';
        const badgeColor = isResolved ? '#10B981' : '#F59E0B';
        const dateStr = new Date(item.createdAt).toLocaleString();

        return `
          <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 18px; margin-bottom: 16px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #6B7280;">${item.category}</span>
                <h4 style="font-size: 1.15rem; color: #111827; margin-top: 2px;">${item.subject}</h4>
              </div>
              <span style="background: ${badgeColor}20; color: ${badgeColor}; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.8rem;">
                ${item.status}
              </span>
            </div>
            
            <p style="color: #4B5563; font-size: 0.95rem; margin-bottom: 12px; line-height: 1.5;">${item.message}</p>
            <div style="font-size: 0.8rem; color: #9CA3AF; margin-bottom: 12px;">Submitted on ${dateStr}</div>

            ${
              isResolved && item.adminReply
                ? `
                  <div style="background: #EBF1FD; border-left: 4px solid #1D56CF; border-radius: 6px; padding: 12px 16px; margin-top: 10px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: #1D56CF; margin-bottom: 4px;">TicketHub Support Team Reply:</div>
                    <div style="color: #111827; font-size: 0.95rem;">${item.adminReply}</div>
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
      alert('Please fill in both subject and message.');
      return;
    }

    try {
      await API.support.submit({ subject, category, message });
      alert('Support inquiry submitted! We will respond shortly.');
      subjectInput.value = '';
      messageInput.value = '';
      await loadMyInquiries();
    } catch (err) {
      alert(err.message || 'Failed to submit inquiry.');
    }
  }

  await loadMyInquiries();
});
