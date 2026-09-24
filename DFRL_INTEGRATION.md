# DFRL Integration Guide

## API Endpoints

### 1. Retrieve Contracts
```http
GET /api/dfrl/contracts
```
Returns list of all registered formal proof contracts.

### 2. Check DFRL Engine Status
```http
GET /api/dfrl/status
```
Returns engine operational status, active solvers, and zero-mock enforcement flag.

### 3. Resolve Proof Contract
```http
POST /api/dfrl/resolve
Content-Type: application/json

{
  "contract_id": "spc_russell_01"
}
```
Executes formal SMT/NOPOT verification and returns signed `DFRLResult`.

### 4. Batch Verification
```http
POST /api/dfrl/verify-all
```
Executes batch verification across all registered contracts, producing an aggregate Merkle root.

### 5. Execution History
```http
GET /api/dfrl/history
```
Returns audit trail of all previous DFRL resolution runs.
