import type { ProductDefinition, LenderDefinition } from "@loanscope/domain";
import type { ProductSourceSelection } from "@loanscope/domain";
import { assertNever } from "@loanscope/domain";
import type { LenderPreset, ValidatedLender, LenderDefinitionInput } from "./schema";
import { validateLenderInput, toLenderDefinition } from "./schema";

// ---------------------------------------------------------------------------
// Registry errors
// ---------------------------------------------------------------------------

export class LenderRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LenderRegistryError";
  }
}

// ---------------------------------------------------------------------------
// LenderRegistry
// ---------------------------------------------------------------------------

/**
 * Central registry for lender definitions. Validates on registration,
 * rejects duplicates, and supports product-source selection flows
 * (generic / preset / custom).
 */
export class LenderRegistry {
  private readonly lenders = new Map<string, ValidatedLender>();

  /** Registers a lender from raw input. Validates schema and rejects duplicates. */
  registerLender(input: LenderDefinitionInput): void {
    const validated = validateLenderInput(input);

    if (this.lenders.has(validated.id)) {
      throw new LenderRegistryError(`Duplicate lender ID "${validated.id}": already registered`);
    }

    this.lenders.set(validated.id, validated);
  }

  /** Returns a validated lender by ID, or throws if not found. */
  getLender(lenderId: string): ValidatedLender {
    const lender = this.lenders.get(lenderId);
    if (!lender) {
      throw new LenderRegistryError(
        `Unknown lender ID "${lenderId}". Registered: ${this.lenderIds().join(", ") || "(none)"}`,
      );
    }
    return lender;
  }

  /** Returns all registered lenders as domain LenderDefinition objects. */
  getAllLenders(): LenderDefinition[] {
    return [...this.lenders.values()].map(toLenderDefinition);
  }

  /** Returns all registered lender IDs. */
  lenderIds(): string[] {
    return [...this.lenders.keys()];
  }

  /** Returns products for a specific lender. */
  getProducts(lenderId: string): readonly ProductDefinition[] {
    return this.getLender(lenderId).products;
  }

  /** Returns all products across all registered lenders (aggregated). */
  getAllProducts(): ProductDefinition[] {
    const result: ProductDefinition[] = [];
    for (const lender of this.lenders.values()) {
      result.push(...lender.products);
    }
    return result;
  }

  /** Returns all presets for a specific lender. */
  getPresets(lenderId: string): readonly LenderPreset[] {
    return this.getLender(lenderId).presets;
  }

  /** Resolves a preset by lender ID and preset ID. Returns the matching products. */
  resolvePreset(lenderId: string, presetId: string): ProductDefinition[] {
    const lender = this.getLender(lenderId);
    const preset = lender.presets.find((p) => p.id === presetId);
    if (!preset) {
      const knownIds = lender.presets.map((p) => p.id);
      throw new LenderRegistryError(
        `Unknown preset "${presetId}" for lender "${lenderId}". Known presets: ${knownIds.join(", ") || "(none)"}`,
      );
    }
    const productMap = new Map(lender.products.map((p) => [p.id, p]));
    const result: ProductDefinition[] = [];
    for (const pid of preset.productIds) {
      const product = productMap.get(pid);
      if (!product) {
        throw new LenderRegistryError(
          `Preset "${presetId}" references product "${pid}" not found in lender "${lenderId}"`,
        );
      }
      result.push(product);
    }
    return result;
  }

  /** Whether a lender is already registered. */
  hasLender(lenderId: string): boolean {
    return this.lenders.has(lenderId);
  }

  /** Number of registered lenders. */
  get size(): number {
    return this.lenders.size;
  }

  // -------------------------------------------------------------------------
  // Product-source selection flows
  // -------------------------------------------------------------------------

  /**
   * Resolves a ProductSourceSelection into a concrete product list.
   *
   * - generic: returns all products from all registered lenders.
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
          // Validate that the lender exists
          this.getLender(selection.lenderId);
          // Filter to products matching the lender scope
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
}

// ---------------------------------------------------------------------------
// Default singleton registry
// ---------------------------------------------------------------------------

let defaultRegistry: LenderRegistry | null = null;

/** Returns the shared default registry instance, creating it on first access. */
export function getDefaultRegistry(): LenderRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new LenderRegistry();
  }
  return defaultRegistry;
}

/** Resets the default registry (primarily for testing). */
export function resetDefaultRegistry(): void {
  defaultRegistry = null;
}
