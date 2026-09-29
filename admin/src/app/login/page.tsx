"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { usePanelSession } from "@/lib/session/panel-session";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = usePanelSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entrada desde la web pública con la sesión que ya tiene (mismo auth-service). El token
  // llega en el fragmento (#token=), que el navegador no envía al servidor, y se borra de la
  // barra de direcciones antes de usarlo para que no quede en el historial.
  useEffect(() => {
    function consumir() {
      const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("token");
      const token = fromHash ?? new URLSearchParams(window.location.search).get("token");
      if (!token) return;
      // Se consume una sola vez: al borrarlo de la URL, una segunda pasada ya no lo ve.
      window.history.replaceState(null, "", window.location.pathname);
      setError(null);
      setLoading(true);
      session
        .loginWithToken(token)
        .then(() => router.replace("/dashboard"))
        .catch((err) => setError(err instanceof Error ? err.message : "No se pudo iniciar sesión"))
        .finally(() => setLoading(false));
    }
    consumir();
    window.addEventListener("hashchange", consumir);
    return () => window.removeEventListener("hashchange", consumir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await session.login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="mb-3">
          <CardTitle>Entrar al panel administrativo</CardTitle>
        </CardHeader>
        <p className="mb-4 text-xs text-label-secondary">
          Usa la misma cuenta que en la app ANURA. Si tu correo no es una cuenta del panel, pídele al súper usuario que
          te agregue en Sistema → Cuentas.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Correo">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Field label="Contraseña">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            <LogIn size={14} /> {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
