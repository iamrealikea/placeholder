const { store } = require('./jsonStore');
const { generateSeedData, ensureTicketQrCodes } = require('./seed');

async function run() {
  store.resetWithSeed(generateSeedData);
  await ensureTicketQrCodes(store);
  console.log('Seed data initialized successfully in /data/*.json');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
