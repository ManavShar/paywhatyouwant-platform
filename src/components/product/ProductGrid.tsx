import { ProductCard, type ProductCardData } from "./ProductCard";

/**
 * Masonry is CSS multi-column rather than a JS layout library. That means no
 * measurement pass, so images never reflow or jump once they load — which is
 * the single most noticeable flaw in image-heavy grids.
 *
 * The tradeoff is that multi-column orders items top-to-bottom within a column
 * rather than left-to-right across the row. For an unranked browse wall that
 * is imperceptible; for anything order-sensitive, use the uniform variant.
 */
export function ProductGrid({
  products,
  variant = "uniform",
  priorityCount = 4,
}: {
  products: ProductCardData[];
  variant?: "masonry" | "uniform";
  /** Images above the fold get eager loading; the rest stay lazy. */
  priorityCount?: number;
}) {
  if (products.length === 0) return null;

  if (variant === "masonry") {
    return (
      <div className="masonry columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
        {products.map((p, i) => (
          <ProductCard
            key={p.slug}
            product={p}
            variant="masonry"
            priority={i < priorityCount}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p, i) => (
        <ProductCard key={p.slug} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
