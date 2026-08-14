import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { CATEGORIES } from "@/lib/taxonomy";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-hairline bg-surface">
      <div className="mx-auto max-w-[1600px] px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo showTagline />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
              The world&apos;s first completely pay-what-you-want digital
              marketplace. You decide what the work is worth.
            </p>
          </div>

          <FooterColumn title="Browse">
            {CATEGORIES.map((c) => (
              <FooterLink key={c.slug} href={`/category/${c.slug}`}>
                {c.label}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Creators">
            <FooterLink href="/sell">Sell your work</FooterLink>
            <FooterLink href="/how-it-works">How it works</FooterLink>
            <FooterLink href="/dashboard">Vendor dashboard</FooterLink>
            <FooterLink href="/research">The research behind it</FooterLink>
          </FooterColumn>

          <FooterColumn title="Company">
            <FooterLink href="/about">About</FooterLink>
            <FooterLink href="/contact">Contact</FooterLink>
            <FooterLink href="/terms">Terms &amp; conditions</FooterLink>
            <FooterLink href="/privacy">Privacy policy</FooterLink>
          </FooterColumn>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-hairline pt-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Paywhatyouwant.io</p>
          <p>Founded by Max Rangeley</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-subtle">
        {title}
      </h2>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-ink-muted transition-colors hover:text-ink"
      >
        {children}
      </Link>
    </li>
  );
}
