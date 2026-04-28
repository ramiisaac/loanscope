import { AssetType } from "../enums";
import { Money, Ratio } from "../primitives";

export interface Asset {
  id: string;
  type: AssetType;
  ownerBorrowerIds: string[];
  amount: Money;
  liquidityRank?: number;
  canUseForClose?: boolean;
  canUseForReserves?: boolean;
  haircutRatio?: Ratio;
  accountLast4?: string;
  notes?: string;
}
