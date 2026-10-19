import { redirect } from "next/navigation";
import { getSession, login } from "@/server/auth";

export const dynamic = "force-dynamic";

async function doLogin(formData: FormData) {
  "use server";
  const ok = await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  redirect(ok ? "/painel" : "/login?erro=1");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await getSession()) redirect("/painel");
  const { erro } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form action={doLogin} className="card grid w-full max-w-sm gap-4 p-6">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10 rounded-xl" />
          <h1 className="text-xl font-extrabold">Painel D&apos;Napoles</h1>
        </div>
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" className="input" required autoComplete="username" />
        </div>
        <div>
          <label className="label" htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
        </div>
        {erro && <p className="text-sm text-red-700" role="alert">E-mail ou senha incorretos.</p>}
        <button className="btn-primary">Entrar</button>
      </form>
    </main>
  );
}
