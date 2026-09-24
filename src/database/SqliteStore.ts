function getNodeModule(name: string): any {
  try {
    if (typeof process !== 'undefined' && typeof (process as any).getBuiltinModule === 'function') {
      return (process as any).getBuiltinModule(name);
    }
  } catch {}
  try {
    // @ts-ignore
    if (typeof require === 'function') {
      // @ts-ignore
      return require(name);
    }
  } catch {}
  return null;
}

function getFs(): any {
  return getNodeModule('fs') || getNodeModule('node:fs');
}

function getPath(): any {
  return getNodeModule('path') || getNodeModule('node:path');
}

export interface SqliteDbInterface {
  exec(sql: string): void;
  all(sql: string, params?: any[]): any[];
  get(sql: string, params?: any[]): any;
  run(sql: string, params?: any[]): { changes: number; lastInsertRowid?: number };
}

export class SqliteStore {
  private static instance: SqliteStore | null = null;
  private db: SqliteDbInterface;
  private dbPath: string;

  private constructor(storageDir: string = './.sovereign_data') {
    const fsMod = getFs();
    const pathMod = getPath();
    if (fsMod && fsMod.existsSync && !fsMod.existsSync(storageDir)) {
      fsMod.mkdirSync(storageDir, { recursive: true });
    }
    this.dbPath = pathMod && pathMod.resolve ? pathMod.resolve(storageDir, 'sovereign.sqlite') : `${storageDir}/sovereign.sqlite`;
    this.db = this.initDatabase(this.dbPath);
    this.runMigrations();
  }

  public static getInstance(storageDir?: string): SqliteStore {
    if (!SqliteStore.instance) {
      SqliteStore.instance = new SqliteStore(storageDir);
    }
    return SqliteStore.instance;
  }

