"use client";

import { Badge } from "@workspace/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { CheckCircle, XCircle, ArrowRight, DollarSign } from "lucide-react";
import type { SimulateResult, SimulateFixResult } from "@/app/simulate/actions";

interface SimulationResultsProps {
  result: SimulateResult;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function FixCard({ fix }: { fix: SimulateFixResult }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{fix.productName}</CardTitle>
          {fix.eligible ? (
            <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
              <CheckCircle className="size-3" />
              Fixable
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="size-3" />
              Not Fixable
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs font-mono">{fix.productId}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {fix.actions.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">Required Actions</h4>
            <ul className="space-y-1">
              {fix.actions.map((action, i) => (
                <li key={`${action}-${String(i)}`} className="flex items-start gap-2 text-sm">
                  <ArrowRight className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1 border-t">
          <DollarSign className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">
            Cash required: {formatCurrency(fix.cashRequired)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function SimulationResults({ result }: SimulationResultsProps) {
  if (result.error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Simulation Error</CardTitle>
          <CardDescription>{result.error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fixableCount = result.fixes.filter((f) => f.eligible).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{result.statesExplored}</div>
            <div className="text-xs text-muted-foreground">States Explored</div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-emerald-600">{fixableCount}</div>
            <div className="text-xs text-muted-foreground">Products Fixed</div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold capitalize">{result.terminated}</div>
            <div className="text-xs text-muted-foreground">Termination</div>
          </CardContent>
        </Card>
      </div>

      {result.fixes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Fixes Found</CardTitle>
            <CardDescription>
              The simulation could not find actions to make any additional products eligible. Try
              adjusting your scenario or increasing the max actions depth.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div>
          <h2 className="text-lg font-semibold mb-3">Per-Product Fixes ({result.fixes.length})</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.fixes.map((fix) => (
              <FixCard key={fix.productId} fix={fix} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
