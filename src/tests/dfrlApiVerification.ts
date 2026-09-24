/**
 * DFRL API Verification Suite
 * Validates REST API endpoints for proof contracts, formal resolution, and status.
 */

import { SovereignApiRouter } from '../api/ApiRouter';

async function runDfrlApiVerification() {
  console.log('--- STARTING SOLVEX DFRL API ENDPOINT VERIFICATION ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (!condition) {
      console.error(`[FAIL] ${msg}`);
      throw new Error(`Assertion Failed: ${msg}`);
    }
    passed++;
    console.log(`[PASS] ${msg}`);
  }

  const router = SovereignApiRouter.getInstance();

  // Test 1: GET /api/dfrl/contracts
  const contractsRes = await router.handleRequest('/api/dfrl/contracts', 'GET');
  assert(contractsRes.status === 200, 'GET /api/dfrl/contracts returned 200');
  assert(Array.isArray(contractsRes.data) && contractsRes.data.length >= 8, 'Returns list of proof contracts');

  // Test 2: GET /api/dfrl/status
  const statusRes = await router.handleRequest('/api/dfrl/status', 'GET');
  assert(statusRes.status === 200, 'GET /api/dfrl/status returned 200');
  assert(statusRes.data.status === 'ONLINE', 'DFRL Engine is ONLINE');
  assert(statusRes.data.zero_mock_enforced === true, 'Zero-mock enforcement verified in status');

  // Test 3: POST /api/dfrl/resolve (single contract)
  const resolveRes = await router.handleRequest('/api/dfrl/resolve', 'POST', {
    contract_id: 'spc_barber_02'
  });
  assert(resolveRes.status === 200, 'POST /api/dfrl/resolve returned 200');
  assert(resolveRes.data.resolution_status === 'PROVEN_UNSAT', 'Barber paradox contract resolved to PROVEN_UNSAT');
  assert(!!resolveRes.data.cryptographic_seal, 'Cryptographic seal present in response');

  // Test 4: GET /api/dfrl/history
  const historyRes = await router.handleRequest('/api/dfrl/history', 'GET');
  assert(historyRes.status === 200, 'GET /api/dfrl/history returned 200');
  assert(Array.isArray(historyRes.data) && historyRes.data.length > 0, 'History contains executed records');

  // Test 5: POST /api/dfrl/verify-all
  const verifyAllRes = await router.handleRequest('/api/dfrl/verify-all', 'POST');
  assert(verifyAllRes.status === 200, 'POST /api/dfrl/verify-all returned 200');
  assert(verifyAllRes.data.all_verified === true, 'All contracts verified successfully in batch');

  console.log(`\n--- DFRL API VERIFICATION COMPLETED: ${passed}/${total} TESTS PASSED ---`);
}

runDfrlApiVerification().catch(err => {
  console.error('DFRL API Verification Failed:', err);
  process.exit(1);
});
