import { computeSha256 } from '../database/DatabaseSchema';
import { SqliteStore } from '../database/SqliteStore';

export type SovereignRole = 
  | 'OWNER'
  | 'ADMIN'
  | 'OPERATOR'
  | 'VERIFIER'
  | 'CUSTOMER'
  | 'AUDITOR';

export interface UserContext {
  user_id: string;
  tenant_id: string;
  email: string;
  role: SovereignRole;
  permissions: string[];
  issued_at: number;
  expires_at: number;
}

export const ROLE_PERMISSIONS: Record<SovereignRole, string[]> = {
  OWNER: [
    'SYS_ADMIN', 'SYS_LOCKDOWN', 'MANAGE_TENANTS', 'MANAGE_USERS',
    'EXECUTE_NODES', 'RUN_PIPELINE', 'PUBLISH_OFFER', 'CREATE_ORDER',
    'CAPTURE_PAYMENT', 'DEPLOY_RUNTIME', 'VERIFY_PROOFS', 'AUDIT_CHAIN',
    'STAGE_CHECKPOINT', 'EXECUTE_ROLLBACK', 'VIEW_EVIDENCE'
  ],
  ADMIN: [
    'MANAGE_USERS', 'RUN_PIPELINE', 'PUBLISH_OFFER', 'CREATE_ORDER',
    'DEPLOY_RUNTIME', 'VERIFY_PROOFS', 'AUDIT_CHAIN', 'VIEW_EVIDENCE',
    'STAGE_CHECKPOINT'
  ],
  OPERATOR: [
    'EXECUTE_NODES', 'RUN_PIPELINE', 'STAGE_CHECKPOINT', 'VIEW_TELEMETRY',
    'DEPLOY_RUNTIME', 'VIEW_EVIDENCE'
  ],
  VERIFIER: [
    'VERIFY_PROOFS', 'RUN_PIPELINE', 'CHECK_INVARIANTS', 'CHECK_NOPOT',
    'ATTEST_ORACLE', 'VIEW_EVIDENCE', 'AUDIT_CHAIN'
  ],
  CUSTOMER: [
    'INTAKE_PROBLEM', 'VIEW_OFFERS', 'CREATE_ORDER', 'CAPTURE_PAYMENT',
    'VIEW_DEPLOYMENTS', 'VIEW_CUSTOMER_EVIDENCE'
  ],
  AUDITOR: [
    'AUDIT_CHAIN', 'VERIFY_CONTINUITY', 'VIEW_TELEMETRY', 'VIEW_EVIDENCE',
    'CHECK_TAMPER', 'VIEW_REPORTS'
  ]
};

function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

const AUTH_SECRET = process.env.SOVEREIGN_AUTH_SECRET || 'SOVEREIGN_IMMUTABLE_JWT_KEY_9981';

export class AuthService {
  private static instance: AuthService | null = null;
  private sqliteStore: SqliteStore;

