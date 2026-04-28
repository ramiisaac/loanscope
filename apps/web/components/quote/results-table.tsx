"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Badge } from "@workspace/ui/components/badge";
import type { SerializableResult } from "@/app/quote/actions";

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}%`;
}

export function ResultsTable({ results }: { results: SerializableResult[] }) {
  if (results.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No results. Adjust inputs and evaluate.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead className="w-24 text-center">Eligible</TableHead>
          <TableHead className="w-20 text-right">LTV</TableHead>
          <TableHead className="w-20 text-right">DTI</TableHead>
          <TableHead className="w-28 text-right">Mo. Payment</TableHead>
          <TableHead>Fail Reasons</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={result.productId} className={result.eligible ? undefined : "opacity-70"}>
            <TableCell className="font-medium">{result.productName}</TableCell>
            <TableCell className="text-center">
              {result.eligible ? (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Pass</Badge>
              ) : (
                <Badge variant="destructive">Fail</Badge>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatPercent(result.ltv)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatPercent(result.dti)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(result.monthlyPayment)}
            </TableCell>
            <TableCell>
              {result.failReasons.length > 0 ? (
                <span className="text-xs text-destructive">{result.failReasons.join("; ")}</span>
              ) : result.warnings.length > 0 ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {result.warnings.join("; ")}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
