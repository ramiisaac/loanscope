import { getAllLenders } from "@loanscope/products";
import { resolveAllProducts, filterDisplayProducts } from "@loanscope/products";
import { LenderCatalog } from "@/components/lenders/lender-catalog";

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

export default function LendersPage() {
  const lenders = getAllLenders();
  const allResolved = resolveAllProducts(lenders.flatMap((l) => l.products));
  const displayProducts = filterDisplayProducts(allResolved);

  // Group resolved display products by lender
  const lenderMap = new Map<string, LenderGroup>();

  for (const lender of lenders) {
    lenderMap.set(lender.id, {
      lenderId: lender.id,
      lenderName: lender.name,
      products: [],
    });
  }

  for (const product of displayProducts) {
    const lenderId = product.lenderId ?? product.channel.toLowerCase();

    // Find matching lender or create an ad-hoc group
    let group = lenderMap.get(lenderId);
    if (!group) {
      // Try matching by channel-based lender id
      for (const [id, g] of lenderMap.entries()) {
        if (id === lenderId || lenderId.startsWith(id)) {
          group = g;
          break;
        }
      }
    }
    if (!group) {
      group = {
        lenderId,
        lenderName: lenderId,
        products: [],
      };
      lenderMap.set(lenderId, group);
    }

    // Collect unique program kinds and terms from variants
    const programKinds = [...new Set(product.variants.map((v) => v.programKind))];
    const terms = [...new Set(product.variants.flatMap((v) => v.terms))].sort((a, b) => a - b);

    const info: ProductInfo = {
      id: product.id,
      name: product.name,
      loanType: product.loanType,
      channel: product.channel,
      programKinds,
      terms,
      hasExtends: product.extends !== undefined,
    };

    group.products.push(info);
  }

  // Convert to sorted array, filter out empty lenders
  const lenderGroups: LenderGroup[] = [...lenderMap.values()]
    .filter((g) => g.products.length > 0)
    .sort((a, b) => a.lenderName.localeCompare(b.lenderName));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lender Catalog</h1>
        <p className="text-muted-foreground mt-1">
          Browse all available lenders and their product offerings. Expand a lender to see product
          details including loan type, channel, program kinds, and supported terms.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">Lenders:</span>
          <span>{lenderGroups.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Products:</span>
          <span>{displayProducts.length}</span>
        </div>
      </div>
      <LenderCatalog lenders={lenderGroups} />
    </div>
  );
}
