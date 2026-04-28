export interface TransactionVariant {
  id: string;
  label: string;
  includedBorrowerIds: string[];
  includeAssetIds?: string[];
  includeLiabilityIds?: string[];
  forcePayoffLiabilityIds?: string[];
  excludeAssetIds?: string[];
  actionNotes?: string;
}
