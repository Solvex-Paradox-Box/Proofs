import { computeSha256 } from '../database/DatabaseSchema';
import { DurableStore } from '../database/DurableStore';

export interface MMTAIPermit {
  permit_id: string;
  capability_id: string;
  authority_id: string;
  authorization_token: string;
  action_intent: string;
  tenant_id: string;
  granted_at: number;
  consumed: boolean;
  checkpoint_id: string;
  signature: string;
}

function secureRandomHex(bytes: number = 16): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const arr = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Try Node.js crypto module if available in environment
  try {
    const nodeCrypto = require('crypto');
    if (nodeCrypto?.randomBytes) {
      return nodeCrypto.randomBytes(bytes).toString('hex');
    }
  } catch {}
  
  // Fail-closed: Never fall back to insecure Math.random() for cryptographic tokens/nonces
  throw new Error('Cryptographic Security Violation: CSPRNG (crypto.getRandomValues / crypto.randomBytes) is unavailable.');
}

export class MMTAIProtocol {
  private static instance: MMTAIProtocol | null = null;
  private consumedTokens: Set<string> = new Set();
  private capabilityCatalog: Map<string, string[]> = new Map();
  private authorityCatalog: Map<string, string[]> = new Map();

  private constructor() {
    this.bootstrapCatalogs();
  }

  public static getInstance(): MMTAIProtocol {
    if (!MMTAIProtocol.instance) {
      MMTAIProtocol.instance = new MMTAIProtocol();
    }
    return MMTAIProtocol.instance;
  }

  private bootstrapCatalogs(): void {
    this.capabilityCatalog.set('CAP_SANDBOX_EXECUTE', ['DN-11', 'DN-12', 'DN-15']);
    this.capabilityCatalog.set('CAP_PROOF_SYNTHESIS', ['DN-09', 'DN-16']);
    this.capabilityCatalog.set('CAP_PERSISTENCE_MUTATE', ['DN-21', 'DN-24', 'DN-27']);
    this.capabilityCatalog.set('CAP_PAYMENT_INITIATE', ['DN-35', 'DN-38']);
    this.capabilityCatalog.set('CAP_ORDER_LIFECYCLE', ['DN-39', 'DN-40', 'DN-43']);

    this.authorityCatalog.set('ROLE_SOVEREIGN_ADMIN', [
      'CAP_SANDBOX_EXECUTE',
      'CAP_PROOF_SYNTHESIS',
      'CAP_PERSISTENCE_MUTATE',
      'CAP_PAYMENT_INITIATE',
      'CAP_ORDER_LIFECYCLE'
    ]);
    this.authorityCatalog.set('ROLE_VERIFIER', ['CAP_SANDBOX_EXECUTE', 'CAP_PROOF_SYNTHESIS']);
    this.authorityCatalog.set('ROLE_TENANT_USER', ['CAP_PAYMENT_INITIATE', 'CAP_ORDER_LIFECYCLE']);
  }

  public issueAuthorizationToken(role: string, capability: string, tenantId: string): string {
    const caps = this.authorityCatalog.get(role) || [];
    if (!caps.includes(capability)) {
      throw new Error(`Authority Violation: Role ${role} is not authorized for Capability ${capability}`);
    }
    const nonce = secureRandomHex(16);
    const ts = Date.now();
    return computeSha256(`AUTH_TOKEN:${role}:${capability}:${tenantId}:${ts}:${nonce}`);
  }

  public authorizeExecution(
    capabilityId: string,
    authorityId: string,
    authorizationToken: string,
    actionIntent: string,
    tenantId: string
  ): { permitted: boolean; permit?: MMTAIPermit; error?: string } {
    const store = DurableStore.getInstance();

    if (this.consumedTokens.has(authorizationToken)) {
      const err = 'MMTAI Violation: Single-use authorization token has already been consumed (Replay Attack Detected).';
      store.recordFailure('MMTAI_TOKEN_REPLAY', err, tenantId, { authorizationToken });
      return { permitted: false, error: err };
    }

    const authorizedCaps = this.authorityCatalog.get(authorityId) || [];
    if (!authorizedCaps.includes(capabilityId)) {
      const err = `MMTAI Invariant Violation: Authority is NOT Authorization. Role ${authorityId} lacks capability ${capabilityId}.`;
      store.recordFailure('MMTAI_AUTHORITY_MISMATCH', err, tenantId, { authorityId, capabilityId });
      return { permitted: false, error: err };
    }

    this.consumedTokens.add(authorizationToken);

    const checkpoint = store.createCheckpoint(
      tenantId,
      actionIntent,
      actionIntent.includes('IRREVERSIBLE') ? 'IRREVERSIBLE_EXTERNAL_ACTION' : 'ATOMIC_DATABASE_RESTORE'
    );

    const permitId = `permit_${Date.now()}_${secureRandomHex(8)}`;
    const permit: MMTAIPermit = {
      permit_id: permitId,
      capability_id: capabilityId,
      authority_id: authorityId,
      authorization_token: authorizationToken,
      action_intent: actionIntent,
      tenant_id: tenantId,
      granted_at: Date.now(),
      consumed: true,
      checkpoint_id: checkpoint.id,
      signature: computeSha256(`PERMIT:${permitId}:${checkpoint.id}`)
    };

    store.appendAudit(tenantId, authorityId, 'MMTAI_PERMIT_GRANTED', 'PERMIT', permitId, {
      capabilityId,
      actionIntent,
      checkpoint_id: checkpoint.id
    });

    return { permitted: true, permit };
  }
}
