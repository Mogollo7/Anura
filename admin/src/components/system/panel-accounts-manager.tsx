"use client";

import { useState } from "react";
import { Crown, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { PANEL_ACTIONS, PANEL_ACTION_LABEL, type PanelAction } from "@/lib/auth/panel-accounts";
import { usePanelSession } from "@/lib/session/panel-session";

export function PanelAccountsManager() {
  const session = usePanelSession();
  const accounts = session.accounts;
  const canManage = session.can("gestionarCuentas");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [template, setTemplate] = useState<"administrador" | "herpetologo">("herpetologo");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const superAdmins = accounts.filter((a) => a.isSuperAdmin);

  async function togglePermission(accountId: string, action: PanelAction) {
    if (!canManage) return;
    await session.togglePermission(accountId, action);
  }

  async function createAccount() {
    if (!name.trim() || !email.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      await session.createAccount({ name: name.trim(), email: email.trim(), template });
      setCreateOpen(false);
      setName("");
      setEmail("");
      setTemplate("herpetologo");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount(id: string) {
    if (!canManage) return;
    await session.removeAccount(id);
  }

  return (
    <Card>
      <CardHeader className="mb-3">
        <CardTitle className="flex items-center gap-2">
          Cuentas del panel administrativo
        </CardTitle>
        <Button variant="outline" className="text-xs" onClick={() => setCreateOpen(true)} disabled={!canManage}>
          <Plus size={13} /> Crear cuenta
        </Button>
      </CardHeader>

      {!canManage && (
        <p className="mb-3 text-xs text-label-tertiary">
          {session.acting?.name} no tiene el permiso &quot;Administrar cuentas del panel&quot;: puede ver las cuentas, no
          cambiarlas.
        </p>
      )}

      {superAdmins.length <= 1 && (
        <p className="mb-3 flex items-center gap-1.5 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          <Crown size={13} /> Solo hay un super usuario. No es degradable ni suspendible — si pierde acceso, nadie puede
          crear ni administrar otras cuentas del panel.
        </p>
      )}

      <ul className="space-y-2">
        {accounts.map((acc) => (
          <li key={acc.id} className="rounded-md border border-border">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {acc.isSuperAdmin && <Crown size={13} className="text-warning" />}
                  {acc.name}
                </p>
                <p className="text-xs text-label-tertiary">{acc.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={acc.isSuperAdmin ? "warning" : "neutral"}>
                  {acc.isSuperAdmin ? "Super usuario" : "Cuenta con permisos por acción"}
                </Badge>
                <Button
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setExpanded(expanded === acc.id ? null : acc.id)}
                >
                  <ShieldCheck size={13} /> {expanded === acc.id ? "Ocultar permisos" : "Ver permisos"}
                </Button>
                {!acc.isSuperAdmin && canManage && (
                  <Button variant="ghost" className="text-xs text-danger" onClick={() => removeAccount(acc.id)}>
                    <Trash2 size={13} />
                  </Button>
                )}
              </div>
            </div>
            {expanded === acc.id && (
              <div className="grid grid-cols-1 gap-1.5 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
                {PANEL_ACTIONS.map((action) => (
                  <label
                    key={action}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                      acc.isSuperAdmin || !canManage ? "text-label-tertiary" : "cursor-pointer hover:bg-surface-subtle"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={acc.permissions[action]}
                      disabled={acc.isSuperAdmin || !canManage}
                      onChange={() => togglePermission(acc.id, action)}
                    />
                    {PANEL_ACTION_LABEL[action]}
                  </label>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogHeader
          title="Crear cuenta del panel"
          description="Entra con el mismo correo y contraseña que usa en ANURA Mobile. Si todavía no tiene cuenta, que se registre en la app con este correo: queda ligada la primera vez que entre aquí. La plantilla solo precarga permisos; ajústalos por acción después."
        />
        <div className="space-y-3">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo" />
          </Field>
          <Field label="Correo">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@anura.org" type="email" />
          </Field>
          <Field label="Plantilla inicial">
            <Select value={template} onChange={(e) => setTemplate(e.target.value as typeof template)}>
              <option value="herpetologo">Herpetólogo</option>
              <option value="administrador">Administrador técnico</option>
            </Select>
          </Field>
          {formError && <p className="text-xs text-danger">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={createAccount} disabled={busy}>
              {busy ? "Creando…" : "Crear"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
