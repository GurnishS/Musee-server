const { cleanOrphanedTrackBlobs } = require('../src/utils/azureBlobCleanup');

(async () => {
  const result = await cleanOrphanedTrackBlobs({ dryRun: false, concurrency: 12 });
  console.log(result);
})();