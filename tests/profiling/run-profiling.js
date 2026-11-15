const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-profile-'));
process.env.DATA_DIR = tmpDataDir;
process.env.NODE_ENV = 'test';

const {
  store,
  UserModel,
  EventModel,
  CategoryModel,
  SeatModel,
  BookingModel,
  PaymentModel,
  TicketModel,
  PromotionModel,
  NotificationModel,
  SupportModel
} = require('../../src/models');
const { generateSeedData } = require('../../src/store/seed');

const ROOT = path.resolve(__dirname, '../..');
const TARGET_FILES = [
  'src/models/user.model.js',
  'src/models/event.model.js',
  'src/models/category.model.js',
  'src/models/seat.model.js',
  'src/models/booking.model.js',
  'src/models/payment.model.js',
  'src/models/ticket.model.js',
  'src/models/promotion.model.js',
  'src/models/notification.model.js',
  'src/models/support.model.js',
  'src/store/jsonStore.js'
];

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

function computeStaticMetrics(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sloc = noComments.split(/\r?\n/).filter((line) => line.trim().length > 0).length;

  const fnMatches = noComments.match(/\b(?:static\s+)?(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^;]*\)\s*\{/g) || [];
  const functions = fnMatches.filter((m) => !/^(if|for|while|switch|catch)\s*\(/.test(m.trim())).length;

  const clean = stripCommentsAndStrings(src);
  // Count decision points (if, while, for, case, catch, ternary ?, &&, ||)
  const branchKeywords = clean.match(/\b(?:if|for|while|case|catch)\b/g) || [];
  const branchOps = clean.match(/&&|\|\||\?(?!\.)/g) || [];
  const cyclomatic = 1 + branchKeywords.length + branchOps.length;

  // Halstead Volume V = N * log2(n) and Estimated Errors B = V / 3000
  const opMatches = clean.match(/===|!==|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|[+\-*/%<>=!&|^~?:;,.{}()[\]]|\b(?:const|let|var|return|if|else|for|while|switch|case|break|new|typeof|throw|try|catch|async|await|class|static|of|in)\b/g) || [];
  const idMatches = clean.match(/\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b/g) || [];
  const N = opMatches.length + idMatches.length;
  const n = new Set(opMatches).size + new Set(idMatches).size;
  const halsteadVolume = N > 0 && n > 1 ? N * Math.log2(n) : 1;
  const estimatedErrors = halsteadVolume / 3000;
  const mi = Math.max(
    0,
    Math.min(100, ((171 - 5.2 * Math.log(halsteadVolume) - 0.23 * cyclomatic - 16.2 * Math.log(Math.max(1, sloc))) * 100) / 171)
  );

  return {
    file: relPath,
    sloc,
    functions,
    cyclomatic,
    halsteadVolume: Number(halsteadVolume.toFixed(1)),
    estimatedErrors: Number(estimatedErrors.toFixed(3)),
    maintainabilityIndex: Number(mi.toFixed(2))
  };
}

function createStructuralProfiler() {
  const stats = new Map();
  const stack = [];
  const traceStart = performance.now();

  function recordCompletion(frame) {
    const exit = performance.now() - traceStart;
    const inclusive = Math.max(0, exit - frame.entry);
    const exclusive = Math.max(0, inclusive - frame.childTime);

    stack.pop();
    if (stack.length > 0) {
      stack[stack.length - 1].childTime += inclusive;
    }

    const prev = stats.get(frame.name) || {
      name: frame.name,
      calls: 0,
      firstEntry: frame.entry,
      lastExit: exit,
      inclusiveMs: 0,
      exclusiveMs: 0
    };
    prev.calls += 1;
    prev.lastExit = exit;
    prev.inclusiveMs += inclusive;
    prev.exclusiveMs += exclusive;
    stats.set(frame.name, prev);
  }

  function wrapFn(name, fn, ctx) {
    return function (...args) {
      const frame = { name, entry: performance.now() - traceStart, childTime: 0 };
      stack.push(frame);
      try {
        const result = fn.apply(ctx || this, args);
        if (result && typeof result.then === 'function') {
          return result.finally(() => recordCompletion(frame));
        }
        recordCompletion(frame);
        return result;
      } catch (err) {
        recordCompletion(frame);
        throw err;
      }
    };
  }

  function instrumentClass(className, cls) {
    for (const key of Object.getOwnPropertyNames(cls)) {
      if (['length', 'name', 'prototype'].includes(key)) continue;
      const desc = Object.getOwnPropertyDescriptor(cls, key);
      if (desc && typeof desc.value === 'function') {
        cls[key] = wrapFn(`${className}.${key}`, desc.value, null);
      }
    }
  }

  function instrumentInstance(instanceName, obj) {
    const proto = Object.getPrototypeOf(obj);
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor' || typeof obj[key] !== 'function') continue;
      obj[key] = wrapFn(`${instanceName}.${key}`, obj[key], obj);
    }
  }

  return { instrumentClass, instrumentInstance, getStats: () => Array.from(stats.values()) };
}

