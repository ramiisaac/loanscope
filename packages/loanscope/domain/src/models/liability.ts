import { LiabilityType } from "../enums";
import { Money } from "../primitives";

export interface Liability {
  id: string;
  type: LiabilityType;
  borrowerIds: string[];
  monthlyPayment: Money;
  unpaidBalance?: Money;
  includeInDTI?: boolean;
  payoffAtClose?: boolean;
  payoffAmount?: Money;
  accountLast4?: string;
  notes?: string;
}
