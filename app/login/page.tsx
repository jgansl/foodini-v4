import { redirect } from "next/navigation";
import { ClearOfflineData } from "@/components/clear-offline-data";
import { ui } from "@/components/ui";
import { safeNext } from "@/lib/safe-next";
import { getUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  if (await getUser()) redirect(next);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-12">
      {params.signedOut === "1" && <ClearOfflineData />}
      <h1 className={`${ui.h1} mb-2`}>Foodini</h1>
      <p className="mb-6 text-neutral-600 dark:text-neutral-400">Sign in to your recipes and meal plan.</p>
      {params.error === "link" && (
        <p role="alert" className={`${ui.error} mb-4`}>
          That sign-in link is invalid or has expired. Request a new one.
        </p>
      )}
      <LoginForm next={next} />
    </main>
  );
}
