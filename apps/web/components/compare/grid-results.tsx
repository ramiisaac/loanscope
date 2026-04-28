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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";
import type { CompareResult, CompareProductCell } from "@/app/compare/actions";

interface GridResultsProps {
  result: CompareResult;
}

function EligibilityBadge({ eligible }: { eligible: boolean | null }) {
  if (eligible === null) {
    return (
      <Badge variant="outline" className="gap-1">
        <AlertCircle className="size-3" />
        N/A
      </Badge>
    );
  }
  if (eligible) {
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle className="size-3" />
        Pass
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="size-3" />
      Fail
    </Badge>
  );
}

function formatCurrency(value: number | null): string {
  if (value === null) return "--";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "--";
  return `${(value * 100).toFixed(2)}%`;
}

function ProductCell({ cell }: { cell: CompareProductCell }) {
  return (
    <div className="space-y-1">
      <EligibilityBadge eligible={cell.eligible} />
      {cell.monthlyPayment !== null && (
        <div className="text-xs text-muted-foreground">
          {formatCurrency(cell.monthlyPayment)}/mo
        </div>
      )}
      {cell.dti !== null && (
        <div className="text-xs text-muted-foreground">DTI: {formatPercent(cell.dti)}</div>
      )}
    </div>
  );
}

export function GridResults({ result }: GridResultsProps) {
  if (result.error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Comparison Error</CardTitle>
          <CardDescription>{result.error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (result.rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Results</CardTitle>
          <CardDescription>
            No comparison data was generated. Try adjusting your parameters.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { summary } = result;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{summary.totalCells}</div>
            <div className="text-xs text-muted-foreground">Total Cells</div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-emerald-600">{summary.passCount}</div>
            <div className="text-xs text-muted-foreground">Eligible</div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-destructive">{summary.failCount}</div>
            <div className="text-xs text-muted-foreground">Ineligible</div>
          </CardContent>
        </Card>
        {summary.errorCount > 0 && (
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-yellow-600">{summary.errorCount}</div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comparison Grid</CardTitle>
          <CardDescription>
            Products evaluated across the sweep dimension. Green = eligible, Red = ineligible.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[100px]">
                    Dimension
                  </TableHead>
                  {result.headers.map((header) => (
                    <TableHead key={header} className="min-w-[150px]">
                      <div className="truncate max-w-[180px]" title={header}>
                        {header}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.dimension}>
                    <TableCell className={cn("sticky left-0 bg-background z-10 font-medium")}>
                      {row.dimension}
                    </TableCell>
                    {row.products.map((cell) => (
                      <TableCell key={cell.productId}>
                        <ProductCell cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
