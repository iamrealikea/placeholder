# Original User Request

## 2026-10-26T04:08:32Z

Form a multi-agent team (Backend Engineering, Frontend Engineering, and Security/QA Audit) to build, integrate, and audit the **TicketHub Event Booking and Ticketing System** web application on the `dev` branch according to `TOR.md`, `README.md`, and the Figma design prototype.

Working directory: C:\Users\PC-1802\.gemini\antigravity\worktrees\placeholder\plan_ticket_platform (synced with C:\Users\PC-1802\Documents\antigravity\placeholder on branch `dev`)
Integrity mode: demo

Reference material:
- Terms of Reference: `TOR.md` (`FR-01`–`FR-49`)
- Functional, Non-Functional & UI Specs: `README.md` (`FR-01`–`FR-49`, `NFR-01`–`NFR-17`, `UI-01`–`UI-13`)
- Figma Prototype: `https://www.figma.com/design/J7VzZqHECVt7GBi2IvktVv/placeholder-project?node-id=1-2&m=dev` (cached reference images in `C:\Users\PC-1802\.gemini\antigravity\brain\380e8416-c63a-45c5-8527-57032e2c8f4c\scratch\figma_prototype.png` and `figma_thumb.png`)

## Requirements

### R1. Backend REST API & JSON Data Persistence (`FR-01`–`FR-49`, `NFR-01`–`NFR-13`)
Provide a Node.js + Express.js backend (`server.js`) using a local JSON-file Data Access Layer (`data/*.json` with pre-seeded demo data, no external database required) supporting:
- **Authentication & Profile (`FR-01`–`FR-05`)**: Local JWT/cookie auth, registration with full personal fields (Name, Email, Age, Phone, Password, DOB, Gender, National ID, Address), simulated Gmail/Facebook/Phone OTP login, profile editing, and local avatar upload.
- **Event Discovery & Admin Management (`FR-06`–`FR-15`, `FR-40`–`FR-44`, `FR-48`–`FR-49`)**: Event categories (`Concert`, `Seminar`), statuses (`Coming Soon`, `On Sale`, `Sold Out`, `Closed`), search/filter by title, artist, date, and sale window, featured events, bookmarking, Admin event/zone/seating CRUD, sale period enforcement, monthly sales chart dataset, and JSON backup/restore (`NFR-11`, `NFR-12`).
- **Interactive Seating, 10-Minute Seat Hold Lock & Anti-Double Booking (`FR-16`–`FR-23`)**: Per-round and per-zone seat maps (`AVAILABLE`, `HELD`, `BOOKED`), atomic 10-minute seat reservation lock preventing concurrent users from double-booking the same seat, and a background scheduler releasing expired holds.
- **Checkout, Payment Simulator, Promotions/Points & Refund Policy (`FR-24`–`FR-27`, `FR-38`–`FR-39`, `FR-46`–`FR-47`)**: Booking summary with fixed service fee (`40 THB/ticket`), promo code / loyalty point support, payment confirmation across PromptPay QR, Credit/Debit Card, KBank, Krung Thai, and TrueMoney, and ticket cancellation that refunds the ticket price while excluding the non-refundable service fee and releasing seats back to `AVAILABLE`.
- **QR E-Tickets, Staff Scanner Validation, Notifications & Support (`FR-28`–`FR-37`, `FR-45`)**: Real QR code generation on issued tickets, Staff/Admin validation endpoint marking tickets `CHECKED_IN` and rejecting duplicate scans (`FR-31`), Web + Simulated Email notifications on payment success, event updates, and bookmarked event changes, plus user-to-admin support tickets.

