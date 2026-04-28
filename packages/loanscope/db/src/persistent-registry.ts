import type { ProductDefinition, LenderDefinition } from "@loanscope/domain";
import type { ProductSourceSelection } from "@loanscope/domain";
import { assertNever } from "@loanscope/domain";
import type { LenderPreset, ValidatedLender } from "@loanscope/lenders";
import type { LoanScopeDB } from "./connection";
import { createLenderRepository } from "./repositories/lender-repository";
import { createCatalogRepository } from "./repositories/catalog-repository";
import { createPresetRepository } from "./repositories/preset-repository";
import type { LenderRepository } from "./repositories/lender-repository";
import type { CatalogRepository } from "./repositories/catalog-repository";
import type { PresetRepository } from "./repositories/preset-repository";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PersistentRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistentRegistryError";
  }
}

// ---------------------------------------------------------------------------
// PersistentLenderRegistry
// ---------------------------------------------------------------------------

/**
 * A lender registry backed by the persistence layer. Provides the same
 * read API as the in-memory LenderRegistry from @loanscope/lenders, but
 * reads lender metadata, product catalogs, and presets from SQLite.
 *
 * Write operations go through {@link seedLender} / {@link seedLenders}
 * rather than a `registerLender` method on this class, keeping the write
 * path explicit and separate from the query path.
 */
export class PersistentLenderRegistry {
  private readonly lenderRepo: LenderRepository;
  private readonly catalogRepo: CatalogRepository;
  private readonly presetRepo: PresetRepository;

  constructor(db: LoanScopeDB) {
    this.lenderRepo = createLenderRepository(db);
    this.catalogRepo = createCatalogRepository(db);
    this.presetRepo = createPresetRepository(db);
  }

  // -----------------------------------------------------------------------
  // Lender queries
  // -----------------------------------------------------------------------

  /** Returns a validated lender by ID, or throws if not found. */
  getLender(lenderId: string): ValidatedLender {
    const lender = this.lenderRepo.findById(lenderId);
    if (!lender || !lender.active) {
      throw new PersistentRegistryError(
        `Unknown lender ID "${lenderId}". Registered: ${this.lenderIds().join(", ") || "(none)"}`,
      );
    }

    const products = this.catalogRepo.getLatestProducts(lenderId);
    const presetRecords = this.presetRepo.findByLender(lenderId);
    const presets: LenderPreset[] = presetRecords.map((p) => ({
      id: p.presetId,
      name: p.name,
      productIds: [...p.productIds],
    }));

    return {
      id: lender.id,
      name: lender.name,
      products,
      presets,
    };
  }

  /** Returns all active lenders as domain LenderDefinition objects. */
  getAllLenders(): LenderDefinition[] {
    const lenders = this.lenderRepo.findAll(true);
    return lenders.map((l) => ({
      id: l.id,
      name: l.name,
      products: [...this.catalogRepo.getLatestProducts(l.id)],
    }));
  }

  /** Returns all registered (active) lender IDs. */
  lenderIds(): string[] {
    return this.lenderRepo.findAll(true).map((l) => l.id);
  }

  /** Whether a lender is registered and active. */
  hasLender(lenderId: string): boolean {
    const lender = this.lenderRepo.findById(lenderId);
    return lender !== undefined && lender.active;
  }

  /** Number of active registered lenders. */
  get size(): number {
    return this.lenderRepo.findAll(true).length;
  }

  // -----------------------------------------------------------------------
  // Product queries
  // -----------------------------------------------------------------------

  /** Returns products for a specific lender (latest catalog version). */
  getProducts(lenderId: string): readonly ProductDefinition[] {
    this.assertLenderExists(lenderId);
    return this.catalogRepo.getLatestProducts(lenderId);
  }

  /** Returns all products across all active lenders. */
  getAllProducts(): ProductDefinition[] {
    const lenders = this.lenderRepo.findAll(true);
    const result: ProductDefinition[] = [];
    for (const lender of lenders) {
      result.push(...this.catalogRepo.getLatestProducts(lender.id));
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Preset queries
  // -----------------------------------------------------------------------

  /** Returns all presets for a specific lender. */
  getPresets(lenderId: string): readonly LenderPreset[] {
    this.assertLenderExists(lenderId);
    return this.presetRepo.findByLender(lenderId).map((p) => ({
      id: p.presetId,
      name: p.name,
      productIds: [...p.productIds],
    }));
  }

  /** Resolves a preset by lender ID and preset ID. Returns the matching products. */
  resolvePreset(lenderId: string, presetId: string): ProductDefinition[] {
    const validated = this.getLender(lenderId);
    const preset = validated.presets.find((p) => p.id === presetId);
    if (!preset) {
      const knownIds = validated.presets.map((p) => p.id);
      throw new PersistentRegistryError(
        `Unknown preset "${presetId}" for lender "${lenderId}". Known presets: ${knownIds.join(", ") || "(none)"}`,
      );
    }
    const productMap = new Map(validated.products.map((p) => [p.id, p]));
    const result: ProductDefinition[] = [];
    for (const pid of preset.productIds) {
      const product = productMap.get(pid);
      if (!product) {
        throw new PersistentRegistryError(
          `Preset "${presetId}" references product "${pid}" not found in lender "${lenderId}"`,
        );
      }
      result.push(product);
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Product-source selection
  // -----------------------------------------------------------------------

  /**
   * Resolves a ProductSourceSelection into a concrete product list.
   *
   * - generic: returns all products from all active lenders.
   * - preset: returns the products from a specific lender preset.
   * - custom: returns the caller-provided products, optionally scoped to a lender.
   */
  resolveProductSource(selection: ProductSourceSelection): ProductDefinition[] {
    switch (selection.kind) {
      case "generic":
        return this.getAllProducts();

      case "preset":
        return this.resolvePreset(selection.lenderId, selection.presetId);

      case "custom": {
        const products = selection.products as ProductDefinition[];
        if (selection.lenderId) {
          this.assertLenderExists(selection.lenderId);
          return products.filter((p) => p.lenderId === selection.lenderId);
        }
        return products;
      }

      default:
        return assertNever(
          selection,
          `Unsupported product source kind: ${JSON.stringify(selection)}`,
        );
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private assertLenderExists(lenderId: string): void {
    const lender = this.lenderRepo.findById(lenderId);
    if (!lender || !lender.active) {
      throw new PersistentRegistryError(
        `Unknown lender ID "${lenderId}". Registered: ${this.lenderIds().join(", ") || "(none)"}`,
      );
    }
  }
}
