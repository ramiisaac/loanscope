import { IncomeStream } from "./income";

export interface Borrower {
  id: string;
  fico: number;
  incomes: IncomeStream[];
  ficoScores?: number[];
  displayName?: string;
  isFirstTimeHomebuyer?: boolean;
  isSelfEmployed?: boolean;
  isNonOccupantCoBorrower?: boolean;
}
