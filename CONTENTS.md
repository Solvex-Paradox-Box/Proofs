# Package Contents: Solvex Proofs + Daisy haMINJA Build

This package unifies the Solvex Paradox Box Proofs repository with the Daisy haMINJA Sovereign Core Engine and the Deterministic Formal Resolution Layer (DFRL).

## Key Components
1. **Proofs Engine**:
   - `src/proofs/DFRL.ts`: Deterministic Formal Resolution Layer.
   - `src/proofs/Z3FormalProofEngine.ts`: Microsoft Research Z3 Automated Theorem Prover.
   - `src/proofs/NOPOTProof.ts`: Bounded Inductive Termination Kernel.
   - `src/proofs/ProofBundle.ts`: Sovereign Multi-Oracle Proof Bundles.
2. **Daisy haMINJA Architecture**:
   - `src/brain/DaisyBrain.ts`: Sovereign Autonomous Neural Core.
   - `src/brain/AgentBrainState.ts`: Synaptic goal nodes, reasoning states, and confidence metrics.
   - `src/proofs/daisy_architecture.ts`: Five-layer sovereign consensus and telemetry invariants.
3. **Schemas & Contracts**:
   - `solvex_proof_contract.schema.json`: Standard formal paradox resolution contract.
   - `solvex_extended_proof_contract.schema.json`: Enterprise multi-tenant proof contract.
   - `dfrl_result.schema.json`: Verifiable cryptographic resolution receipt.
   - `solvex_seed_registry.json`: 88-paradox canonical seed registry.
4. **Verification Suites**:
   - `src/tests/enterpriseVerification.ts`: 30 enterprise invariant tests.
   - `src/tests/verifyFormalProofs.ts`: 8 formal Z3 SMT UNSAT proofs.
   - `src/tests/dfrlVerification.ts`: 17 DFRL proof contract execution tests.
   - `src/tests/dfrlApiVerification.ts`: 12 DFRL API endpoint tests.
