import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { TimezoneCookie } from "@/components/timezone-cookie";
import { requireUser } from "@/server/auth";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-full flex-col">
      <TimezoneCookie />
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <Link href="/recipes" className="text-lg font-semibold tracking-tight">
          Foodini
        </Link>
        <form action={signOut} className="flex items-center gap-3 text-sm">
          <span className="hidden text-neutral-500 sm:inline">{user.email}</span>
          <button type="submit" className="text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400">
            Sign out
          </button>
        </form>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <AppNav />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