### R2. Frontend HTML5, Vanilla CSS & Vanilla JS Matching Figma Design (`UI-01`–`UI-13`)
Build dedicated static HTML pages (`public/index.html`, `public/event.html`, `public/booking.html`, `public/checkout.html`, `public/my-tickets.html`, `public/profile.html`, `public/support.html`, `public/admin.html`, `public/scanner.html`) sharing a common Vanilla CSS stylesheet (`public/css/styles.css`) and modular JS client (`public/js/`) faithful to the Figma design and UI requirements:
- **Brand & Palette**: White navbar with Monday Blue (`#1D56CF`) pill logo (`TicketHub`), Oat Milk (`#FDF9F2`) page background (`UI-01`, `UI-12`), Monday Blue (`#1D56CF`) primary brand & booking theme (`UI-02`, `UI-13`), and Candy Apple (`#FF0800`) accents/badges/CTAs (`UI-03`).
- **Home (`index.html`) & Event Detail (`event.html`)**: Hero banner with red-bordered overlay card and `Feature Event` pill, `Popular` (red-bordered) and `Soon` (blue-bordered) event cards, search/filter controls, and two-column Event Detail view with dual stage photos, grey `Information` card (`Date`, `Schedule`, `Organizer`), and overlapping red pill `Buy Now` button.
- **Seating Plan (`booking.html`) & Checkout (`checkout.html`)**: Stage header, zone tabs, interactive seat matrix where available seats render as black circles with white borders and seat numbers (`UI-04`), booked seats show `✕` (`UI-05`), and selected seats show `✓` (`UI-06`), leading into the Checkout page with a live 10-minute countdown timer and interactive payment simulators per method.
- **My Tickets (`my-tickets.html`), Profile (`profile.html`), Staff Scanner (`scanner.html`), Admin (`admin.html`) & Support (`support.html`)**: E-ticket viewer with real QR code and red `◀` `▶` carousel navigation across seats, purchase history with cancellation/refund modal, Profile page with circular avatar, `My Ticket` red pill button, and `Bookmark` cards, Staff QR scanner (camera/upload/code input), and Admin dashboard with HTML5 Canvas monthly sales graph.

### R3. Automated Verification & Security/TOR Compliance Audit
Create and run an automated integration test suite (`tests/api.test.js` via `npm test`) and perform a comprehensive security & requirement audit verifying all 49 Functional Requirements (`FR-01`–`FR-49`), 17 Non-Functional Requirements (`NFR-01`–`NFR-17`), and 13 UI/UX Requirements (`UI-01`–`UI-13`).

## Acceptance Criteria

### Functional & API Verification (`npm test`)
- [ ] `npm test` exits with code 0 and passes automated end-to-end tests covering registration, login (password + simulated social/OTP), profile update, event search/filter, bookmarking, and sale-period restriction enforcement.
- [ ] Double-booking prevention test passes: when User A holds seat `A1`, User B attempting to hold `A1` in the same round receives HTTP `409 Conflict`.
- [ ] Checkout & payment flow test passes: paying for a held booking transitions seats to `BOOKED`, generates `VALID` tickets with non-empty `qrDataUrl`, awards loyalty points, and creates Web/Email notifications.
- [ ] QR Ticket anti-reuse test passes: first scan via `POST /api/tickets/validate` succeeds and marks the ticket `CHECKED_IN`; a second scan of the same ticket is rejected with HTTP `400` (`ALREADY_CHECKED_IN`).
- [ ] Cancellation & refund calculation test passes: cancelling a paid booking refunds the ticket subtotal minus discounts while retaining the non-refundable service fee (`40 THB/ticket`) and returns the seats to `AVAILABLE`.
- [ ] Admin & Backup/Restore test passes: Admin dashboard returns 12-month sales chart data, non-admin users receive HTTP `403` on Admin/Scanner endpoints, and JSON backup/restore snapshots and restores state cleanly.

### Frontend & Figma UI Verification
- [ ] All 9 HTML pages (`index.html`, `event.html`, `booking.html`, `checkout.html`, `my-tickets.html`, `profile.html`, `support.html`, `admin.html`, `scanner.html`) load without console or syntax errors and are served by `server.js`.
- [ ] `public/css/styles.css` defines and applies `--oat-milk: #FDF9F2`, `--monday-blue: #1D56CF`, and `--candy-apple: #FF0800`, and renders available seats as black circles with white borders (`UI-04`), booked seats with `✕` (`UI-05`), and selected seats with `✓` (`UI-06`).
- [ ] A complete audit report (`AUDIT_REPORT.md`) is produced mapping every `FR-01`–`FR-49`, `NFR-01`–`NFR-17`, and `UI-01`–`UI-13` requirement to its implementation and test verification status.
