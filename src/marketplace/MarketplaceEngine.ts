import {
  MarketplaceOfferEntity,
  OrderEntity,
  computeSha256
} from '../database/DatabaseSchema';
import { DurableStore } from '../database/DurableStore';
import { ProofEngine } from '../proofs/ProofEngine';

export interface DefensiblePricingBreakdown {
  cost_basis_cents: number;
  complexity_factor: number;
  risk_class: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_multiplier: number;
  margin_multiplier: number;
  final_price_cents: number;
  formula_version: string;
  calculation_hash: string;
}

export class MarketplaceEngine {
  private static instance: MarketplaceEngine | null = null;

  private constructor() {
    this.bootstrapOffers();
  }

  public static getInstance(): MarketplaceEngine {
    if (!MarketplaceEngine.instance) {
      MarketplaceEngine.instance = new MarketplaceEngine();
    }
    return MarketplaceEngine.instance;
  }

  public getAllOffers(): MarketplaceOfferEntity[] {
    const store = DurableStore.getInstance();
    return Object.values(store.getState().offers);
  }

  public calculateDefensiblePrice(
    costBasisCents: number,
    complexityFactor: number,
    riskClass: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ): DefensiblePricingBreakdown {
    const riskMultipliers: Record<string, number> = {
      LOW: 1.0,
      MEDIUM: 1.25,
      HIGH: 1.75,
      CRITICAL: 2.5
    };

    const riskMultiplier = riskMultipliers[riskClass] || 1.0;
    const marginMultiplier = 1.35; // Standard 35% margin on top of verified complexity
    const computed = Math.round(costBasisCents * complexityFactor * riskMultiplier * marginMultiplier);

    const breakdown = {
      cost_basis_cents: costBasisCents,
      complexity_factor: complexityFactor,
      risk_class: riskClass,
      risk_multiplier: riskMultiplier,
      margin_multiplier: marginMultiplier,
      final_price_cents: computed,
      formula_version: '1.4.0-PROD'
    };

    return {
      ...breakdown,
      calculation_hash: computeSha256(JSON.stringify(breakdown))
    };
  }

  private bootstrapOffers(): void {
    const store = DurableStore.getInstance();
    const existing = store.getState().offers['offer_dhs001'];
    if (existing) return;

    const pricing = this.calculateDefensiblePrice(10000, 1.2, 'LOW');
    const offer: MarketplaceOfferEntity = {
      id: 'offer_dhs001',
      solution_id: 'DH-S-001',
      proof_bundle_id: 'PB-DH-S-001',
      title: 'Zeno Geometric Convergence Engine (Zero-Jitter Loop)',
      description: 'Formal NOPOT & Lean4 verified loop eliminating infinite task iteration bugs.',
      cost_basis_cents: pricing.cost_basis_cents,
      verification_complexity_factor: pricing.complexity_factor,
      risk_class: pricing.risk_class,
      price_cents: pricing.final_price_cents,
      sla_tier: 'DETERMINISTIC_ZERO_TOLERANCE',
      published: true,
      verification_status: 'VERIFIED',
      created_at: 1718000000000
    };

    store.getState().offers[offer.id] = offer;
    store.persist();
  }

  public publishOffer(
    solutionId: string,
    proofBundleId: string,
    title: string,
    description: string,
    costBasisCents: number,
    complexityFactor: number,
    riskClass: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ): { success: boolean; offer?: MarketplaceOfferEntity; error?: string } {
    const store = DurableStore.getInstance();
    const proofEngine = ProofEngine.getInstance();
    const bundle = proofEngine.getBundle(proofBundleId);

    if (!bundle) {
      const err = `Publication Blocked: Proof bundle ${proofBundleId} not found.`;
      store.recordFailure('MARKETPLACE_GATE_FAIL', err, 'SYSTEM_ROOT', { solutionId, proofBundleId });
      return { success: false, error: err };
    }

    const check = proofEngine.verifyBundleIntegrity(bundle);
    if (!check.verified) {
      const err = `Publication Blocked: Proof bundle verification failed: ${check.reasons.join(', ')}`;
      store.recordFailure('MARKETPLACE_UNVERIFIED_PUBLICATION', err, 'SYSTEM_ROOT', { solutionId, reasons: check.reasons });
      return { success: false, error: err };
    }

    const pricing = this.calculateDefensiblePrice(costBasisCents, complexityFactor, riskClass);
    const offer: MarketplaceOfferEntity = {
      id: `offer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      solution_id: solutionId,
      proof_bundle_id: proofBundleId,
      title,
      description,
      cost_basis_cents: pricing.cost_basis_cents,
      verification_complexity_factor: pricing.complexity_factor,
      risk_class: pricing.risk_class,
      price_cents: pricing.final_price_cents,
      sla_tier: 'DETERMINISTIC_ZERO_TOLERANCE',
      published: true,
      verification_status: 'VERIFIED',
      created_at: Date.now()
    };

    store.getState().offers[offer.id] = offer;
    store.appendAudit('SYSTEM_ROOT', 'MARKETPLACE_ADMIN', 'PUBLISH_OFFER', 'OFFER', offer.id, {
      offerId: offer.id,
      price: offer.price_cents
    });
    store.persist();

    return { success: true, offer };
  }

  public createOrder(tenantId: string, offerId: string): { success: boolean; order?: OrderEntity; error?: string } {
    const store = DurableStore.getInstance();
    const offer = store.getState().offers[offerId];

    if (!offer) {
      return { success: false, error: `Offer ${offerId} does not exist.` };
    }

    if (!offer.published || offer.verification_status !== 'VERIFIED') {
      const err = `Cannot order unverified or unpublished offer ${offerId}`;
      store.recordFailure('ORDER_CREATION_BLOCKED', err, tenantId, { offerId });
      return { success: false, error: err };
    }

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const order: OrderEntity = {
      id: orderId,
      tenant_id: tenantId,
      offer_id: offerId,
      solution_id: offer.solution_id,
      proof_bundle_id: offer.proof_bundle_id,
      price_cents: offer.price_cents,
      status: 'PENDING_AUTHORIZATION',
      created_at: Date.now()
    };

    store.getState().orders[orderId] = order;
    store.appendAudit(tenantId, 'ORDER_COORDINATOR', 'ORDER_CREATED', 'ORDER', orderId, {
      price: order.price_cents,
      solution_id: order.solution_id
    });
    store.persist();

    return { success: true, order };
  }
}
