const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-data-'));
const tmpUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-uploads-'));

process.env.DATA_DIR = tmpDataDir;
process.env.UPLOAD_DIR = tmpUploadDir;
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '3100';

const { app, expirationInterval } = require('../../server');
const { store } = require('../../src/models');
const { generateSeedData, ensureTicketQrCodes } = require('../../src/store/seed');

let httpServer;

async function main() {
  store.resetWithSeed(generateSeedData);
  await ensureTicketQrCodes(store);
  httpServer = app.listen(Number(process.env.PORT), '127.0.0.1', () => {
    console.log(`TicketHub UI test server listening on http://127.0.0.1:${process.env.PORT}`);
  });
}

function shutdown() {
  clearInterval(expirationInterval);
  const cleanup = () => {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
    fs.rmSync(tmpUploadDir, { recursive: true, force: true });
    process.exit(0);
  };
  if (httpServer) httpServer.close(cleanup);
  else cleanup();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
