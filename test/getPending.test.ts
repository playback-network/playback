import { getPendingScreenshots } from '../src/db/db_redacted_utils';
import { initializeDatabase } from '../src/db/db';
async function testGetPendingScreenshots() {
  await initializeDatabase();
  try {
    const result = await getPendingScreenshots(10);
    console.log('📸 getPendingScreenshots returned:', result);
    if (!Array.isArray(result)) {
      console.warn('⚠️ result is not an array:', typeof result, result);
    } else if (result.length === 0) {
      console.log('✅ No pending screenshots, result is empty array');
    } else {
      console.log(`✅ Found ${result.length} pending screenshots`);
    }
  } catch (err) {
    console.error('❌ Error running getPendingScreenshots:', err);
  }
}

testGetPendingScreenshots();
