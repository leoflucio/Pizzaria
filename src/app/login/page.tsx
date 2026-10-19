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
        <div className="-mx-6 -mt-6 grid place-items-center gap-2 rounded-t-2xl border-b-4 border-brand bg-ink px-6 py-5">
          <img src="/logo.png" alt="Pizzaria D'Napoles" className="h-28 w-auto" />
          <h1 className="text-lg font-extrabold text-gold">Painel da rede</h1>
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
