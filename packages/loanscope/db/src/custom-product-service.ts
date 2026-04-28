import type { ProductDefinition } from "@loanscope/domain";
import { Channel, LoanType } from "@loanscope/domain";
import type { LoanScopeDB } from "./connection";
import { createCustomProductSetRepository } from "./repositories/custom-product-set-repository";
import type {
  CreateCustomProductSetInput,
  CustomProductSetRecord,
  CustomProductSetRepository,
  ValidationStatus,
} from "./repositories/custom-product-set-repository";

// ---------------------------------------------------------------------------
// Structural validation
// ---------------------------------------------------------------------------

const LOAN_TYPE_VALUES: ReadonlySet<string> = new Set(Object.values(LoanType));
const CHANNEL_VALUES: ReadonlySet<string> = new Set(Object.values(Channel));

/**
 * Validates that a {@link ProductDefinition} has the minimum structural fields
 * required for persistence. This is *not* a full engine evaluation — it only
 * checks that required identifiers, enums, and the variant list are present
 * and well-formed.
 *
 * @returns An array of human-readable error messages. An empty array means
 *          the product is structurally valid.
 */
export function validateProductStructure(product: ProductDefinition): string[] {
  const errors: string[] = [];

  if (!product.id || product.id.trim().length === 0) {
    errors.push("Product id must be a non-empty string");
  }

  if (!product.name || product.name.trim().length === 0) {
    errors.push("Product name must be a non-empty string");
  }

  if (!LOAN_TYPE_VALUES.has(product.loanType)) {
    errors.push(
      `Invalid loanType "${String(product.loanType)}". ` +
        `Must be one of: ${[...LOAN_TYPE_VALUES].join(", ")}`,
    );
  }

  if (!CHANNEL_VALUES.has(product.channel)) {
    errors.push(
      `Invalid channel "${String(product.channel)}". ` +
        `Must be one of: ${[...CHANNEL_VALUES].join(", ")}`,
    );
  }

  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    errors.push("Product must have at least one variant");
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * High-level service for managing custom product sets. Wraps the low-level
 * {@link CustomProductSetRepository} and adds structural validation on create
 * and re-validate flows.
 */
export class CustomProductService {
  private readonly repo: CustomProductSetRepository;

  constructor(db: LoanScopeDB) {
    this.repo = createCustomProductSetRepository(db);
  }

  /**
   * Create a new custom product set. Each product is structurally validated;
   * the set's `validationStatus` is set to `"valid"` when every product
   * passes, or `"invalid"` when any product fails.
   */
  createSet(input: {
    readonly setId: string;
    readonly name: string;
    readonly lenderId?: string;
    readonly products: readonly ProductDefinition[];
  }): CustomProductSetRecord {
    const status = this.computeValidationStatus(input.products);

    const createInput: CreateCustomProductSetInput =
      input.lenderId !== undefined
        ? {
            setId: input.setId,
            name: input.name,
            lenderId: input.lenderId,
            products: input.products,
          }
        : { setId: input.setId, name: input.name, products: input.products };

    this.repo.create(createInput);

    // The repo creates with "unchecked"; update to the computed status.
    this.repo.updateValidationStatus(input.setId, status);

    // Return the record with the correct status.
    const updated = this.repo.findBySetId(input.setId);
    // findBySetId cannot return undefined here — we just created the row.
    return updated as CustomProductSetRecord;
  }

  /** Retrieve a custom product set by its `setId`. */
  getSet(setId: string): CustomProductSetRecord | undefined {
    return this.repo.findBySetId(setId);
  }

  /** List all custom product sets. */
  listSets(): readonly CustomProductSetRecord[] {
    return this.repo.findAll();
  }

  /**
   * Re-validate the products in an existing set and persist the new status.
   *
   * @throws {Error} if the set does not exist.
   */
  revalidateSet(setId: string): ValidationStatus {
    const record = this.repo.findBySetId(setId);
    if (!record) {
      throw new Error(`Custom product set "${setId}" not found`);
    }

    const status = this.computeValidationStatus(record.products);
    this.repo.updateValidationStatus(setId, status);
    return status;
  }

  /** Delete a custom product set. */
  deleteSet(setId: string): void {
    this.repo.delete(setId);
  }

  /**
   * Convenience accessor: returns the deserialized products for a set.
   *
   * @throws {Error} if the set does not exist.
   */
  getProducts(setId: string): readonly ProductDefinition[] {
    const record = this.repo.findBySetId(setId);
    if (!record) {
      throw new Error(`Custom product set "${setId}" not found`);
    }
    return record.products;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private computeValidationStatus(products: readonly ProductDefinition[]): ValidationStatus {
    for (const product of products) {
      if (validateProductStructure(product).length > 0) {
        return "invalid";
      }
    }
    return "valid";
  }
}
