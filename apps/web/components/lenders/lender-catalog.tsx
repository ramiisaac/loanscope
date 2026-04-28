"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardHeader, CardTitle } from "@workspace/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Building2, Package } from "lucide-react";

interface ProductInfo {
  id: string;
  name: string;
  loanType: string;
  channel: string;
  programKinds: string[];
  terms: number[];
  hasExtends: boolean;
}

interface LenderGroup {
  lenderId: string;
  lenderName: string;
  products: ProductInfo[];
}

interface LenderCatalogProps {
  lenders: LenderGroup[];
}

function formatTerm(months: number): string {
  const years = months / 12;
  return `${years}yr`;
}

export function LenderCatalog({ lenders }: LenderCatalogProps) {
  if (lenders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Lenders Found</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Accordion type="multiple" className="space-y-3">
      {lenders.map((lender) => (
        <AccordionItem
          key={lender.lenderId}
          value={lender.lenderId}
          className="border rounded-lg px-4"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <Building2 className="size-5 text-muted-foreground" />
              <div className="text-left">
                <div className="font-semibold">{lender.lenderName}</div>
                <div className="text-xs text-muted-foreground font-normal">
                  {lender.products.length} product
                  {lender.products.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Loan Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Program(s)</TableHead>
                  <TableHead>Terms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lender.products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Package className="size-3.5 text-muted-foreground" />
                        {product.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{product.id}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{product.loanType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{product.channel}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {product.programKinds.map((kind) => (
                          <Badge key={kind} variant="outline" className="text-xs">
                            {kind}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {product.terms.map((term) => (
                          <Badge key={term} variant="secondary" className="text-xs">
                            {formatTerm(term)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
