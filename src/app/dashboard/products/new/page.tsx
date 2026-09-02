import type { Metadata } from "next";
import { ProductForm } from "@/components/vendor/ProductForm";
import { createProduct } from "@/lib/actions/products";

export const metadata: Metadata = { title: "Add a product" };

export default function NewProductPage() {
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Add a product</h1>
        <p className="mt-1 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
          Upload your work, suggest a price, and choose how people may use it.
          You can save a draft and come back to it.
        </p>
      </header>
      <ProductForm action={createProduct} />
    </div>
  );
}
