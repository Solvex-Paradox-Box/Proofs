import { Z3FormalProofEngine } from './Z3FormalProofEngine';

async function main() {
  console.log('--- EXECUTING FORMAL SMT-LIB VERIFICATION VIA Z3 SOLVER ---');
  const engine = Z3FormalProofEngine.getInstance();
  const catalog = engine.getCatalog();
  let failures = 0;

  for (const item of catalog) {
    const start = performance.now();
    const res = await engine.proveCatalogTheorem(item.id);
    const dur = (performance.now() - start).toFixed(2);

    if (!res || !res.proved || res.solver_result !== item.expected_solver_result) {
      console.error(`[FAIL] ${item.id}: ${item.name}`);
      console.error(`  Expected: ${item.expected_solver_result}, Got: ${res?.solver_result}`);
      console.error(`  Explanation: ${res?.explanation}`);
      failures++;
    } else {
      console.log(`[PASS] ${item.id} (${res.solver_result.toUpperCase()}) in ${dur}ms - ${item.name}`);
    }
  }

  if (failures > 0) {
    console.error(`\n[FATAL] ${failures} formal proofs failed machine-checking!`);
    process.exit(1);
  } else {
    console.log(`\n[SUCCESS] All ${catalog.length} formal theorems machine-checked by Z3 solver.`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal theorem prover execution failure:', err);
  process.exit(1);
});
