/**
 * Policy describing how to derive a single representative FICO score from a
 * set of borrowers in a transaction.
 *
 * Variants:
 * - `LowestMid`: Industry-standard "representative FICO" — for each borrower
 *   take the middle of their three bureau scores (or fall back to
 *   `borrower.fico` when fewer than three are available), then return the
 *   minimum across the included borrowers.
 * - `RepresentativeFico`: Alias of `LowestMid` for v1 (kept distinct in the
 *   union so future investor-specific representative-FICO rules can diverge
 *   without a breaking change).
 * - `WeightedAverage`: Arithmetic mean of `borrower.fico`. When
 *   `incomeWeighted` is true, weights each borrower by the sum of their
 *   `incomes[].monthlyAmount`; when total income across the included set is
 *   zero, falls back to the unweighted mean. `ficoScores` is intentionally
 *   ignored.
 * - `PrimaryOnly`: Returns the FICO of the borrower with the given
 *   `primaryBorrowerId`. The primary borrower must be present in the
 *   included-borrower set.
 */
export type BorrowerBlendPolicy =
  | { readonly kind: "LowestMid" }
  | { readonly kind: "RepresentativeFico" }
  | { readonly kind: "WeightedAverage"; readonly incomeWeighted: boolean }
  | { readonly kind: "PrimaryOnly"; readonly primaryBorrowerId: string };
