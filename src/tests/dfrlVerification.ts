/**
 * Deterministic Formal Resolution Layer (DFRL) Verification Suite
 * Validates formal proof contract execution, Z3 solver integration, NOPOT bounded descent,
 * and cryptographic seal aggregation under zero-mock policy.
 */

import { DFRLEngine, SolvexProofContract } from '../proofs/DFRL';
import { Z3FormalProofEngine } from '../proofs/Z3FormalProofEngine';

async function runDfrlVerification() {
  console.log('--- STARTING SOLVEX DFRL PROOF VERIFICATION SUITE ---');
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

  const dfrl = DFRLEngine.getInstance();

  // Test 1: Canonical contracts registry initialized
  const contracts = dfrl.getContracts();
  assert(contracts.length >= 8, `Canonical contracts loaded: expected >=8, got ${contracts.length}`);

  // Test 2: Check Russell Paradox Contract integrity
  const russellContract = dfrl.getContract('spc_russell_01');
  assert(!!russellContract, 'Russell Paradox Proof Contract exists');
  assert(russellContract?.formal_logic_system === 'SMT_LIB2', 'Russell contract uses SMT_LIB2 logic system');
  assert(russellContract?.invariants.includes('FIRST_ORDER_CONSISTENCY') === true, 'Russell contract enforces FIRST_ORDER_CONSISTENCY');

  // Test 3: Execute single contract verification (Russell's Paradox)
  if (russellContract) {
    console.log('Verifying Russell Paradox Contract through Z3 solver...');
    const result = await dfrl.verifyContract(russellContract);
    assert(result.resolution_status === 'PROVEN_UNSAT', 'Russell contract proved UNSAT (inconsistency of naive comprehension)');
    assert(result.z3_proof_hash.length === 64, 'Valid 64-char SHA-256 Z3 proof hash emitted');
    assert(result.cryptographic_seal.length === 64, 'Valid 64-char SHA-256 cryptographic seal generated');
    assert(result.zero_mock_verified === true, 'Zero-mock verification attestation present');
  }

  // Test 4: Execute NOPOT Inductive Termination Contract
  const inductiveContract = dfrl.getContract('spc_inductive_05');
  assert(!!inductiveContract, 'NOPOT Inductive Termination Contract exists');
  if (inductiveContract) {
    console.log('Verifying NOPOT Inductive Termination Contract...');
    const result = await dfrl.verifyContract(inductiveContract);
    assert(result.resolution_status === 'PROVEN_UNSAT' || result.resolution_status === 'TERMINATION_BOUNDED', 'NOPOT termination formally proved');
    assert(result.nopot_measured_steps > 0 && result.nopot_measured_steps <= result.nopot_upper_bound, `Measured steps (${result.nopot_measured_steps}) within bound (${result.nopot_upper_bound})`);
  }

  // Test 5: Dynamic Custom Contract registration and verification
  const customContract: SolvexProofContract = {
    contract_id: 'spc_custom_modus_ponens_09',
    paradox_id: 'px_custom',
    claim: 'Modus Ponens Consistency: Negating (A and (A => B) => B) is unsatisfiable.',
    formal_logic_system: 'SMT_LIB2',
    formal_specification: '(declare-const A Bool)\n(declare-const B Bool)\n(assert (and A (=> A B) (not B)))\n(check-sat)',
    invariants: ['MODUS_PONENS_SOUNDNESS'],
    author: 'Enterprise Auditor',
    timestamp: Date.now(),
    status: 'PROPOSED'
  };
  dfrl.registerContract(customContract);
  const customResult = await dfrl.verifyContract(customContract);
  assert(customResult.resolution_status === 'PROVEN_UNSAT', 'Custom Modus Ponens proof proved UNSAT');

  // Test 6: Verify Batch Execution of All Canonical Contracts
  console.log('Executing batch verification across all registered DFRL contracts...');
  const summary = await dfrl.verifyAllContracts();
  assert(summary.total_contracts >= 9, `Summary processed ${summary.total_contracts} contracts`);
  assert(summary.all_verified === true, 'All contracts verified without failure');
  assert(summary.aggregate_proof_merkle_root.length === 64, 'Valid Aggregate Merkle Root generated for all seals');
  assert(summary.failed_or_rejected_count === 0, 'Zero failed or rejected contracts');

  // Test 7: Audit history retention
  const history = dfrl.getHistory();
  assert(history.length >= summary.total_contracts, `Audit history contains ${history.length} resolution records`);

  console.log(`\n--- DFRL VERIFICATION COMPLETED: ${passed}/${total} TESTS PASSED ---`);
}

runDfrlVerification().catch(err => {
  console.error('DFRL Verification Failed:', err);
  process.exit(1);
});