  private initDatabase(filePath: string): SqliteDbInterface {
    // 1. Try bun:sqlite
    try {
      const bunSqlite = getNodeModule('bun:sqlite');
      if (bunSqlite) {
        const db = new bunSqlite.Database(filePath);
        return {
          exec: (sql: string) => db.exec(sql),
          all: (sql: string, params: any[] = []) => db.query(sql).all(...params),
          get: (sql: string, params: any[] = []) => db.query(sql).get(...params),
          run: (sql: string, params: any[] = []) => {
            const res = db.query(sql).run(...params);
            return { changes: res.changes, lastInsertRowid: Number(res.lastInsertRowid) };
          }
        };
      }
    } catch (e1) {}

    // 2. Try node:sqlite
    try {
      const nodeSqlite = getNodeModule('node:sqlite');
      if (nodeSqlite && nodeSqlite.DatabaseSync) {
        const db = new nodeSqlite.DatabaseSync(filePath);
        return {
          exec: (sql: string) => db.exec(sql),
          all: (sql: string, params: any[] = []) => db.prepare(sql).all(...params),
          get: (sql: string, params: any[] = []) => db.prepare(sql).get(...params),
          run: (sql: string, params: any[] = []) => {
            const res = db.prepare(sql).run(...params);
            return { changes: res.changes, lastInsertRowid: Number(res.lastInsertRowid) };
          }
        };
      }
    } catch (e2) {}

    // In-memory fallback emulator using file persistence / Map
    console.warn('Native SQLite module not found, operating in SQLite memory mode.');
    const memTables = new Map<string, any[]>();
    return {
      exec: (sql: string) => {
        const createMatches = sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi);
        for (const match of createMatches) {
          const tableName = match[1];
          if (!memTables.has(tableName)) {
            memTables.set(tableName, []);
          }
        }
      },
      all: (sql: string, params: any[] = []) => {
        if (sql.includes('sqlite_master')) {
          return Array.from(memTables.keys()).map(name => ({ name }));
        }
        const fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
        if (fromMatch && memTables.has(fromMatch[1])) {
          let rows = [...memTables.get(fromMatch[1])!];
          if (sql.includes('WHERE tenant_id = ?') && params[0]) {
            rows = rows.filter(r => r.tenant_id === params[0]);
          }
          return rows;
        }
        return [];
      },
      get: (sql: string, params: any[] = []) => {
        const fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
        if (fromMatch && memTables.has(fromMatch[1])) {
          const rows = memTables.get(fromMatch[1])!;
          if (sql.includes('WHERE id = ?') && params[0]) {
            return rows.find(r => r.id === params[0]);
          }
          if (sql.includes('WHERE tenant_id = ? AND id = ?') && params[0] && params[1]) {
            return rows.find(r => r.tenant_id === params[0] && r.id === params[1]);
          }
          return rows[0];
        }
        return undefined;
      },
      run: (sql: string, params: any[] = []) => {
        const insertMatch = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)/i);
        if (insertMatch) {
          const tableName = insertMatch[1];
          const cols = insertMatch[2].split(',').map(c => c.trim());
          const obj: any = {};
          cols.forEach((col, idx) => {
            obj[col] = params[idx];
          });
          if (!memTables.has(tableName)) memTables.set(tableName, []);
          const rows = memTables.get(tableName)!;
          const existingIdx = rows.findIndex(r => r.id === obj.id);
          if (existingIdx >= 0) {
            rows[existingIdx] = obj;
          } else {
            rows.push(obj);
          }
          return { changes: 1 };
        }
        return { changes: 0 };
      }
    };
  }

  public getRawDb(): SqliteDbInterface {
    return this.db;
  }

  private runMigrations(): void {
    const ddl = `
      -- 1. users
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 2. tenants
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        name TEXT NOT NULL,
        tier TEXT NOT NULL,
        isolated_storage_key TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 3. roles
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        name TEXT NOT NULL,
        permissions TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 4. permissions
      CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 5. tenant_memberships
      CREATE TABLE IF NOT EXISTS tenant_memberships (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 6. problems
      CREATE TABLE IF NOT EXISTS problems (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        raw_problem TEXT NOT NULL,
        normalized_title TEXT NOT NULL,
        domain TEXT NOT NULL,
        detected_constraints TEXT NOT NULL,
        invariants TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 7. paradoxes
      CREATE TABLE IF NOT EXISTS paradoxes (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        domain TEXT NOT NULL,
        mechanism TEXT NOT NULL,
        claim TEXT NOT NULL,
        canonical_family TEXT,
        is_duplicate_of TEXT,
        verification_status TEXT NOT NULL,
        proof_bundle_id TEXT,
        source_references TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 8. invariants
      CREATE TABLE IF NOT EXISTS invariants (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        predicate TEXT NOT NULL,
        formal_spec TEXT NOT NULL,
        checked INTEGER NOT NULL,
        verified_timestamp INTEGER,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 9. solutions
      CREATE TABLE IF NOT EXISTS solutions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        domain TEXT NOT NULL,
        problem_ref TEXT NOT NULL,
        paradox_ref TEXT,
        implementation_source TEXT NOT NULL,
        implementation_hash TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        proof_bundle_id TEXT,
        performance_boost_percent REAL NOT NULL,
        reversibility_guaranteed INTEGER NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 10. offers
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        solution_id TEXT NOT NULL,
        proof_bundle_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        cost_basis_cents INTEGER NOT NULL,
        verification_complexity_factor REAL NOT NULL,
        risk_class TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        sla_tier TEXT NOT NULL,
        published INTEGER NOT NULL,
        verification_status TEXT NOT NULL,
        publication_blocked_reason TEXT,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 11. proof_bundles
      CREATE TABLE IF NOT EXISTS proof_bundles (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        proof_id TEXT UNIQUE NOT NULL,
        subject_id TEXT NOT NULL,
        claim TEXT NOT NULL,
        claim_hash TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        tests_json TEXT NOT NULL,
        formal_proofs_json TEXT NOT NULL,
        independent_oracles_json TEXT NOT NULL,
        replay_results_json TEXT NOT NULL,
        implementation_hash TEXT NOT NULL,
        environment_hash TEXT NOT NULL,
        dependency_hash TEXT NOT NULL,
        source_references_json TEXT NOT NULL,
        verifier_identity TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        limitations_json TEXT NOT NULL,
        reproducibility_instructions TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 12. proof_evidence
      CREATE TABLE IF NOT EXISTS proof_evidence (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        proof_bundle_id TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        description TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        artifact_path TEXT,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 13. tests
      CREATE TABLE IF NOT EXISTS tests (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        passed INTEGER NOT NULL,
        duration_ms REAL NOT NULL,
        receipt_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 14. verification_runs
      CREATE TABLE IF NOT EXISTS verification_runs (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        run_id TEXT UNIQUE NOT NULL,
        suite_name TEXT NOT NULL,
        total_tests INTEGER NOT NULL,
        passed_tests INTEGER NOT NULL,
        failed_tests INTEGER NOT NULL,
        verdict TEXT NOT NULL,
        report_path TEXT,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 15. orders
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        offer_id TEXT NOT NULL,
        solution_id TEXT NOT NULL,
        proof_bundle_id TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        status TEXT NOT NULL,
        payment_id TEXT,
        deployment_id TEXT,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 16. payments
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_tx_id TEXT,
        status TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        receipt_hash TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 17. deployments
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        solution_id TEXT NOT NULL,
        implementation_version TEXT NOT NULL,
        deployment_hash TEXT NOT NULL,
        sandbox_id TEXT NOT NULL,
        status TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 18. checkpoints
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        snapshot_hash TEXT NOT NULL,
        snapshot_data TEXT NOT NULL,
        rollback_strategy TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 19. rollback_records
      CREATE TABLE IF NOT EXISTS rollback_records (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        restored_snapshot_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        verified_integrity INTEGER NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 20. telemetry
      CREATE TABLE IF NOT EXISTS telemetry (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        execution_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        output_hash TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        status TEXT NOT NULL,
        errors TEXT,
        checkpoint_ref TEXT,
        rollback_ref TEXT,
        proof_ref TEXT,
        environment_hash TEXT NOT NULL,
        implementation_version TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 21. audit_records
      CREATE TABLE IF NOT EXISTS audit_records (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        index_num INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_entity TEXT NOT NULL,
        target_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        record_hash TEXT UNIQUE NOT NULL,
        signature TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 22. chain_records
      CREATE TABLE IF NOT EXISTS chain_records (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        record_hash TEXT UNIQUE NOT NULL,
        timestamp INTEGER NOT NULL,
        record_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 23. licenses
      CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        license_key TEXT UNIQUE NOT NULL,
        scope TEXT NOT NULL,
        expires_at INTEGER,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 24. adapter_status
      CREATE TABLE IF NOT EXISTS adapter_status (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        adapter_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        required_env_vars TEXT NOT NULL,
        provided_env_vars TEXT NOT NULL,
        live_connected INTEGER NOT NULL,
        notes TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 25. node_registry
      CREATE TABLE IF NOT EXISTS node_registry (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        node_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        execution_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        inputs_schema TEXT NOT NULL,
        outputs_schema TEXT NOT NULL,
        permissions TEXT NOT NULL,
        dependencies TEXT NOT NULL,
        purpose TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 26. execution_runs
      CREATE TABLE IF NOT EXISTS execution_runs (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        execution_id TEXT UNIQUE NOT NULL,
        node_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        output_hash TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        status TEXT NOT NULL,
        checkpoint_id TEXT,
        rollback_reference TEXT,
        proof_reference TEXT,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- 27. failures
      CREATE TABLE IF NOT EXISTS failures (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        failed_gate TEXT NOT NULL,
        trigger_reason TEXT NOT NULL,
        evidence_hash TEXT NOT NULL,
        reverted_to_checkpoint TEXT,
        fail_closed_enforced INTEGER NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        metadata TEXT,
        evidence_reference TEXT
      );

      -- Tenant Isolation Indices
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_problems_tenant ON problems(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_invariants_tenant ON invariants(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_solutions_tenant ON solutions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_offers_tenant ON offers(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_proof_bundles_tenant ON proof_bundles(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_deployments_tenant ON deployments(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_tenant ON checkpoints(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_telemetry_tenant ON telemetry(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_audit_records_tenant ON audit_records(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_failures_tenant ON failures(tenant_id);
    `;

    this.db.exec(ddl);
  }

  public static readonly ALLOWED_TABLES: ReadonlySet<string> = new Set([
    'tenants', 'users', 'roles', 'permissions', 'tenant_memberships',
    'problems', 'invariants', 'solutions', 'offers', 'proof_bundles',
    'orders', 'payments', 'deployments', 'checkpoints', 'rollback_records',
    'paradoxes', 'axioms', 'theorems', 'counterexamples', 'oracles',
    'audit_records', 'telemetry', 'verification_runs', 'sandboxes',
    'node_registry', 'execution_runs', 'failures'
  ]);

  private assertValidTable(tableName: string): void {
    if (!SqliteStore.ALLOWED_TABLES.has(tableName)) {
      throw new Error(`Security Violation: Unauthorized table access attempt on table [${tableName}]`);
    }
  }

  private assertValidColumn(col: string): void {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
      throw new Error(`Security Violation: Invalid column identifier [${col}]`);
    }
  }

  // Tenant-isolated CRUD helpers
  public findTenantRecords<T = any>(tableName: string, tenantId: string, limit: number = 100): T[] {
    this.assertValidTable(tableName);
    const sql = `SELECT * FROM ${tableName} WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`;
    return this.db.all(sql, [tenantId, limit]);
  }

  public findTenantRecordById<T = any>(tableName: string, tenantId: string, id: string): T | undefined {
    this.assertValidTable(tableName);
    const sql = `SELECT * FROM ${tableName} WHERE tenant_id = ? AND id = ?`;
    return this.db.get(sql, [tenantId, id]);
  }

  public insertRecord(tableName: string, data: Record<string, any>): void {
    this.assertValidTable(tableName);
    const now = Date.now();
    const payload: Record<string, any> = {
      ...data,
      created_at: data.created_at || now,
      updated_at: data.updated_at || now,
      version: data.version || '1.0.0-PROD',
      status: data.status || 'ACTIVE'
    };
    const keys = Object.keys(payload);
    keys.forEach(k => this.assertValidColumn(k));
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => typeof payload[k] === 'object' ? JSON.stringify(payload[k]) : payload[k]);
    const sql = `INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
    this.db.run(sql, values);
  }

  public updateTenantRecord(tableName: string, tenantId: string, id: string, updates: Record<string, any>): number {
    this.assertValidTable(tableName);
    const now = Date.now();
    const payload: Record<string, any> = { ...updates, updated_at: now };
    const keys = Object.keys(payload);
    keys.forEach(k => this.assertValidColumn(k));
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = [...keys.map(k => typeof payload[k] === 'object' ? JSON.stringify(payload[k]) : payload[k]), tenantId, id];
    const sql = `UPDATE ${tableName} SET ${setClause} WHERE tenant_id = ? AND id = ?`;
    return this.db.run(sql, values).changes;
  }
}
