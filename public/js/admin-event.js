/**
 * TicketHub — Dedicated Admin Event Management & Seat Builder Engine
 * File: public/js/admin-event.js
 * Implements F-12 through F-18 (Milestone 3) + Zoomable Canvas & Symmetric Alignment
 * Conforms strictly to AGENTS.md, ORIGINAL_REQUEST.md, and implementation_plan.md
 */

(() => {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. Dual-Alias DOM Element Helper
  // -------------------------------------------------------------------------
  function getEl(idOrIds) {
    if (Array.isArray(idOrIds)) {
      for (const id of idOrIds) {
        const el = document.getElementById(id) || document.querySelector(id);
        if (el) return el;
      }
      return null;
    }
    return document.getElementById(idOrIds) || document.querySelector(idOrIds);
  }

  // -------------------------------------------------------------------------
  // 2. Central State Store & Geometry Constants
  // -------------------------------------------------------------------------
  const SEAT_RADIUS = 18;
  const SEAT_DIAMETER = 36;
  const GRID_PITCH = 44;
  const HALF_PITCH = 22;

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 2.0;
  const ZOOM_STEP = 0.15;

  const State = {
    mode: 'create', // 'create' | 'edit'
    eventId: null,
    isLayoutLocked: false,
    builderMode: 'matrix', // 'matrix' | 'custom' | 'template'
    templates: [],

    // Canvas Logical Dimensions & Zoom State
    logicalWidth: 1000,
    logicalHeight: 700,
    zoom: 1.0,
    isSpaceDown: false,

    // Event metadata
    eventData: {
      title: '',
      category: 'Concert',
      venue: '',
      artist: '',
      organizer: '',
      status: 'On Sale',
      description: '',
      posterUrl: '',
      galleryUrls: [],
      gateOpenTime: '17:30',
      showTime: '19:00',
      saleStartAt: '',
      saleEndAt: '',
      isFeatured: false,
      rounds: []
    },

    // Seating data
    zones: [], // Array of zone objects
    seats: [], // Flat array of seat objects: { id, zoneId, label, row, col, x, y, color, price, status }
    selectedSeatIds: new Set(),
    activeZoneId: null,

    // Interaction state
    canvas: null,
    ctx: null,
    isDirty: false,
    interaction: {
      mode: 'idle', // 'idle' | 'marquee' | 'drag-seat' | 'pan'
      marqueeStart: { x: 0, y: 0 },
      marqueeCurrent: { x: 0, y: 0 },
      dragStart: { x: 0, y: 0 },
      draggedSeatsOrig: new Map(), // seatId -> { x, y }
      panStart: { clientX: 0, clientY: 0, scrollLeft: 0, scrollTop: 0 },
      hoveredSeatId: null
    }
  };

  /**
   * Computes a horizontally centered originX on the canvas for a given column count.
   */
  function getCenteredOriginX(cols, canvasWidth = State.logicalWidth) {
    const c = Math.max(1, Number(cols) || 1);
    const totalRowWidth = (c - 1) * GRID_PITCH + SEAT_DIAMETER;
    return Math.max(40, Math.round((canvasWidth - totalRowWidth) / 2));
  }

  /**
   * Snaps a coordinate to the nearest clean grid increment (22px half-pitch).
   */
  function snapToGrid(val, step = HALF_PITCH) {
    return Math.round(Number(val) / step) * step;
  }

  // Fallback Template Presets (Centered on Canvas)
  const FALLBACK_TEMPLATES = [
    {
      id: 'concert-arena',
      name: 'Concert Arena',
      category: 'Concert',
      canvasWidth: 1000,
      canvasHeight: 700,
      zones: [
        {
          id: 'zone-floor',
          name: 'VIP Floor (Standing/Seated)',
          color: '#1D56CF',
          price: 3500,
          layout: 'matrix',
          rows: 5,
          cols: 14,
          originX: getCenteredOriginX(14, 1000),
          originY: 96
        },
        {
          id: 'zone-lower',
          name: 'Lower Tier',
          color: '#10B981',
          price: 2200,
          layout: 'matrix',
          rows: 4,
          cols: 16,
          originX: getCenteredOriginX(16, 1000),
          originY: 340
        },
        {
          id: 'zone-upper',
          name: 'Upper Balcony',
          color: '#F59E0B',
          price: 1200,
          layout: 'matrix',
          rows: 3,
          cols: 18,
          originX: getCenteredOriginX(18, 1000),
          originY: 540
        }
      ]
    },
    {
      id: 'theater-hall',
      name: 'Theater / Hall',
      category: 'Concert',
      canvasWidth: 1000,
      canvasHeight: 650,
      zones: [
        {
          id: 'zone-orchestra',
          name: 'Orchestra Stalls',
          color: '#1D56CF',
          price: 2500,
          layout: 'matrix',
          rows: 6,
          cols: 12,
          originX: getCenteredOriginX(12, 1000),
          originY: 96
        },
        {
          id: 'zone-balcony',
          name: 'Grand Circle',
          color: '#8B5CF6',
          price: 1500,
          layout: 'matrix',
          rows: 4,
          cols: 14,
          originX: getCenteredOriginX(14, 1000),
          originY: 404
        }
      ]
    },
    {
      id: 'seminar-classroom',
      name: 'Seminar Classroom',
      category: 'Seminar',
      canvasWidth: 900,
      canvasHeight: 600,
      zones: [
        {
          id: 'zone-delegates',
          name: 'Main Classroom',
          color: '#1D56CF',
          price: 800,
          layout: 'matrix',
          rows: 6,
          cols: 8,
          originX: getCenteredOriginX(8, 900),
          originY: 118
        }
      ]
    }
  ];

  // -------------------------------------------------------------------------
  // 3. UI Feedback Helpers (Toasts & Banner)
  // -------------------------------------------------------------------------
  function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.admin-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `admin-toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('is-fading');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function setLockBanner(isLocked, message = '') {
    const banner = getEl(['layout-lock-banner']);
    if (!banner) return;
    if (isLocked) {
      banner.classList.remove('hidden');
      banner.style.display = 'flex';
      const textSpan = banner.querySelector('.lock-banner-content span') || banner.querySelector('p') || banner;
      textSpan.textContent = message ||
        'This event has active bookings or held seats. Seat coordinates, additions, deletions, and layout modes are locked to prevent double-booking. Event details, prices, and colors can still be updated.';
      const canvasSection = getEl(['seat-canvas-section']);
      if (canvasSection) canvasSection.classList.add('locked');
    } else {
      banner.classList.add('hidden');
      banner.style.display = 'none';
      const canvasSection = getEl(['seat-canvas-section']);
      if (canvasSection) canvasSection.classList.remove('locked');
    }
  }

  // -------------------------------------------------------------------------
  // 4. Lifecycle & Mode Initialization
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    // 4.1 RBAC Guard
    if (window.Auth) {
      if (!Auth.currentUser && typeof Auth.fetchCurrentUser === 'function') {
        try { await Auth.fetchCurrentUser(); } catch (_) {}
      }
      if (typeof Auth.isLoggedIn === 'function' && typeof Auth.isAdmin === 'function') {
        if (!Auth.isLoggedIn() || !Auth.isAdmin()) {
          const main = document.querySelector('main');
          if (main) {
            main.innerHTML = `
              <div class="tc bg-white r-16 admin-guard-banner">
                <h2 class="c-red">Operational Privileges Required</h2>
                <p class="c-ink-2 my-16-24">Administrator access is required to access the Seat Builder.</p>
                <a href="/admin" class="btn-pill-blue no-ul inline-block btn-pill-action">Return to Portal</a>
              </div>
            `;
          }
          return;
        }
      }
    }

    // 4.2 Initialize Canvas
    State.canvas = getEl(['seat-canvas']);
    if (State.canvas) {
      State.logicalWidth = Number(State.canvas.getAttribute('width')) || 1000;
      State.logicalHeight = Number(State.canvas.getAttribute('height')) || 700;
      State.ctx = State.canvas.getContext('2d');
      applyCanvasDimensions();
    }

    // 4.3 Load Template Catalog Presets
    await loadTemplates();

    // 4.4 Parse URL Query Parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('id')) {
      State.mode = 'edit';
      State.eventId = urlParams.get('id');
      await initEditMode(State.eventId);
    } else {
      State.mode = 'create';
      initCreateMode();
    }

    // 4.5 Bind Event Listeners
    bindModeSwitchers();
    bindZoomAndAlignmentControls();
    bindCanvasEvents();
    bindSidePanelEvents();
    bindFormEvents();
    bindMatrixControls();
    bindTemplateControls();
    bindRoundsControls();
    bindDeleteModalEvents();

    // Render Initial Canvas State
    renderCanvas();
    updateCanvasStats();
  });

  // -------------------------------------------------------------------------
  // 5. Template Catalog Prefetching
  // -------------------------------------------------------------------------
  async function loadTemplates() {
    try {
      let data = null;
      if (window.API && API.events && typeof API.events.templates === 'function') {
        data = await API.events.templates();
      } else {
        const res = await fetch('/api/events/templates');
        if (res.ok) data = await res.json();
      }
      if (data && data.templates && data.templates.length > 0) {
        State.templates = data.templates;
      } else {
        State.templates = FALLBACK_TEMPLATES;
      }
    } catch (_) {
      State.templates = FALLBACK_TEMPLATES;
    }
    populateTemplateDropdown(State.templates);
  }

  function populateTemplateDropdown(templates) {
    const select = getEl(['template-select']);
    if (!select) return;
    select.innerHTML = templates
      .map(t => `<option value="${t.id}">${t.name} (${t.category || 'General'})</option>`)
      .join('');
  }

  // -------------------------------------------------------------------------
  // 6. Create Mode Initialization
  // -------------------------------------------------------------------------
  function initCreateMode() {
    setLockBanner(false);
    State.isLayoutLocked = false;

    const pageBreadcrumb = getEl(['page-mode-breadcrumb']);
    if (pageBreadcrumb) pageBreadcrumb.textContent = 'Create New Event';

    const pageTitle = getEl(['page-title']);
    if (pageTitle) pageTitle.textContent = 'Create New Event & Seating Map';

    // Default Round
    const now = new Date();
    const defaultDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    State.eventData.rounds = [
      { id: 'rnd-1', date: defaultDate, time: '19:00', label: 'Round 1' }
    ];

    const defaultCols = 10;
    const defaultOriginX = getCenteredOriginX(defaultCols, State.logicalWidth);
    const defaultOriginY = 96;

    // Populate Initial Zone (Centered under stage)
    State.zones = [
      {
        id: 'zone-standard',
        name: 'Standard Zone',
        color: '#1D56CF',
        price: 1500,
        layout: 'matrix',
        rows: 5,
        cols: defaultCols,
        originX: defaultOriginX,
        originY: defaultOriginY,
        seats: []
      }
    ];
    State.activeZoneId = 'zone-standard';

    // Sync Matrix Inputs to Initial Centered Values
    const originXEl = getEl(['matrix-origin-x']);
    if (originXEl) originXEl.value = defaultOriginX;
    const originYEl = getEl(['matrix-origin-y']);
    if (originYEl) originYEl.value = defaultOriginY;

    // Generate Default Matrix Seats
    regenerateMatrixForZone(State.zones[0]);
    updateSidePanelZones();
    renderRoundsList();
    populateFormFields();

    // Hide Delete Button in Create Mode
    const deleteBtn = getEl(['delete-event-btn']);
    if (deleteBtn) deleteBtn.style.display = 'none';
  }

  // -------------------------------------------------------------------------
  // 7. Edit Mode Initialization & Layout Lock Guard
  // -------------------------------------------------------------------------
  async function initEditMode(eventId) {
    try {
      let event = null;
      if (window.API && API.events && typeof API.events.getById === 'function') {
        const res = await API.events.getById(eventId);
        event = res.event || res;
      } else {
        const res = await fetch(`/api/events/${eventId}`);
        if (res.ok) {
          const json = await res.json();
          event = json.event || json;
        }
      }

      if (!event) throw new Error('Event not found');
      State.eventData = { ...event };

      // Update Breadcrumb & Header
      const pageBreadcrumb = getEl(['page-mode-breadcrumb']);
      if (pageBreadcrumb) pageBreadcrumb.textContent = `Edit Event: ${event.title}`;

      const pageTitle = getEl(['page-title']);
      if (pageTitle) pageTitle.textContent = `Edit: ${event.title}`;

      // Show Delete Button
      const deleteBtn = getEl(['delete-event-btn']);
      if (deleteBtn) deleteBtn.style.display = 'inline-flex';

      // Populate Form Fields
      populateFormFields();

      // Load Zones
      State.zones = (event.zones || []).map(z => ({
        ...z,
        seats: Array.isArray(z.seats) ? [...z.seats] : []
      }));
      if (State.zones.length > 0) {
        State.activeZoneId = State.zones[0].id;
      }

      // Load Existing Seats from first round
      const firstRoundId = event.rounds && event.rounds[0] ? event.rounds[0].id : null;
      let seatsData = [];
      if (firstRoundId) {
        try {
          if (window.API && API.booking && typeof API.booking.getSeats === 'function') {
            const seatsRes = await API.booking.getSeats(eventId, firstRoundId);
            seatsData = seatsRes.seats || [];
          } else {
            const seatsRes = await fetch(`/api/bookings/${eventId}/seats?roundId=${firstRoundId}`);
            if (seatsRes.ok) {
              const seatsJson = await seatsRes.json();
              seatsData = seatsJson.seats || [];
            }
          }
        } catch (_) {}
      }

      // Check whether layout is locked (HELD or BOOKED seats exist)
      let hasActiveBookings = seatsData.some(s => s.status === 'HELD' || s.status === 'BOOKED');
      if (!hasActiveBookings && event.rounds) {
        hasActiveBookings = event.rounds.some(r => r.zones && r.zones.some(z => (z.heldSeats > 0 || z.bookedSeats > 0)));
      }

      State.isLayoutLocked = hasActiveBookings;
      if (State.isLayoutLocked) {
        setLockBanner(true);
        disableLayoutControls();
      } else {
        setLockBanner(false);
      }

      // Compute default non-overlapping centered zone origins for legacy zones that lack originX/originY
      let runningOriginY = 96;
      State.zones.forEach((z) => {
        const rows = Number(z.rows || 4);
        const cols = Number(z.cols || 8);
        if (z.originX === undefined || z.originX === null || (z.originX === 0 && z.originY === 0)) {
          z.originX = getCenteredOriginX(cols, State.logicalWidth);
          z.originY = runningOriginY;
        }
        runningOriginY = Number(z.originY) + rows * GRID_PITCH + 36;
      });

      // Dynamically expand logicalHeight if zones extend past 700px
      if (runningOriginY + 60 > State.logicalHeight) {
        State.logicalHeight = Math.max(700, runningOriginY + 60);
        applyCanvasDimensions();
      }

      // Populate seats on canvas
      if (seatsData.length > 0) {
        const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        State.seats = seatsData.map(s => {
          const zoneObj = State.zones.find(z => z.id === s.zoneId);
          const rowStr = s.row || (s.seatNumber ? s.seatNumber.charAt(0) : 'A');
          const rIdx = Math.max(0, rowLetters.indexOf(rowStr.toUpperCase()));
          const cIdx = Math.max(1, Number(s.col) || parseInt(String(s.seatNumber || '').slice(1), 10) || 1);
          const baseOriginX = zoneObj && zoneObj.originX !== undefined
            ? Number(zoneObj.originX)
            : getCenteredOriginX(zoneObj ? zoneObj.cols : 8, State.logicalWidth);
          const baseOriginY = zoneObj && zoneObj.originY !== undefined ? Number(zoneObj.originY) : 96;

          const computedX = s.x !== null && s.x !== undefined ? Number(s.x) : baseOriginX + (cIdx - 1) * GRID_PITCH;
          const computedY = s.y !== null && s.y !== undefined ? Number(s.y) : baseOriginY + rIdx * GRID_PITCH;

          return {
            id: s.id || `seat-${s.zoneId}-${s.seatNumber}`,
            zoneId: s.zoneId,
            label: s.seatNumber || s.label || 'S1',
            row: rowStr,
            col: cIdx,
            x: computedX,
            y: computedY,
            color: s.seatColor || s.zoneColor || (zoneObj ? zoneObj.color : '#1D56CF'),
            price: s.price !== undefined ? Number(s.price) : (zoneObj ? Number(zoneObj.price) : 1000),
            status: s.status || 'AVAILABLE'
          };
        });
      } else {
        // Fallback: build seats from event zones
        State.seats = [];
        for (const z of State.zones) {
          if (Array.isArray(z.seats) && z.seats.length > 0) {
            for (const zs of z.seats) {
              State.seats.push({
                id: `seat-${z.id}-${zs.label}`,
                zoneId: z.id,
                label: zs.label,
                row: zs.row || zs.label.charAt(0),
                col: zs.col || 1,
                x: Number(zs.x || 0),
                y: Number(zs.y || 0),
                color: zs.color || z.color,
                price: Number(zs.price !== undefined ? zs.price : z.price),
                status: 'AVAILABLE'
              });
            }
          } else {
            regenerateMatrixForZone(z, false);
          }
        }
      }

      renderRoundsList();
      updateSidePanelZones();
      renderCanvas();
      updateCanvasStats();
    } catch (err) {
      showToast('Failed to load event: ' + err.message, 'error');
    }
  }

  function disableLayoutControls() {
    const modeBtns = document.querySelectorAll('.mode-pill, .btn-mode, #mode-matrix, #mode-custom, #mode-template');
    modeBtns.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    });

    const matrixControls = getEl(['matrix-controls', 'matrix-controls-bar']);
    if (matrixControls) matrixControls.style.display = 'none';

    const templateControls = getEl(['template-controls', 'template-controls-group']);
    if (templateControls) templateControls.style.display = 'none';

    const customControls = getEl(['custom-controls']);
    if (customControls) customControls.style.display = 'none';

    const deleteSeatBtn = getEl(['delete-seat-btn']);
    if (deleteSeatBtn) deleteSeatBtn.disabled = true;

    const alignBtn = getEl(['align-seats-btn']);
    if (alignBtn) alignBtn.disabled = true;

    const clearCanvasBtn = getEl(['clear-canvas-btn']);
    if (clearCanvasBtn) clearCanvasBtn.disabled = true;
  }

  // -------------------------------------------------------------------------
  // 8. Form Data Population & Binding
  // -------------------------------------------------------------------------
  function populateFormFields() {
    const d = State.eventData;

    const titleInput = getEl(['event-title']);
    if (titleInput) titleInput.value = d.title || '';

    const catSelect = getEl(['event-category']);
    if (catSelect) catSelect.value = d.category || 'Concert';

    const venueInput = getEl(['event-venue']);
    if (venueInput) venueInput.value = d.venue || '';

    const artistInput = getEl(['event-artist']);
    if (artistInput) artistInput.value = d.artist || '';

    const orgInput = getEl(['event-organizer']);
    if (orgInput) orgInput.value = d.organizer || '';

    const statusSelect = getEl(['event-status']);
    if (statusSelect) statusSelect.value = d.status || 'On Sale';

    const descInput = getEl(['event-description']);
    if (descInput) descInput.value = d.description || '';

    const posterInput = getEl(['event-poster-url', 'event-poster']);
    if (posterInput) posterInput.value = d.posterUrl || '';

    const galleryInput = getEl(['event-gallery']);
    if (galleryInput) galleryInput.value = Array.isArray(d.galleryUrls) ? d.galleryUrls.join(', ') : (d.galleryUrls || '');

    const saleStart = getEl(['event-sale-start']);
    if (saleStart) saleStart.value = d.saleStartDate || d.saleStartAt || '';

    const saleEnd = getEl(['event-sale-end']);
    if (saleEnd) saleEnd.value = d.saleEndDate || d.saleEndAt || '';

    const gateTime = getEl(['event-gate-time']);
    if (gateTime) gateTime.value = d.gateOpenTime || '';

    const featInput = getEl(['event-featured']);
    if (featInput) featInput.checked = !!d.isFeatured;

    // Single Round sync
    const firstRound = (d.rounds && d.rounds[0]) || {};
    const dateInput = getEl(['event-date']);
    if (dateInput) dateInput.value = firstRound.date || '';

    const timeInput = getEl(['event-time', 'event-show-time']);
    if (timeInput) timeInput.value = firstRound.time || d.showTime || '19:00';
  }

  // -------------------------------------------------------------------------
  // 9. Builder Mode Switching
  // -------------------------------------------------------------------------
  function bindModeSwitchers() {
    const modeBtns = document.querySelectorAll('.mode-pill, .btn-mode');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (State.isLayoutLocked) return;
        const mode = btn.dataset.mode || btn.id.replace('mode-', '');
        setBuilderMode(mode);
      });
    });

    const clearBtn = getEl(['clear-canvas-btn']);
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (State.isLayoutLocked) return;
        if (confirm('Are you sure you want to clear all seats from the canvas?')) {
          State.seats = [];
          State.selectedSeatIds.clear();
          updateSidePanelSelection();
          updateSidePanelZones();
          renderCanvas();
          updateCanvasStats();
          showToast('Canvas cleared', 'info');
        }
      });
    }
  }

  function setBuilderMode(mode) {
    State.builderMode = mode;
    document.querySelectorAll('.mode-pill, .btn-mode').forEach(b => {
      const bMode = b.dataset.mode || b.id.replace('mode-', '');
      b.classList.toggle('active', bMode === mode);
    });

    const matrixControls = getEl(['matrix-controls', 'matrix-controls-bar']);
    const templateControls = getEl(['template-controls', 'template-controls-group']);
    const customControls = getEl(['custom-controls']);
    const helperText = getEl(['canvas-helper-text']);

    if (matrixControls) matrixControls.style.display = mode === 'matrix' ? 'flex' : 'none';
    if (templateControls) templateControls.style.display = mode === 'template' ? 'flex' : 'none';
    if (customControls) customControls.style.display = mode === 'custom' ? 'block' : 'none';

    if (helperText) {
      if (mode === 'matrix') {
        helperText.textContent = 'Matrix mode: Configure rows and columns, then click "Add Matrix Grid". Hold Ctrl+Scroll to zoom.';
      } else if (mode === 'custom') {
        helperText.textContent = 'Custom mode: Click empty canvas to place a seat (snaps to grid). Drag to reposition. Delete key to remove.';
      } else if (mode === 'template') {
        helperText.textContent = 'Template mode: Select a venue preset and click "Load Preset".';
      }
    }

    renderCanvas();
  }

  // -------------------------------------------------------------------------
  // 9b. Zoom Controls & Symmetric Seat Alignment
  // -------------------------------------------------------------------------
  function applyCanvasDimensions() {
    if (!State.canvas) return;
    State.canvas.width = State.logicalWidth;
    State.canvas.height = State.logicalHeight;
    State.canvas.style.width = `${Math.round(State.logicalWidth * State.zoom)}px`;
    State.canvas.style.height = `${Math.round(State.logicalHeight * State.zoom)}px`;

    const zoomResetBtn = getEl(['zoom-reset-btn']);
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${Math.round(State.zoom * 100)}%`;
    }
  }

  function setZoom(newZoom, focusPoint = null) {
    if (!State.canvas) return;
    const container = getEl(['seat-canvas-container']);
    const prevZoom = State.zoom;
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(newZoom * 100) / 100));
    if (clamped === prevZoom) return;

    let ratioX = 0.5;
    let ratioY = 0.5;
    if (container && focusPoint) {
      const rect = container.getBoundingClientRect();
      ratioX = (focusPoint.clientX - rect.left + container.scrollLeft) / Math.max(1, State.logicalWidth * prevZoom);
      ratioY = (focusPoint.clientY - rect.top + container.scrollTop) / Math.max(1, State.logicalHeight * prevZoom);
    }

    State.zoom = clamped;
    applyCanvasDimensions();
    renderCanvas();

    if (container && focusPoint) {
      const rect = container.getBoundingClientRect();
      container.scrollLeft = ratioX * (State.logicalWidth * State.zoom) - (focusPoint.clientX - rect.left);
      container.scrollTop = ratioY * (State.logicalHeight * State.zoom) - (focusPoint.clientY - rect.top);
    }
  }

  function fitCanvasToViewport() {
    const container = getEl(['seat-canvas-container']);
    if (!container || !State.canvas) return;
    const availW = Math.max(320, container.clientWidth - 40);
    const availH = Math.max(320, container.clientHeight - 40);
    const fitScale = Math.min(availW / State.logicalWidth, availH / State.logicalHeight, 1.25);
    setZoom(fitScale);
  }

  /**
   * Aligns and centers seats in neat rows and columns symmetrically under the stage.
   * If seats are selected, aligns the zones of the selected seats; otherwise aligns all zones.
   */
  function alignAndCenterSeats() {
    if (State.isLayoutLocked) return;
    if (State.seats.length === 0) {
      showToast('No seats on canvas to align', 'info');
      return;
    }

    const targetZoneIds = State.selectedSeatIds.size > 0
      ? new Set(State.seats.filter(s => State.selectedSeatIds.has(s.id)).map(s => s.zoneId))
      : new Set(State.zones.map(z => z.id));

    let currentTopY = 96;
    State.zones.forEach((zone) => {
      if (!targetZoneIds.has(zone.id)) {
        const zSeats = State.seats.filter(s => s.zoneId === zone.id);
        if (zSeats.length > 0) {
          const maxY = Math.max(...zSeats.map(s => Number(s.y) || 0));
          currentTopY = Math.max(currentTopY, maxY + GRID_PITCH + 24);
        }
        return;
      }

      const rows = getZoneRows(zone.id);
      if (rows.length === 0) return;

      rows.forEach((rowObj, rIdx) => {
        const colsInRow = rowObj.seats.length;
        const rowStartX = getCenteredOriginX(colsInRow, State.logicalWidth);
        const rowY = targetZoneIds.size === State.zones.length
          ? currentTopY + rIdx * GRID_PITCH
          : snapToGrid(rowObj.y, HALF_PITCH);

        rowObj.seats
          .sort((a, b) => Number(a.x) - Number(b.x))
          .forEach((seat, cIdx) => {
            seat.x = rowStartX + cIdx * GRID_PITCH;
            seat.y = rowY;
          });
      });

      normalizeZoneRows(zone.id);
      const firstRowCols = rows[0].seats.length;
      zone.originX = getCenteredOriginX(firstRowCols, State.logicalWidth);
      zone.originY = rows[0].seats[0] ? rows[0].seats[0].y : currentTopY;
      currentTopY = zone.originY + rows.length * GRID_PITCH + 32;
    });

    renderCanvas();
    showToast('Seats aligned & centered symmetrically with stage', 'success');
  }

  function bindZoomAndAlignmentControls() {
    const zoomInBtn = getEl(['zoom-in-btn']);
    const zoomOutBtn = getEl(['zoom-out-btn']);
    const zoomResetBtn = getEl(['zoom-reset-btn']);
    const zoomFitBtn = getEl(['zoom-fit-btn']);
    const alignBtn = getEl(['align-seats-btn']);
    const container = getEl(['seat-canvas-container']);

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => setZoom(State.zoom + ZOOM_STEP));
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => setZoom(State.zoom - ZOOM_STEP));
    }
    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => setZoom(1.0));
    }
    if (zoomFitBtn) {
      zoomFitBtn.addEventListener('click', fitCanvasToViewport);
    }
    if (alignBtn) {
      alignBtn.addEventListener('click', alignAndCenterSeats);
    }

    if (container) {
      // Ctrl/Meta + Wheel Zooming & Shift+Wheel 2D Panning Fallback
      container.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
          setZoom(State.zoom + delta, { clientX: e.clientX, clientY: e.clientY });
          return;
        }
        // 2D Panning fallback when CSS scroll-axis-lock: none is not supported
        if (!CSS.supports('scroll-axis-lock', 'none') && e.deltaX !== 0 && e.deltaY !== 0) {
          e.preventDefault();
          container.scrollLeft += e.deltaX;
          container.scrollTop += e.deltaY;
        }
      }, { passive: false });
    }

    // Track Spacebar for Space+Drag panning
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) {
        State.isSpaceDown = true;
        if (container) container.classList.add('is-panning');
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        State.isSpaceDown = false;
        if (container && State.interaction.mode !== 'pan') {
          container.classList.remove('is-panning');
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // 10. Matrix Mode Grid Generation
  // -------------------------------------------------------------------------
  function bindMatrixControls() {
    const colsInput = getEl(['matrix-cols']);
    const originXInput = getEl(['matrix-origin-x']);

    // Automatically keep Origin X centered when Cols changes unless manually overridden
    if (colsInput && originXInput) {
      colsInput.addEventListener('input', () => {
        const cols = parseInt(colsInput.value, 10) || 10;
        originXInput.value = getCenteredOriginX(cols, State.logicalWidth);
      });
    }

    const genBtn = getEl(['matrix-generate-btn', 'generate-matrix-btn']);
    if (genBtn) {
      genBtn.addEventListener('click', () => {
        if (State.isLayoutLocked) return;
        const rows = parseInt((getEl(['matrix-rows']) || { value: 6 }).value, 10) || 6;
        const cols = parseInt((getEl(['matrix-cols']) || { value: 10 }).value, 10) || 10;
        const rawOriginX = parseInt((getEl(['matrix-origin-x']) || { value: 0 }).value, 10);
        const originX = Number.isFinite(rawOriginX) && rawOriginX > 0
          ? rawOriginX
          : getCenteredOriginX(cols, State.logicalWidth);
        const originY = parseInt((getEl(['matrix-origin-y']) || { value: 96 }).value, 10) || 96;

        if (rows * cols > 2000) {
          showToast('Zone exceeds maximum capacity of 2000 seats', 'error');
          return;
        }

        let targetZone = State.zones.find(z => z.id === State.activeZoneId);
        if (!targetZone) {
          targetZone = State.zones[0];
          if (!targetZone) {
            targetZone = {
              id: 'zone-1',
              name: 'General Admission',
              color: '#1D56CF',
              price: 1000,
              layout: 'matrix',
              rows,
              cols,
              originX,
              originY,
              seats: []
            };
            State.zones.push(targetZone);
          }
          State.activeZoneId = targetZone.id;
        }

        targetZone.layout = 'matrix';
        targetZone.rows = rows;
        targetZone.cols = cols;
        targetZone.originX = originX;
        targetZone.originY = originY;

        // Expand canvas height if needed so large matrices fit comfortably
        const requiredHeight = originY + rows * GRID_PITCH + 60;
        if (requiredHeight > State.logicalHeight) {
          State.logicalHeight = requiredHeight;
          applyCanvasDimensions();
        }

        regenerateMatrixForZone(targetZone, true);
        updateSidePanelZones();
        renderCanvas();
        updateCanvasStats();
        showToast(`Generated ${rows}×${cols} matrix for ${targetZone.name}`, 'success');
      });
    }
  }

  function regenerateMatrixForZone(zone, replaceExisting = true) {
    if (replaceExisting) {
      State.seats = State.seats.filter(s => s.zoneId !== zone.id);
    }

    const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const rows = zone.rows || 4;
    const cols = zone.cols || 8;
    const originX = zone.originX !== undefined ? zone.originX : getCenteredOriginX(cols, State.logicalWidth);
    const originY = zone.originY !== undefined ? zone.originY : 96;

    for (let r = 0; r < rows; r++) {
      const rowLetter = rowLetters[r] || `R${r + 1}`;
      for (let c = 1; c <= cols; c++) {
        const label = `${rowLetter}${c}`;
        const x = originX + (c - 1) * GRID_PITCH;
        const y = originY + r * GRID_PITCH;

        State.seats.push({
          id: `seat-${zone.id}-${label}`,
          zoneId: zone.id,
          label,
          row: rowLetter,
          col: c,
          x,
          y,
          color: zone.color || '#1D56CF',
          price: zone.price !== undefined ? zone.price : 1000,
          status: 'AVAILABLE'
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 11. Template Preset Loader
  // -------------------------------------------------------------------------
  function bindTemplateControls() {
    const applyBtn = getEl(['apply-template-btn']);
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        if (State.isLayoutLocked) return;
        const select = getEl(['template-select']);
        if (!select) return;
        const tId = select.value;
        const template = State.templates.find(t => t.id === tId) || FALLBACK_TEMPLATES.find(t => t.id === tId);
        if (!template) {
          showToast('Template preset not found', 'error');
          return;
        }

        // Adjust Canvas Logical Dimension if defined
        State.logicalWidth = Number(template.canvasWidth) || 1000;
        State.logicalHeight = Number(template.canvasHeight) || 700;
        applyCanvasDimensions();

        // Load Template Zones & Seats
        State.zones = JSON.parse(JSON.stringify(template.zones));
        State.seats = [];

        for (const z of State.zones) {
          if (Array.isArray(z.seats) && z.seats.length > 0) {
            for (const s of z.seats) {
              State.seats.push({
                id: `seat-${z.id}-${s.label}`,
                zoneId: z.id,
                label: s.label,
                row: s.row || s.label.charAt(0),
                col: s.col || 1,
                x: Number(s.x),
                y: Number(s.y),
                color: s.color || z.color,
                price: s.price !== undefined ? s.price : z.price,
                status: 'AVAILABLE'
              });
            }
          } else {
            regenerateMatrixForZone(z, false);
          }
        }

        // Auto-sync category
        if (template.category) {
          const catSelect = getEl(['event-category']);
          if (catSelect) catSelect.value = template.category;
          State.eventData.category = template.category;
        }

        State.activeZoneId = State.zones[0] ? State.zones[0].id : null;
        State.selectedSeatIds.clear();

        updateSidePanelZones();
        updateSidePanelSelection();
        renderCanvas();
        updateCanvasStats();
        showToast(`Applied preset: ${template.name}`, 'success');
      });
    }
  }

  // -------------------------------------------------------------------------
  // 12. Canvas Hit-Testing & Coordinate Math (Zoom-Aware)
  // -------------------------------------------------------------------------
  function getCanvasCoords(e) {
    const rect = State.canvas.getBoundingClientRect();
    const scaleX = State.canvas.width / Math.max(1, rect.width);
    const scaleY = State.canvas.height / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function getSeatAt(x, y) {
    for (let i = State.seats.length - 1; i >= 0; i--) {
      const s = State.seats[i];
      const cx = s.x + SEAT_RADIUS;
      const cy = s.y + SEAT_RADIUS;
      if (Math.hypot(x - cx, y - cy) <= SEAT_RADIUS) {
        return s;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // 13. Interactive Canvas Events (Click, Drag, Snapping, Panning, Delete)
  // -------------------------------------------------------------------------
  function bindCanvasEvents() {
    if (!State.canvas) return;
    const container = getEl(['seat-canvas-container']);

    State.canvas.addEventListener('mousedown', (e) => {
      // Middle-mouse button or Spacebar + Left click starts 2D viewport pan
      if (e.button === 1 || (e.button === 0 && State.isSpaceDown)) {
        e.preventDefault();
        if (container) {
          State.interaction.mode = 'pan';
          State.interaction.panStart = {
            clientX: e.clientX,
            clientY: e.clientY,
            scrollLeft: container.scrollLeft,
            scrollTop: container.scrollTop
          };
          container.classList.add('is-panning');
        }
        return;
      }

      if (e.button !== 0) return;

      const { x, y } = getCanvasCoords(e);
      const clickedSeat = getSeatAt(x, y);

      if (clickedSeat) {
        // Seat clicked
        if (e.shiftKey) {
          if (State.selectedSeatIds.has(clickedSeat.id)) {
            State.selectedSeatIds.delete(clickedSeat.id);
          } else {
            State.selectedSeatIds.add(clickedSeat.id);
          }
        } else {
          if (!State.selectedSeatIds.has(clickedSeat.id)) {
            State.selectedSeatIds.clear();
            State.selectedSeatIds.add(clickedSeat.id);
          }
        }

        // Prepare drag repositioning if layout is unlocked
        if (!State.isLayoutLocked) {
          State.interaction.mode = 'drag-seat';
          State.interaction.dragStart = { x, y };
          State.interaction.lastMoveX = x;
          State.interaction.lastMoveY = y;
          State.interaction.draggedSeatsOrig.clear();
          State.selectedSeatIds.forEach(id => {
            const s = State.seats.find(st => st.id === id);
            if (s) State.interaction.draggedSeatsOrig.set(id, { x: s.x, y: s.y });
          });
        }
      } else {
        // Empty space clicked: start marquee rubber-band drag (in Custom mode, a stationary click on mouseup places a seat)
        if (!e.shiftKey) State.selectedSeatIds.clear();
        State.interaction.mode = 'marquee';
        State.interaction.marqueeStart = { x, y };
        State.interaction.marqueeCurrent = { x, y };
        State.interaction.canPlaceCustomSeat = (State.builderMode === 'custom' && !State.isLayoutLocked && !e.shiftKey);
      }

      updateSidePanelSelection();
      renderCanvas();
    });

    window.addEventListener('mousemove', (e) => {
      if (!State.canvas) return;

      if (State.interaction.mode === 'pan') {
        if (container) {
          const dx = e.clientX - State.interaction.panStart.clientX;
          const dy = e.clientY - State.interaction.panStart.clientY;
          container.scrollLeft = State.interaction.panStart.scrollLeft - dx;
          container.scrollTop = State.interaction.panStart.scrollTop - dy;
        }
        return;
      }

      const { x, y } = getCanvasCoords(e);

      if (State.interaction.mode === 'drag-seat') {
        State.interaction.lastMoveX = x;
        State.interaction.lastMoveY = y;
        const dx = x - State.interaction.dragStart.x;
        const dy = y - State.interaction.dragStart.y;
        State.selectedSeatIds.forEach(id => {
          const orig = State.interaction.draggedSeatsOrig.get(id);
          const s = State.seats.find(st => st.id === id);
          if (s && orig) {
            s.x = Math.max(0, Math.min(State.canvas.width - SEAT_DIAMETER, orig.x + dx));
            s.y = Math.max(70, Math.min(State.canvas.height - SEAT_DIAMETER, orig.y + dy));
          }
        });
        renderCanvas();
      } else if (State.interaction.mode === 'marquee') {
        State.interaction.marqueeCurrent = { x, y };
        renderCanvas();
      } else {
        // Cursor hover feedback
        if (State.isSpaceDown) {
          State.canvas.style.cursor = 'grab';
        } else {
          const hoverSeat = getSeatAt(x, y);
          State.canvas.style.cursor = hoverSeat ? 'pointer' : (State.builderMode === 'custom' ? 'crosshair' : 'default');
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (State.interaction.mode === 'pan') {
        State.interaction.mode = 'idle';
        if (container && !State.isSpaceDown) {
          container.classList.remove('is-panning');
        }
        return;
      }

      if (State.interaction.mode === 'drag-seat') {
        const dxTotal = Math.abs(State.interaction.dragStart.x - (State.interaction.lastMoveX !== undefined ? State.interaction.lastMoveX : State.interaction.dragStart.x));
        const dyTotal = Math.abs(State.interaction.dragStart.y - (State.interaction.lastMoveY !== undefined ? State.interaction.lastMoveY : State.interaction.dragStart.y));
        const didMove = (dxTotal > 2 || dyTotal > 2);
        // Snap final dragged positions to clean HALF_PITCH (22px) grid for consistent alignment
        State.selectedSeatIds.forEach(id => {
          const s = State.seats.find(st => st.id === id);
          if (s && didMove) {
            s.x = snapToGrid(s.x, HALF_PITCH);
            s.y = Math.max(74, snapToGrid(s.y, HALF_PITCH));
            const z = State.zones.find(zn => zn.id === s.zoneId);
            if (z) z.layout = 'custom';
          }
        });
        if (didMove) {
          const affectedZones = new Set(
            State.seats.filter(s => State.selectedSeatIds.has(s.id)).map(s => s.zoneId)
          );
          affectedZones.forEach(normalizeZoneRows);
        }
        State.interaction.mode = 'idle';
        State.interaction.draggedSeatsOrig.clear();
        renderCanvas();
      } else if (State.interaction.mode === 'marquee') {
        // Calculate intersecting seats
        const box = {
          minX: Math.min(State.interaction.marqueeStart.x, State.interaction.marqueeCurrent.x),
          maxX: Math.max(State.interaction.marqueeStart.x, State.interaction.marqueeCurrent.x),
          minY: Math.min(State.interaction.marqueeStart.y, State.interaction.marqueeCurrent.y),
          maxY: Math.max(State.interaction.marqueeStart.y, State.interaction.marqueeCurrent.y)
        };

        if (box.maxX - box.minX > 4 || box.maxY - box.minY > 4) {
          State.seats.forEach(s => {
            const seatLeft = s.x;
            const seatRight = s.x + SEAT_DIAMETER;
            const seatTop = s.y;
            const seatBottom = s.y + SEAT_DIAMETER;
            // AABB Collision
            if (seatLeft < box.maxX && seatRight > box.minX && seatTop < box.maxY && seatBottom > box.minY) {
              State.selectedSeatIds.add(s.id);
            }
          });
        } else if (State.interaction.canPlaceCustomSeat) {
          const clickX = State.interaction.marqueeStart.x;
          const clickY = State.interaction.marqueeStart.y;
          const snappedX = snapToGrid(clickX - SEAT_RADIUS, HALF_PITCH);
          const snappedY = Math.max(74, snapToGrid(clickY - SEAT_RADIUS, HALF_PITCH));
          let activeZone = State.zones.find(z => z.id === State.activeZoneId) || State.zones[0];
          if (!activeZone) {
            activeZone = {
              id: 'zone-1',
              name: 'Zone 1',
              color: '#1D56CF',
              price: 1000,
              layout: 'custom',
              rows: 1,
              cols: 1,
              originX: snappedX,
              originY: snappedY,
              seats: []
            };
            State.zones.push(activeZone);
            State.activeZoneId = activeZone.id;
          }
          activeZone.layout = 'custom';
          const newLabel = generateNextSeatLabel(activeZone.id);
          const newSeat = {
            id: `seat-${activeZone.id}-${newLabel}-${Date.now()}`,
            zoneId: activeZone.id,
            label: newLabel,
            row: newLabel.charAt(0),
            col: parseInt(newLabel.slice(1), 10) || 1,
            x: Math.max(0, Math.min(State.canvas.width - SEAT_DIAMETER, snappedX)),
            y: Math.max(74, Math.min(State.canvas.height - SEAT_DIAMETER, snappedY)),
            color: activeZone.color || '#1D56CF',
            price: activeZone.price !== undefined ? activeZone.price : 1000,
            status: 'AVAILABLE'
          };
          State.seats.push(newSeat);
          normalizeZoneRows(activeZone.id);
          State.selectedSeatIds.clear();
          State.selectedSeatIds.add(newSeat.id);
          updateSidePanelZones();
          updateCanvasStats();
        }
        State.interaction.canPlaceCustomSeat = false;
        State.interaction.mode = 'idle';
        updateSidePanelSelection();
        renderCanvas();
      }
    });

    // Delete / Backspace Key Handler
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        if (State.isLayoutLocked) return;
        deleteSelectedSeats();
      }
    });

    const deleteSeatBtn = getEl(['delete-seat-btn']);
    if (deleteSeatBtn) {
      deleteSeatBtn.addEventListener('click', () => {
        if (State.isLayoutLocked) return;
        deleteSelectedSeats();
      });
    }
  }

  function deleteSelectedSeats() {
    if (State.selectedSeatIds.size > 0) {
      State.seats = State.seats.filter(s => !State.selectedSeatIds.has(s.id));
      State.selectedSeatIds.clear();
      updateSidePanelSelection();
      updateSidePanelZones();
      renderCanvas();
      updateCanvasStats();
      showToast('Removed selected seats', 'info');
    }
  }

  function generateNextSeatLabel(zoneId) {
    const rows = getZoneRows(zoneId);
    const lastRow = rows[rows.length - 1];
    const letter = lastRow ? lastRow.letter : getNextAvailableRowLetter(rows);
    return `${letter}${lastRow ? lastRow.seats.length + 1 : 1}`;
  }

  function getRowLetter(seat) {
    const explicit = String(seat.row || '').trim().toUpperCase();
    if (/^[A-Z]$/.test(explicit)) return explicit;
    const match = String(seat.label || '').match(/^([A-Za-z])/);
    return match ? match[1].toUpperCase() : '';
  }

  function getNextAvailableRowLetter(rows) {
    const used = new Set(rows.map(row => row.letter).filter(Boolean));
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(letter => !used.has(letter)) || '';
  }

  // Rows are visual groups: seats within half a grid pitch share a Y baseline.
  function getZoneRows(zoneId) {
    const seats = State.seats
      .filter(s => s.zoneId === zoneId)
      .sort((a, b) => Number(a.y) - Number(b.y) || Number(a.x) - Number(b.x));
    const rows = [];

    for (const seat of seats) {
      const row = rows.find(candidate => Math.abs(Number(seat.y) - candidate.y) <= HALF_PITCH);
      if (row) {
        row.seats.push(seat);
        row.y = row.seats.reduce((total, item) => total + Number(item.y), 0) / row.seats.length;
      } else {
        rows.push({ y: Number(seat.y), letter: getRowLetter(seat), seats: [seat] });
      }
    }

    return rows.sort((a, b) => a.y - b.y);
  }

  function normalizeZoneRows(zoneId) {
    const rows = getZoneRows(zoneId);
    const usedLetters = new Set();

    for (const row of rows) {
      let letter = row.letter;
      if (!/^[A-Z]$/.test(letter) || usedLetters.has(letter)) {
        letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(candidate => !usedLetters.has(candidate));
      }
      if (!letter) {
        showToast('A zone cannot contain more than 26 rows.', 'error');
        return false;
      }

      usedLetters.add(letter);
      const alignedY = snapToGrid(row.y, HALF_PITCH);
      row.seats.sort((a, b) => Number(a.x) - Number(b.x)).forEach((seat, index) => {
        seat.row = letter;
        seat.col = index + 1;
        seat.label = `${letter}${index + 1}`;
        seat.y = alignedY;
      });
    }
    return true;
  }

  function getSelectedLogicalRow() {
    const selectedSeats = State.seats.filter(s => State.selectedSeatIds.has(s.id));
    if (selectedSeats.length === 0) return null;
    const zoneId = selectedSeats[0].zoneId;
    if (selectedSeats.some(s => s.zoneId !== zoneId)) return null;
    const row = getZoneRows(zoneId).find(candidate => candidate.seats.some(s => s.id === selectedSeats[0].id));
    return row && selectedSeats.every(s => row.seats.some(candidate => candidate.id === s.id))
      ? { zoneId, row }
      : null;
  }

  function updateRowLabelControl() {
    const input = getEl(['row-label-input']);
    const button = getEl(['apply-row-label-btn']);
    const hint = getEl(['row-label-hint']);
    const selection = !State.isLayoutLocked && getSelectedLogicalRow();
    if (!input || !button) return;

    input.disabled = !selection;
    button.disabled = !selection;
    input.value = selection ? selection.row.letter : '';
    if (hint) {
      hint.textContent = State.isLayoutLocked
        ? 'Row labels are locked because this event has active holds or bookings.'
        : selection
        ? `Renaming row ${selection.row.letter} updates ${selection.row.seats.length} seat(s).`
        : 'Select seats from one row to rename and renumber it.';
    }
  }

  function renameSelectedRow() {
    if (State.isLayoutLocked) return;
    const input = getEl(['row-label-input']);
    const selection = getSelectedLogicalRow();
    const letter = input ? input.value.trim().toUpperCase() : '';
    if (!selection || !/^[A-Z]$/.test(letter)) {
      showToast('Choose one row and enter a single letter from A to Z.', 'error');
      return;
    }

    const selectedRowSeatIds = new Set(selection.row.seats.map(seat => seat.id));
    const hasConflict = getZoneRows(selection.zoneId).some(
      row => row.letter === letter && !row.seats.some(seat => selectedRowSeatIds.has(seat.id))
    );
    if (hasConflict) {
      showToast(`Row ${letter} already exists in this zone.`, 'error');
      return;
    }

    selection.row.seats.forEach(seat => { seat.row = letter; });
    const zone = State.zones.find(z => z.id === selection.zoneId);
    if (zone) zone.layout = 'custom';
    normalizeZoneRows(selection.zoneId);
    updateSidePanelSelection();
    renderCanvas();
    showToast(`Renamed row to ${letter}.`, 'success');
  }

  function updateCanvasStats() {
    const statsEl = getEl(['canvas-total-seats']);
    if (statsEl) statsEl.textContent = State.seats.length;
  }

  // -------------------------------------------------------------------------
  // 14. Side Panel Zone & Pricing Management
  // -------------------------------------------------------------------------
  function updateSidePanelSelection() {
    const countEl = getEl(['selection-count']);
    const infoEl = getEl(['selected-seats-info']);
    const count = State.selectedSeatIds.size;

    if (countEl) countEl.textContent = count;
    if (infoEl && !countEl) infoEl.textContent = `${count} seat${count === 1 ? '' : 's'} selected`;

    if (count > 0) {
      const firstSeat = State.seats.find(s => State.selectedSeatIds.has(s.id));
      if (firstSeat) {
        const priceInput = getEl(['seat-price-input', 'zone-price']);
        if (priceInput) priceInput.value = firstSeat.price;

        const colorInput = getEl(['seat-color-input', 'zone-color']);
        if (colorInput) colorInput.value = firstSeat.color;

        const colorNative = getEl(['seat-color-native']);
        if (colorNative && /^#[0-9a-fA-F]{6}$/.test(firstSeat.color)) {
          colorNative.value = firstSeat.color;
        }

        const swatch = getEl(['color-swatch-preview']);
        if (swatch) swatch.style.backgroundColor = firstSeat.color;

        const zoneSelect = getEl(['zone-select']);
        if (zoneSelect && firstSeat.zoneId) zoneSelect.value = firstSeat.zoneId;
      }
    }
    updateRowLabelControl();
  }

  function updateSidePanelZones() {
    const zoneSelect = getEl(['zone-select']);
    if (zoneSelect) {
      zoneSelect.innerHTML = State.zones
        .map(z => `<option value="${z.id}">${z.name} (${z.price} THB)</option>`)
        .concat(['<option value="__new__">+ Create New Zone</option>'])
        .join('');
      if (State.activeZoneId) zoneSelect.value = State.activeZoneId;
    }

    renderZonesTable();
  }

  function renderZonesTable() {
    const tbody = getEl(['zones-table-body']);
    const countSpan = getEl(['total-zones-count']);
    if (countSpan) countSpan.textContent = `${State.zones.length} zone${State.zones.length === 1 ? '' : 's'}`;

    if (!tbody) return;
    if (State.zones.length === 0) {
      tbody.innerHTML = '<tr><td class="tc p-16 c-text-light" colspan="4">No zones defined yet.</td></tr>';
      return;
    }

    tbody.innerHTML = State.zones.map(z => {
      const seatCount = State.seats.filter(s => s.zoneId === z.id).length;
      return `
        <tr>
          <td>
            <span class="zone-dot" style="--zone-color: ${z.color};"></span>
            <strong>${z.name}</strong>
          </td>
          <td>${z.price.toLocaleString()} THB</td>
          <td>${seatCount}</td>
          <td>
            <button type="button" class="btn-link-action" onclick="window.AdminEventEngine.selectZoneSeats('${z.id}')" title="Select all seats in this zone">Select</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function bindSidePanelEvents() {
    // Toggle New Zone Box
    const toggleNewZoneBtn = getEl(['toggle-new-zone-btn']);
    const newZoneBox = getEl(['new-zone-box']);
    const newZoneNameInput = getEl(['new-zone-name']);
    const createZoneConfirmBtn = getEl(['create-zone-confirm-btn']);
    const applyRowLabelBtn = getEl(['apply-row-label-btn']);
    const rowLabelInput = getEl(['row-label-input']);

    if (applyRowLabelBtn) applyRowLabelBtn.addEventListener('click', renameSelectedRow);
    if (rowLabelInput) {
      rowLabelInput.addEventListener('input', () => {
        rowLabelInput.value = rowLabelInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
      });
      rowLabelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          renameSelectedRow();
        }
      });
    }

    function createNewZoneFromInputs() {
      const colorInput = getEl(['seat-color-input', 'zone-color']);
      const priceInput = getEl(['seat-price-input', 'zone-price']);
      const rawColor = (colorInput ? colorInput.value : '#1D56CF').trim();
      const newColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : '#1D56CF';
      const newPrice = priceInput ? Math.max(0, Number(priceInput.value)) : 1000;
      const zoneName = (newZoneNameInput && newZoneNameInput.value.trim()) || `Zone ${State.zones.length + 1}`;
      const newZoneId = `zone-${Date.now()}`;

      const defaultCols = parseInt((getEl(['matrix-cols']) || { value: 10 }).value, 10) || 10;
      const maxExistingY = State.seats.reduce((max, s) => Math.max(max, Number(s.y) || 0), 30);
      const nextOriginY = snapToGrid(Math.min(State.logicalHeight - 120, maxExistingY + 66), HALF_PITCH);
      const nextOriginX = getCenteredOriginX(defaultCols, State.logicalWidth);

      const newZone = {
        id: newZoneId,
        name: zoneName,
        color: newColor,
        price: newPrice,
        layout: State.builderMode === 'matrix' ? 'matrix' : 'custom',
        rows: 4,
        cols: defaultCols,
        originX: nextOriginX,
        originY: nextOriginY,
        seats: []
      };

      State.zones.push(newZone);
      State.activeZoneId = newZoneId;

      if (newZoneNameInput) newZoneNameInput.value = '';
      if (newZoneBox) newZoneBox.style.display = 'none';
      if (toggleNewZoneBtn) toggleNewZoneBtn.textContent = '+ New Zone';

      const originXEl = getEl(['matrix-origin-x']);
      if (originXEl) originXEl.value = nextOriginX;
      const originYEl = getEl(['matrix-origin-y']);
      if (originYEl) originYEl.value = nextOriginY;

      updateSidePanelZones();
      showToast(`Created zone "${zoneName}"`, 'success');
      return newZone;
    }

    if (toggleNewZoneBtn && newZoneBox) {
      toggleNewZoneBtn.addEventListener('click', () => {
        const isHidden = newZoneBox.style.display === 'none' || (window.getComputedStyle && window.getComputedStyle(newZoneBox).display === 'none');
        newZoneBox.style.display = isHidden ? 'block' : 'none';
        toggleNewZoneBtn.textContent = isHidden ? 'Cancel' : '+ New Zone';
        if (isHidden && newZoneNameInput) newZoneNameInput.focus();
      });
    }

    if (createZoneConfirmBtn) {
      createZoneConfirmBtn.addEventListener('click', () => {
        const created = createNewZoneFromInputs();
        if (created && State.selectedSeatIds.size > 0) {
          State.selectedSeatIds.forEach(id => {
            const s = State.seats.find(st => st.id === id);
            if (s) {
              s.zoneId = created.id;
              s.price = created.price;
              s.color = created.color;
            }
          });
          renderZonesTable();
          renderCanvas();
        }
      });
    }

    // Zone Select Change
    const zoneSelect = getEl(['zone-select']);
    if (zoneSelect) {
      zoneSelect.addEventListener('change', () => {
        if (zoneSelect.value === '__new__') {
          if (newZoneBox) newZoneBox.style.display = 'block';
          if (toggleNewZoneBtn) toggleNewZoneBtn.textContent = 'Cancel';
          if (newZoneNameInput) newZoneNameInput.focus();
        } else {
          State.activeZoneId = zoneSelect.value;
          const targetZone = State.zones.find(z => z.id === State.activeZoneId);
          if (targetZone) {
            const priceInput = getEl(['seat-price-input', 'zone-price']);
            if (priceInput) priceInput.value = targetZone.price;

            const colorInput = getEl(['seat-color-input', 'zone-color']);
            if (colorInput) colorInput.value = targetZone.color;

            const colorNative = getEl(['seat-color-native']);
            if (colorNative && /^#[0-9a-fA-F]{6}$/.test(targetZone.color)) colorNative.value = targetZone.color;

            const swatch = getEl(['color-swatch-preview']);
            if (swatch) swatch.style.backgroundColor = targetZone.color;
          }
        }
      });
    }

    // Native Color Picker Sync
    const colorNative = getEl(['seat-color-native']);
    const colorInput = getEl(['seat-color-input', 'zone-color']);
    const swatch = getEl(['color-swatch-preview']);

    if (colorNative && colorInput) {
      colorNative.addEventListener('input', (e) => {
        colorInput.value = e.target.value.toUpperCase();
        if (swatch) swatch.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
          colorNative.value = val;
          if (swatch) swatch.style.backgroundColor = val;
        }
      });
    }

    // Apply Zone / Pricing to Selection (or active zone if no seats selected)
    const applyBtn = getEl(['apply-zone-btn', 'apply-pricing-btn']);
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const priceInput = getEl(['seat-price-input', 'zone-price']);
        const newPrice = priceInput ? Math.max(0, Number(priceInput.value)) : 1000;

        let newColor = (colorInput ? colorInput.value : '#1D56CF').trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(newColor)) {
          showToast('Invalid color hex format. Expected #RRGGBB (e.g. #1D56CF)', 'error');
          return;
        }

        let targetZoneId = zoneSelect ? zoneSelect.value : State.activeZoneId;

        // Check for new zone creation
        const isNewZoneBoxVisible = newZoneBox && newZoneBox.style.display !== 'none' && (window.getComputedStyle ? window.getComputedStyle(newZoneBox).display !== 'none' : true);
        if (targetZoneId === '__new__' || (newZoneNameInput && newZoneNameInput.value.trim() && isNewZoneBoxVisible)) {
          const created = createNewZoneFromInputs();
          targetZoneId = created.id;
        }

        const targetZone = State.zones.find(z => z.id === targetZoneId);
        if (targetZone) {
          targetZone.price = newPrice;
          targetZone.color = newColor;
        }

        if (State.selectedSeatIds.size === 0) {
          // If no individual seats are selected, update all AVAILABLE seats in the active zone
          if (targetZone) {
            let count = 0;
            State.seats.forEach(s => {
              if (s.zoneId === targetZone.id && s.status === 'AVAILABLE') {
                s.price = newPrice;
                s.color = newColor;
                count++;
              }
            });
            updateSidePanelZones();
            renderCanvas();
            showToast(`Updated zone "${targetZone.name}" (${count} available seats)`, 'success');
          } else {
            showToast('Please select seats or choose a zone to apply pricing', 'info');
          }
          return;
        }

        // Apply to all selected seats
        State.selectedSeatIds.forEach(id => {
          const s = State.seats.find(st => st.id === id);
          if (s) {
            if (!State.isLayoutLocked) {
              s.zoneId = targetZoneId;
            }
            if (s.status === 'AVAILABLE' || !State.isLayoutLocked) {
              s.price = newPrice;
              s.color = newColor;
            }
          }
        });

        updateSidePanelZones();
        renderCanvas();
        showToast(`Updated ${State.selectedSeatIds.size} seat(s)`, 'success');
      });
    }

    // Clear Selection
    const clearSelectionBtn = getEl(['clear-selection-btn']);
    if (clearSelectionBtn) {
      clearSelectionBtn.addEventListener('click', () => {
        State.selectedSeatIds.clear();
        updateSidePanelSelection();
        renderCanvas();
      });
    }
  }

  // -------------------------------------------------------------------------
  // 15. Canvas Rendering Pipeline (AGENTS.md Compliance & Symmetric Guides)
  // -------------------------------------------------------------------------
  function renderCanvas() {
    const ctx = State.ctx;
    if (!ctx || !State.canvas) return;

    const W = State.canvas.width;
    const H = State.canvas.height;

    // Clear Canvas
    ctx.clearRect(0, 0, W, H);

    // 15.1 Draw Subtle Alignment Grid (44px major pitch, 22px minor pitch)
    ctx.strokeStyle = '#F3F4F6';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += GRID_PITCH) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += GRID_PITCH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // 15.2 Draw Subtle Center Symmetry Axis Line
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(29, 86, 207, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 56);
    ctx.lineTo(W / 2, H - 16);
    ctx.stroke();
    ctx.restore();

    // 15.3 Draw Stage Banner (Centered at top of canvas)
    const stageWidth = Math.min(480, W - 80);
    const stageX = (W - stageWidth) / 2;
    ctx.fillStyle = '#1D56CF';
    roundRect(ctx, stageX, 16, stageWidth, 38, 8);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 13px Lato, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STAGE / SCREEN / PODIUM', W / 2, 35);

    // 15.4 Draw Row Guide Labels on Left & Right of Each Zone's Rows
    ctx.save();
    ctx.font = '800 11px Lato, sans-serif';
    ctx.fillStyle = '#6B7280';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const z of State.zones) {
      const zoneRows = getZoneRows(z.id);
      for (const row of zoneRows) {
        if (!row.seats.length || !row.letter) continue;
        const minX = Math.min(...row.seats.map(s => Number(s.x)));
        const maxX = Math.max(...row.seats.map(s => Number(s.x) + SEAT_DIAMETER));
        const rowCenterY = row.seats[0].y + SEAT_RADIUS;
        if (minX > 24) {
          ctx.fillText(row.letter, minX - 16, rowCenterY);
        }
        if (maxX < W - 24) {
          ctx.fillText(row.letter, maxX + 16, rowCenterY);
        }
      }
    }
    ctx.restore();

    // 15.5 Render Seats
    for (const seat of State.seats) {
      const cx = seat.x + SEAT_RADIUS;
      const cy = seat.y + SEAT_RADIUS;
      const isSelected = State.selectedSeatIds.has(seat.id);
      const isBookedOrHeld = seat.status === 'BOOKED' || seat.status === 'HELD';
      const effectiveColor = seat.color || '#1D56CF';

      // Outer Accent Ring (F-17 & AGENTS.md Invariant)
      ctx.beginPath();
      ctx.arc(cx, cy, SEAT_RADIUS + 3, 0, Math.PI * 2);
      ctx.strokeStyle = effectiveColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Seat Circle Core
      ctx.beginPath();
      ctx.arc(cx, cy, SEAT_RADIUS, 0, Math.PI * 2);

      if (isSelected) {
        // UI-06: Selected seat: Monday Blue circle (#1D56CF) with white border & white check mark ✓
        ctx.fillStyle = '#1D56CF';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 16px Lato, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', cx, cy + 1);
      } else if (isBookedOrHeld) {
        // UI-05: Booked / held seat: Grey background (#D1D5DB) with red cross mark ✕ (#DC2626)
        ctx.fillStyle = '#D1D5DB';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#9CA3AF';
        ctx.stroke();

        ctx.fillStyle = '#DC2626';
        ctx.font = '900 16px Lato, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', cx, cy);
      } else {
        // UI-04: Available seat: Black circle (#000000) with white border & seat number label
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 11px Lato, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(seat.label, cx, cy);
      }
    }

    // 15.6 Render Marquee Selection Box
    if (State.interaction.mode === 'marquee') {
      const sx = State.interaction.marqueeStart.x;
      const sy = State.interaction.marqueeStart.y;
      const cx = State.interaction.marqueeCurrent.x;
      const cy = State.interaction.marqueeCurrent.y;

      const left = Math.min(sx, cx);
      const top = Math.min(sy, cy);
      const width = Math.abs(cx - sx);
      const height = Math.abs(cy - sy);

      ctx.save();
      ctx.fillStyle = 'rgba(29, 86, 207, 0.15)';
      ctx.fillRect(left, top, width, height);

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#1D56CF';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(left, top, width, height);
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // -------------------------------------------------------------------------
  // 16. Dynamic Rounds Management
  // -------------------------------------------------------------------------
  function bindRoundsControls() {
    const addRoundBtn = getEl(['add-round-btn']);
    if (addRoundBtn) {
      addRoundBtn.addEventListener('click', () => {
        const count = State.eventData.rounds.length + 1;
        const now = new Date();
        const nextDate = new Date(now.getTime() + (14 + count) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        State.eventData.rounds.push({
          id: `rnd-${Date.now()}`,
          date: nextDate,
          time: '19:00',
          label: `Round ${count}`
        });
        renderRoundsList();
      });
    }
  }

  function renderRoundsList() {
    const container = getEl(['rounds-list']);
    if (!container) return;

    if (!State.eventData.rounds || State.eventData.rounds.length === 0) {
      const defaultDate = new Date().toISOString().split('T')[0];
      State.eventData.rounds = [{ id: 'rnd-1', date: defaultDate, time: '19:00', label: 'Round 1' }];
    }

    container.innerHTML = State.eventData.rounds.map((r, idx) => `
      <div class="round-card-item" data-index="${idx}">
        ${State.eventData.rounds.length > 1 ? `
          <button type="button" class="round-card-remove-btn" onclick="window.AdminEventEngine.removeRound(${idx})" title="Remove round">
            <i class="fa-solid fa-trash"></i>
          </button>
        ` : ''}
        <div class="fw-7 fs-085 c-blue mb-4">
          Round ${idx + 1}
        </div>
        <div class="round-card-row">
          <div>
            <label class="form-label fs-075">Date</label>
            <input type="date" class="form-control round-date-input" value="${r.date || ''}" onchange="window.AdminEventEngine.updateRound(${idx}, 'date', this.value)">
          </div>
          <div>
            <label class="form-label fs-075">Time</label>
            <input type="time" class="form-control round-time-input" value="${r.time || '19:00'}" onchange="window.AdminEventEngine.updateRound(${idx}, 'time', this.value)">
          </div>
        </div>
      </div>
    `).join('');

    // Sync first round with hidden inputs for backward compatibility
    const first = State.eventData.rounds[0];
    if (first) {
      const dateEl = getEl(['event-date']);
      if (dateEl) dateEl.value = first.date || '';
      const timeEl = getEl(['event-time', 'event-show-time']);
      if (timeEl) timeEl.value = first.time || '19:00';
    }
  }

  // -------------------------------------------------------------------------
  // 17. Delete Event Modal Logic (FR-15)
  // -------------------------------------------------------------------------
  function bindDeleteModalEvents() {
    const deleteBtn = getEl(['delete-event-btn']);
    const modal = getEl(['delete-modal']);
    const closeBtn = getEl(['close-delete-modal']);
    const cancelBtn = getEl(['cancel-delete-btn']);
    const confirmBtn = getEl(['confirm-delete-btn']);
    const targetTitleEl = getEl(['delete-target-title']);
    const confirmInput = getEl(['delete-event-title-confirm']);
    const passwordInput = getEl(['delete-admin-password']);
    const errorEl = getEl(['delete-modal-error']);

    if (deleteBtn && modal) {
      deleteBtn.addEventListener('click', () => {
        if (!State.eventId) return;
        const currentTitle = State.eventData.title || '';
        if (targetTitleEl) targetTitleEl.textContent = `"${currentTitle}"`;
        if (confirmInput) confirmInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
        if (confirmBtn) confirmBtn.disabled = true;
        modal.style.display = 'flex';
      });
    }

    function checkDeleteEligibility() {
      if (!confirmBtn || !confirmInput || !passwordInput) return;
      const titleMatches = confirmInput.value.trim() === (State.eventData.title || '').trim();
      const hasPassword = passwordInput.value.length > 0;
      confirmBtn.disabled = !(titleMatches && hasPassword);
    }

    if (confirmInput) confirmInput.addEventListener('input', checkDeleteEligibility);
    if (passwordInput) passwordInput.addEventListener('input', checkDeleteEligibility);

    function closeModal() {
      if (modal) modal.style.display = 'none';
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const password = passwordInput ? passwordInput.value : '';
        if (!password) return;

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';

        try {
          if (window.API && API.events && typeof API.events.delete === 'function') {
            await API.events.delete(State.eventId, password);
          } else {
            const token = window.Auth && Auth.getToken ? Auth.getToken() : localStorage.getItem('token');
            const res = await fetch(`/api/events/${State.eventId}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (!res.ok) {
              const err = new Error(data.error || 'Delete failed');
              err.status = res.status;
              err.data = data;
              throw err;
            }
          }

          showToast('Event deleted and bookings auto-refunded successfully', 'success');
          closeModal();
          setTimeout(() => {
            window.location.href = '/admin';
          }, 1200);
        } catch (err) {
          if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = err.data && err.data.error ? err.data.error : err.message;
          }
          showToast('Failed to delete event: ' + err.message, 'error');
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Permanently Delete';
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // 18. Form Payload Serialization & Submission Pipeline
  // -------------------------------------------------------------------------
  function bindFormEvents() {
    const form = getEl(['event-form']);
    const headerSaveBtn = getEl(['header-save-btn']);

    if (headerSaveBtn && form) {
      headerSaveBtn.addEventListener('click', () => {
        form.requestSubmit();
      });
    }

    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = (getEl(['event-title']) || {}).value.trim();
      const category = (getEl(['event-category']) || {}).value || 'Concert';
      const venue = (getEl(['event-venue']) || {}).value.trim();
      const artist = ((getEl(['event-artist']) || {}).value || '').trim();
      const organizer = ((getEl(['event-organizer']) || {}).value || '').trim();
      const status = (getEl(['event-status']) || {}).value || 'On Sale';
      const description = ((getEl(['event-description']) || {}).value || '').trim();
      const posterUrl = ((getEl(['event-poster-url', 'event-poster']) || {}).value || '').trim();
      const galleryVal = ((getEl(['event-gallery']) || {}).value || '').trim();
      const galleryUrls = galleryVal ? galleryVal.split(',').map(s => s.trim()).filter(Boolean) : [];
      const isFeatured = !!(getEl(['event-featured']) || {}).checked;

      const saleStartDate = (getEl(['event-sale-start']) || {}).value || null;
      const saleEndDate = (getEl(['event-sale-end']) || {}).value || null;
      const gateOpenTime = ((getEl(['event-gate-time']) || {}).value || '').trim() || '17:30';

      const dateVal = (getEl(['event-date']) || {}).value;
      const timeVal = (getEl(['event-time', 'event-show-time']) || {}).value || '19:00';

      // Basic Client Validations
      if (!title) {
        showToast('Event title is required', 'error');
        return;
      }
      if (!venue) {
        showToast('Venue is required', 'error');
        return;
      }
      if (!['Concert', 'Seminar'].includes(category)) {
        showToast('Category must be Concert or Seminar', 'error');
        return;
      }

      // Assemble Rounds Payload
      let rounds = State.eventData.rounds && State.eventData.rounds.length > 0
        ? State.eventData.rounds
        : [{ id: 'rnd-1', date: dateVal || new Date().toISOString().split('T')[0], time: timeVal, label: 'Round 1' }];

      for (const r of rounds) {
        if (!r.date) {
          showToast('All rounds must have a valid date', 'error');
          return;
        }
      }

      // Assemble Zones Payload
      const origZones = (State.eventData && Array.isArray(State.eventData.zones)) ? State.eventData.zones : [];
      const zonesPayload = State.zones.map(z => {
        const origZ = origZones.find(oz => oz && ((z.id && oz.id === z.id) || (z.name && oz.name === z.name)));
        if (State.isLayoutLocked && origZ) {
          // Preserve exact structural fields when layout is locked so non-structural updates (price/color/name) succeed
          const lockedZone = {
            ...origZ,
            id: origZ.id,
            name: z.name || origZ.name,
            color: z.color || origZ.color || '#1D56CF',
            price: Number(z.price !== undefined ? z.price : origZ.price)
          };
          if (Array.isArray(origZ.seats) && origZ.seats.length > 0) {
            const zoneSeats = State.seats.filter(s => s.zoneId === z.id);
            lockedZone.seats = origZ.seats.map(os => {
              const matchSeat = zoneSeats.find(s => s.label === (os.label || os.seatNumber));
              return {
                ...os,
                color: matchSeat ? (matchSeat.color || z.color) : (os.color || z.color),
                price: matchSeat ? Number(matchSeat.price) : Number(z.price)
              };
            });
          }
          return lockedZone;
        }

        const zoneSeats = State.seats.filter(s => s.zoneId === z.id);
        const isMatrixMode = z.layout === 'matrix' && (!Array.isArray(z.seats) || z.seats.length === 0);

        return {
          id: z.id,
          name: z.name,
          color: z.color || '#1D56CF',
          price: Number(z.price !== undefined ? z.price : 1000),
          layout: isMatrixMode ? 'matrix' : (z.layout || (zoneSeats.length > 0 ? 'custom' : 'matrix')),
          rows: Number(z.rows || 4),
          cols: Number(z.cols || 8),
          originX: Number(z.originX !== undefined ? z.originX : getCenteredOriginX(z.cols || 8, State.logicalWidth)),
          originY: Number(z.originY !== undefined ? z.originY : 96),
          seats: isMatrixMode ? [] : zoneSeats.map(s => ({
            label: s.label,
            x: Number(s.x),
            y: Number(s.y),
            color: s.color || z.color,
            price: Number(s.price !== undefined ? s.price : z.price)
          }))
        };
      });

      if (zonesPayload.length === 0) {
        showToast('At least one zone is required', 'error');
        return;
      }

      // Validate capacity cap
      for (const z of zonesPayload) {
        const count = z.seats.length > 0 ? z.seats.length : (z.rows * z.cols);
        if (count > 2000) {
          showToast(`Zone "${z.name}" exceeds maximum 2000 seats capacity limit`, 'error');
          return;
        }
      }

      const payload = {
        title,
        category,
        venue,
        artist,
        organizer,
        status,
        description,
        posterUrl,
        galleryUrls,
        isFeatured,
        gateOpenTime,
        showTime: timeVal,
        saleStartDate,
        saleEndDate,
        rounds,
        zones: zonesPayload
      };

      const saveBtn = getEl(['save-event-btn']);
      const headerBtn = getEl(['header-save-btn']);
      if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }
      if (headerBtn) { headerBtn.disabled = true; }

      try {
        if (State.mode === 'create') {
          if (window.API && API.events && typeof API.events.create === 'function') {
            await API.events.create(payload);
          } else {
            const token = window.Auth && Auth.getToken ? Auth.getToken() : localStorage.getItem('token');
            const res = await fetch('/api/events', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) {
              const err = new Error(data.error || 'Create event failed');
              err.status = res.status;
              err.data = data;
              throw err;
            }
          }
          showToast('Event created successfully!', 'success');
        } else {
          if (window.API && API.events && typeof API.events.update === 'function') {
            await API.events.update(State.eventId, payload);
          } else {
            const token = window.Auth && Auth.getToken ? Auth.getToken() : localStorage.getItem('token');
            const res = await fetch(`/api/events/${State.eventId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) {
              const err = new Error(data.error || 'Update event failed');
              err.status = res.status;
              err.data = data;
              throw err;
            }
          }
          showToast('Event updated successfully!', 'success');
        }

        setTimeout(() => {
          window.location.href = '/admin';
        }, 1200);
      } catch (err) {
        if (err.status === 409 || (err.data && err.data.code === 'LAYOUT_LOCKED')) {
          setLockBanner(true);
          disableLayoutControls();
          showToast('Seating layout is locked because active bookings or holds exist.', 'error');
        } else {
          showToast('Save failed: ' + (err.data && err.data.error ? err.data.error : err.message), 'error');
        }
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Event'; }
        if (headerBtn) { headerBtn.disabled = false; }
      }
    });
  }

  // -------------------------------------------------------------------------
  // 19. Public Engine API Export (Testing & Extension)
  // -------------------------------------------------------------------------
  window.AdminEventEngine = {
    State,
    renderCanvas,
    setBuilderMode,
    setZoom,
    fitCanvasToViewport,
    alignAndCenterSeats,
    normalizeZoneRows,
    renameSelectedRow,
    selectZoneSeats: (zoneId) => {
      State.selectedSeatIds.clear();
      State.seats.filter(s => s.zoneId === zoneId).forEach(s => State.selectedSeatIds.add(s.id));
      State.activeZoneId = zoneId;
      updateSidePanelSelection();
      renderCanvas();
    },
    removeRound: (idx) => {
      if (State.eventData.rounds.length > 1) {
        State.eventData.rounds.splice(idx, 1);
        renderRoundsList();
      }
    },
    updateRound: (idx, field, val) => {
      if (State.eventData.rounds[idx]) {
        State.eventData.rounds[idx][field] = val;
      }
    }
  };

})();
