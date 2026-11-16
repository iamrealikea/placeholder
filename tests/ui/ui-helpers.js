async function loginViaModal(page, email, password) {
  const modal = page.locator('#authModal');
  if (!(await modal.isVisible())) {
    await page.locator('.avatar-pill').click();
  }
  await modal.waitFor({ state: 'visible' });
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(password);
  await page.locator('#formLogin button[type="submit"]').click();
}

async function dismissPopup(page) {
  const primary = page.locator('dialog.th-popup-dialog .th-popup-btn--primary').last();
  await primary.waitFor({ state: 'visible' });
  await primary.click();
}

module.exports = { loginViaModal, dismissPopup };