async function runWorkload() {
  store.resetWithSeed(generateSeedData);

  // User operations
  const user = UserModel.findByEmail('user@ticket.com');
  UserModel.findById(user.id);
  UserModel.getRoleCounts();
  UserModel.filterUsers({ role: 'customer', search: 'Chanita' });
  UserModel.toggleBookmark(user.id, 'evt-2');
  UserModel.toggleBookmark(user.id, 'evt-2');

  // Category & Event queries
  CategoryModel.findAll();
  CategoryModel.create('Comedy');
  EventModel.findAll({ search: 'Forza', province: 'Nonthaburi', sort: 'price_asc' });
  const createdEvt = EventModel.create({
    title: 'Profiling Concert',
    category: 'Concert',
    venue: 'Arena',
    rounds: [{ id: 'rnd-p1', date: '2026-12-15', time: '19:00' }],
    zones: [{ id: 'z-p1', name: 'VIP', price: 3000, rows: 2, cols: 4 }]
  });
  const seats = SeatModel.generateForEvent(createdEvt);

  // Seat hold, booking, payment, QR ticket issue, check-in, cancel
  const targetSeats = seats.slice(0, 2);
  const expiresAt = new Date(Date.now() + BookingModel.HOLD_DURATION_MS).toISOString();
  SeatModel.holdSeats(targetSeats, user.id, 'bkg-prof-1', expiresAt);
  const bkg = BookingModel.createPending({
    bookingId: 'bkg-prof-1',
    user,
    event: createdEvt,
    roundId: 'rnd-p1',
    targetSeats,
    holdExpiresAt: expiresAt
  });
  PromotionModel.findActiveByCode('TICKETHUB10');
  SeatModel.markBooked(targetSeats.map((s) => s.id));
  BookingModel.update(bkg.id, { status: 'PAID' });
  PaymentModel.create({ bookingId: bkg.id, userId: user.id, method: 'PROMPTPAY', amount: bkg.totalAmount });
  const tickets = await TicketModel.issueForBooking(bkg, targetSeats, ['Holder 1', 'Holder 2']);
  TicketModel.findByLookupCode(tickets[0].ticketCode);
  TicketModel.checkIn(tickets[0].id, 'Staff Gate');
  TicketModel.cancelByBookingId(bkg.id);
  PaymentModel.markRefunded(bkg.id, bkg.subtotal, 'TEST_PROFILE');
  SeatModel.releaseSeats(targetSeats.map((s) => s.id));
  SeatModel.expireHeldSeats();
  SeatModel.getZoneSeatAvailability(createdEvt.id, 'rnd-p1');
  SeatModel.getEventSeatSummary(createdEvt.id);
  SeatModel.removeByEvent(createdEvt.id);
  EventModel.remove(createdEvt.id);

  // Notifications & Support & Store backup
  const ntf = NotificationModel.create({ userId: user.id, type: 'INFO', subject: 'Hi', message: 'Test' });
  NotificationModel.markAsRead(ntf.id);
  const sup = SupportModel.create({ user, subject: 'Help', message: 'Testing support' });
  SupportModel.resolve(sup.id, 'Done');
  const bkp = store.createBackup('prof');
  store.restoreBackup(bkp.backupId);
}

async function main() {
  try {
    const staticRows = TARGET_FILES.map(computeStaticMetrics);

    const profiler = createStructuralProfiler();
    profiler.instrumentInstance('JsonStore', store);
    profiler.instrumentClass('UserModel', UserModel);
    profiler.instrumentClass('EventModel', EventModel);
    profiler.instrumentClass('CategoryModel', CategoryModel);
    profiler.instrumentClass('SeatModel', SeatModel);
    profiler.instrumentClass('BookingModel', BookingModel);
    profiler.instrumentClass('PaymentModel', PaymentModel);
    profiler.instrumentClass('TicketModel', TicketModel);
    profiler.instrumentClass('PromotionModel', PromotionModel);
    profiler.instrumentClass('NotificationModel', NotificationModel);
    profiler.instrumentClass('SupportModel', SupportModel);

    await runWorkload();

    const dynamicRows = profiler
      .getStats()
      .sort((a, b) => b.inclusiveMs - a.inclusiveMs)
      .slice(0, 30);

    // Self-checks (assert invariants on measured metrics)
    assert.equal(staticRows.length, TARGET_FILES.length);
    for (const s of staticRows) {
      assert.ok(s.sloc > 0 && s.cyclomatic >= 1 && s.maintainabilityIndex >= 0 && s.maintainabilityIndex <= 100);
    }
    assert.ok(dynamicRows.length >= 20);
    for (const d of dynamicRows) {
      assert.ok(d.calls >= 1 && d.inclusiveMs >= d.exclusiveMs && d.exclusiveMs >= 0);
    }

    console.log('\n=== STATIC PROFILING REPORT (src/models & src/store/jsonStore.js) ===');
    console.log('| File | SLOC | Functions | Cyclomatic V(G) | Halstead Vol | Est. Errors (B) | Maintainability Index |');
    console.log('|---|---:|---:|---:|---:|---:|---:|');
    for (const r of staticRows) {
      console.log(`| ${r.file} | ${r.sloc} | ${r.functions} | ${r.cyclomatic} | ${r.halsteadVolume} | ${r.estimatedErrors} | ${r.maintainabilityIndex} |`);
    }

    console.log('\n=== DYNAMIC PROFILING REPORT (Structural / Instrumenting Method - Top 30 Functions) ===');
    console.log('| Function / Method | Call Count | First Entry (ms) | Last Exit (ms) | Inclusive Runtime (ms) | Exclusive Runtime (ms) |');
    console.log('|---|---:|---:|---:|---:|---:|');
    for (const d of dynamicRows) {
      console.log(
        `| ${d.name} | ${d.calls} | ${d.firstEntry.toFixed(3)} | ${d.lastExit.toFixed(3)} | ${d.inclusiveMs.toFixed(3)} | ${d.exclusiveMs.toFixed(3)} |`
      );
    }
  } finally {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
