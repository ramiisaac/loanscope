"use client";

import { useState, useTransition } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Separator } from "@workspace/ui/components/separator";
import { runQuote } from "@/app/quote/actions";
import type { QuoteInput, SerializableResult } from "@/app/quote/actions";
import { ResultsTable } from "@/components/quote/results-table";

const loanPurposeOptions = [
  { value: "Purchase", label: "Purchase" },
  { value: "RateTermRefi", label: "Rate/Term Refinance" },
  { value: "CashOutRefi", label: "Cash-Out Refinance" },
] as const;

const occupancyOptions = [
  { value: "Primary", label: "Primary Residence" },
  { value: "Secondary", label: "Second Home" },
  { value: "Investment", label: "Investment Property" },
] as const;

const propertyTypeOptions = [
  { value: "SFR", label: "Single Family" },
  { value: "Condo", label: "Condo" },
  { value: "Townhome", label: "Townhome" },
  { value: "MultiUnit", label: "Multi-Unit" },
  { value: "Manufactured", label: "Manufactured" },
  { value: "CoOp", label: "Co-Op" },
  { value: "Leasehold", label: "Leasehold" },
  { value: "PUD", label: "PUD" },
] as const;

const unitOptions = [
  { value: "1", label: "1 Unit" },
  { value: "2", label: "2 Units" },
  { value: "3", label: "3 Units" },
  { value: "4", label: "4 Units" },
] as const;

const defaultInputs: QuoteInput = {
  loanAmount: 800000,
  purchasePrice: 1000000,
  fico: 740,
  monthlyIncome: 15000,
  noteRate: 6.5,
  occupancy: "Primary",
  loanPurpose: "Purchase",
  propertyType: "SFR",
  units: 1,
};

export function QuoteForm() {
  const [inputs, setInputs] = useState<QuoteInput>(defaultInputs);
  const [results, setResults] = useState<SerializableResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(field: keyof QuoteInput, raw: string) {
    setInputs((prev) => {
      const numericFields: ReadonlyArray<keyof QuoteInput> = [
        "loanAmount",
        "purchasePrice",
        "fico",
        "monthlyIncome",
        "noteRate",
        "units",
      ];
      if (numericFields.includes(field)) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          return { ...prev, [field]: parsed };
        }
        return prev;
      }
      return { ...prev, [field]: raw };
    });
  }

  function handleEvaluate() {
    setError(null);
    startTransition(async () => {
      const result = await runQuote(inputs);
      if (result.error) {
        setError(result.error);
        setResults(null);
      } else {
        setResults(result.results);
        setError(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Loan Details */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Loan Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="loanAmount">Loan Amount ($)</Label>
              <Input
                id="loanAmount"
                type="number"
                min={0}
                step={1000}
                value={inputs.loanAmount}
                onChange={(e) => handleChange("loanAmount", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="purchasePrice">Purchase Price ($)</Label>
              <Input
                id="purchasePrice"
                type="number"
                min={0}
                step={1000}
                value={inputs.purchasePrice}
                onChange={(e) => handleChange("purchasePrice", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="loanPurpose">Loan Purpose</Label>
              <Select
                value={inputs.loanPurpose}
                onValueChange={(v) => handleChange("loanPurpose", v)}
              >
                <SelectTrigger id="loanPurpose" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {loanPurposeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Property */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Property</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="propertyType">Property Type</Label>
              <Select
                value={inputs.propertyType}
                onValueChange={(v) => handleChange("propertyType", v)}
              >
                <SelectTrigger id="propertyType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {propertyTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="occupancy">Occupancy</Label>
              <Select value={inputs.occupancy} onValueChange={(v) => handleChange("occupancy", v)}>
                <SelectTrigger id="occupancy" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {occupancyOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="units">Units</Label>
              <Select value={String(inputs.units)} onValueChange={(v) => handleChange("units", v)}>
                <SelectTrigger id="units" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Borrower */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Borrower</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="fico">FICO Score</Label>
              <Input
                id="fico"
                type="number"
                min={300}
                max={850}
                value={inputs.fico}
                onChange={(e) => handleChange("fico", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="monthlyIncome">Monthly Income ($)</Label>
              <Input
                id="monthlyIncome"
                type="number"
                min={0}
                step={500}
                value={inputs.monthlyIncome}
                onChange={(e) => handleChange("monthlyIncome", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Rate */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Rate</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="noteRate">Note Rate (%)</Label>
              <Input
                id="noteRate"
                type="number"
                min={0}
                max={20}
                step={0.125}
                value={inputs.noteRate}
                onChange={(e) => handleChange("noteRate", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={handleEvaluate} disabled={isPending}>
          {isPending ? "Evaluating…" : "Evaluate"}
        </Button>
        {results !== null && !isPending && (
          <span className="text-sm text-muted-foreground">
            {results.filter((r) => r.eligible).length} of {results.length} products eligible
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {results !== null && (
        <>
          <Separator />
          <ResultsTable results={results} />
        </>
      )}
    </div>
  );
}
