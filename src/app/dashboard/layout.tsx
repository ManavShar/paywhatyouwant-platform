import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { DashboardNav } from "@/components/vendor/DashboardNav";

/**
 * Every dashboard route is guarded here rather than page by page.
 *
 * A layout guard is the right place because it cannot be forgotten when a new
 * page is added — the alternative (a check per page) fails open the moment
 * someone adds a route and doesn't copy the boilerplate.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin?next=/dashboard");

  // Buyers have accounts too; the dashboard is only for people selling.
  if (user.role === UserRole.BUYER) redirect("/sell");

  return (
    <>
      <SiteHeader showSearch={false} />
      <div className="mx-auto flex max-w-[1500px] flex-col gap-8 px-4 py-6 sm:px-6 lg:flex-row lg:gap-10 lg:py-10">
        <DashboardNav username={user.username} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
