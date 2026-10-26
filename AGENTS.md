# TicketHub Platform Development Guidelines & Invariants

This workspace contains the **TicketHub Event Booking and Ticketing System** (`tickethub-platform`). All agents and contributors must observe the following design, security, and verification rules.

---

## 1. Frontend UI & Styling Invariants

All HTML pages in `public/` and stylesheets in `public/css/` must strictly conform to the established design system:

### Typography
- Primary font is **Lato** (`300`, `400`, `700`, `900`, italic).
- Any new HTML page or layout modification must include the Google Fonts preconnect and Lato stylesheet links:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,300;0,400;0,700;0,900;1,400&display=swap" rel="stylesheet">
  ```
- CSS variables must define:
  ```css
  --font-family: 'Lato', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-brand: 'Lato', sans-serif;
  ```

### Brand Color Palette
Use only the defined design tokens for brand consistency:
- **Oat Milk (`#FDF9F2`)**: Page body background (`--oat-milk`), card backgrounds (`UI-01`, `UI-12`).
- **Monday Blue (`#1D56CF`)**: Primary branding, navigation active pills, booking theme, header bars (`--monday-blue`, `UI-02`, `UI-13`).
- **Candy Apple Red (`#FF0800`)**: Primary CTA buttons ("Buy Now"), alert badges, feature event borders (`--candy-apple`, `UI-03`).

### Seating Plan Interactive States
The interactive seat matrix in `public/booking.html` must follow the exact visual states:
- **Available Seat (`UI-04`)**: Black circle with a white border and seat number label (`A1`, `B2`).
- **Booked / Held Seat (`UI-05`)**: Greyed background marked with an `✕`.
- **Selected Seat (`UI-06`)**: Monday Blue circle marked with a `✓`.

---

## 2. Verification & Testing Standards

Never mark a task complete or commit code without executing both verification suites:

### Automated Test Suites
1. **Adversarial Auth & Concurrency Harness**:
   ```bash
   node tests/adversarial-harness.js
   ```
   - Must pass all 44/44 test cases (`failedCount: 0`).
   - Validates race conditions (concurrent duplicate email and national ID registration), input fuzzing/type coercion (`object`, `array`, `numeric` passwords), JWT security, avatar upload guards, and sensitive data leakage.
2. **E2E Integration Test Suite**:
   ```bash
   npm test
   ```
   - Must pass all 34+ integration tests (`node --test tests/api.test.js`).
   - Validates user auth, profile updates, event filtering, sale window restrictions, 10-minute atomic seat locks, payment simulation, single-use QR ticket validation, refund calculation (retaining 40 THB fee), and Admin/Staff RBAC.

### Test Data Cleanliness
- After running adversarial tests or whenever database state needs resetting, run:
  ```bash
  npm run seed
  ```
  to restore clean demo seed data in `data/*.json`.

---

## 3. Backend & Security Guardrails

- **Sanitization Invariant**: Always use `sanitizeUser()` before returning user records. Never leak `passwordHash` in any API response or notification payload.
- **Anti-Self-Demotion**: When handling role updates in `PUT /api/admin/users/:id/role`, administrators cannot demote their own active account.
- **Seat Reservation Locks**: Seat holds require atomic reservation check and a 10-minute expiration window to prevent double-booking (`FR-23`, `NFR-08`).
- **Single-Use Check-In**: Scanning tickets via `POST /api/tickets/validate` must reject already checked-in tickets with HTTP `400 ALREADY_CHECKED_IN` fraud warning (`FR-31`).
