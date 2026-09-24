# DFRL Proof Contract Lifecycle

The lifecycle of a formal paradox resolution under DFRL follows five irreversible phases:

```
[PROPOSED] 
    │
    ▼
[SYNTACTIC_VALIDATION] ──(Syntax/Schema Fail)──► [REJECTED]
    │
    ▼
[FORMAL_SMT_CHECK] ─────(SAT Countermodel)─────► [DISPROVED_SAT]
    │
    ▼
[NOPOT_BOUNDING] ───────(Steps Exceeded)───────► [REJECTED_UNKNOWN]
    │
    ▼
[SEALED_&_PERSISTED] ──► Immutable Sovereign Audit Chain
```

## Phase 1: Ingestion & Schema Conformance
1. Incoming `SolvexProofContract` is checked against `solvex_proof_contract.schema.json`.
2. Required fields: `contract_id`, `paradox_id`, `claim`, `formal_logic_system`, `formal_specification`, `invariants`.

## Phase 2: Formal Theorem Prover Execution
1. SMT formulas are translated into SMT-LIB2 standard AST.
2. Sent to WebAssembly-native Z3 Automated Theorem Prover kernel.
3. For inconsistency/paradox resolution proofs, the solver checks for `unsat`.

## Phase 3: Inductive Bounded Descent (NOPOT)
1. For dynamic recursive procedures, NOPOT verifies that the ranking function strictly decreases: $V(s_{t+1}) < V(s_t)$.
2. Steps executed are measured and verified against upper bound $M$.

## Phase 4: Cryptographic State Sealing
1. Result payload is hashed using SHA-256: `Hash(contract_id + z3_hash + nopot_hash + invariants + timestamp)`.
2. Sealed with `auditor_signature` linking to the current state checkpoint.

## Phase 5: Sovereign Ledger Commitment
1. Appended to SQLite `verification_runs` table and JSON-backed `DurableStore`.
2. DaisyBrain synaptic memory updates with verified evidence references.