  private constructor() {
    this.sqliteStore = SqliteStore.getInstance();
    this.seedDefaultUsers();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private seedDefaultUsers(): void {
    const rawDb = this.sqliteStore.getRawDb();
    
    // Default system root tenant
    const existingTenant = rawDb.get('SELECT id FROM tenants WHERE id = ?', ['TENANT_SOVEREIGN_ROOT']);
    if (!existingTenant) {
      this.sqliteStore.insertRecord('tenants', {
        id: 'TENANT_SOVEREIGN_ROOT',
        name: 'Sovereign Root Governance',
        tier: 'SOVEREIGN_NODE',
        isolated_storage_key: computeSha256('KEY_TENANT_SOVEREIGN_ROOT'),
        status: 'ACTIVE',
        version: '1.0.0-PROD'
      });
    }

    // Default enterprise tenant
    const existingCustTenant = rawDb.get('SELECT id FROM tenants WHERE id = ?', ['TENANT_ENTERPRISE_DEMO']);
    if (!existingCustTenant) {
      this.sqliteStore.insertRecord('tenants', {
        id: 'TENANT_ENTERPRISE_DEMO',
        name: 'Nexus Dynamics Enterprise',
        tier: 'ENTERPRISE',
        isolated_storage_key: computeSha256('KEY_TENANT_ENTERPRISE_DEMO'),
        status: 'ACTIVE',
        version: '1.0.0-PROD'
      });
    }

    // Seed Default Users
    const defaultAccounts: { email: string; role: SovereignRole; tenant_id: string }[] = [
      { email: 'owner@sovereign.local', role: 'OWNER', tenant_id: 'TENANT_SOVEREIGN_ROOT' },
      { email: 'admin@sovereign.local', role: 'ADMIN', tenant_id: 'TENANT_SOVEREIGN_ROOT' },
      { email: 'verifier@sovereign.local', role: 'VERIFIER', tenant_id: 'TENANT_SOVEREIGN_ROOT' },
      { email: 'operator@sovereign.local', role: 'OPERATOR', tenant_id: 'TENANT_SOVEREIGN_ROOT' },
      { email: 'auditor@sovereign.local', role: 'AUDITOR', tenant_id: 'TENANT_SOVEREIGN_ROOT' },
      { email: 'customer@nexus.local', role: 'CUSTOMER', tenant_id: 'TENANT_ENTERPRISE_DEMO' }
    ];

    for (const acc of defaultAccounts) {
      const existingUser = rawDb.get('SELECT id FROM users WHERE email = ?', [acc.email]);
      if (!existingUser) {
        const userId = `usr_${acc.role.toLowerCase()}_001`;
        this.sqliteStore.insertRecord('users', {
          id: userId,
          tenant_id: acc.tenant_id,
          email: acc.email,
          password_hash: computeSha256(`SOVEREIGN_HASH:${acc.email}`),
          role: acc.role,
          status: 'ACTIVE',
          version: '1.0.0-PROD'
        });
      }
    }
  }

  public createSignedToken(userId: string, tenantId: string, email: string, role: SovereignRole): string {
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 24 * 60 * 60 * 1000; // 24 hours
    const permissions = ROLE_PERMISSIONS[role] || [];

    const payload = {
      user_id: userId,
      tenant_id: tenantId,
      email,
      role,
      permissions,
      issued_at: issuedAt,
      expires_at: expiresAt
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = computeSha256(`${payloadBase64}:${AUTH_SECRET}`);
    return `${payloadBase64}.${signature}`;
  }

  public verifyToken(token: string): { valid: boolean; user?: UserContext; error?: string } {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token missing or invalid format' };
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Malformed token structure' };
    }

    const [payloadBase64, providedSig] = parts;
    const expectedSig = computeSha256(`${payloadBase64}:${AUTH_SECRET}`);

    if (!constantTimeCompare(providedSig, expectedSig)) {
      return { valid: false, error: 'Cryptographic signature mismatch. Token tampered.' };
    }

    try {
      const raw = Buffer.from(payloadBase64, 'base64').toString('utf8');
      const payload: UserContext = JSON.parse(raw);

      if (Date.now() > payload.expires_at) {
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, user: payload };
    } catch (e: any) {
      return { valid: false, error: 'Failed to decode token payload' };
    }
  }

  public authorize(user: UserContext, requiredPermission: string, requiredTenantId?: string): { authorized: boolean; reason?: string } {
    if (requiredTenantId && user.role !== 'OWNER' && user.tenant_id !== requiredTenantId) {
      return {
        authorized: false,
        reason: `Cross-Tenant Access Violation: User tenant [${user.tenant_id}] cannot access target tenant [${requiredTenantId}]. Fail-closed enforced.`
      };
    }

    const perms = ROLE_PERMISSIONS[user.role] || [];
    if (!perms.includes(requiredPermission) && !perms.includes('SYS_ADMIN')) {
      return {
        authorized: false,
        reason: `RBAC Violation: Role [${user.role}] does not possess required permission [${requiredPermission}].`
      };
    }

    return { authorized: true };
  }
}
