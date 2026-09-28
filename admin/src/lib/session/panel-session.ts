"use client";

import { useSyncExternalStore } from "react";
import type { PanelAccount, PanelAction } from "@/lib/auth/panel-accounts";
import * as panelClient from "@/lib/auth/panel-client";

/**
 * Sesión del panel: login contra auth-service, cuentas y permisos en Postgres
 * (auth.panel_accounts), cada cambio va a audit.log. No hay modo demostración:
 * sin token válido el panel no muestra nada y `SessionGate` manda a /login.
 * Si el servidor no responde, el token se conserva para reintentar — nunca se
 * entra como otra cuenta.
 */
type Status = "cargando" | "sin-sesion" | "real";

type State = {
  status: Status;
  me: PanelAccount | null;
  accounts: PanelAccount[];
  error: string | null;
  /** 401 = token vencido o falso; 403 = sesión válida pero no es cuenta del panel; 0 = sin servidor. */
  errorStatus: number | null;
};

// El servidor no tiene token: renderiza "cargando" para que la hidratación coincida.
const INITIAL: State = { status: "cargando", me: null, accounts: [], error: null, errorStatus: null };

let state: State = INITIAL;
const listeners = new Set<() => void>();

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

let initialized = false;
function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if (panelClient.getToken()) {
    void refresh();
  } else {
    setState({ status: "sin-sesion" });
  }
}

async function refresh() {
  try {
    const account = await panelClient.me();
    const accounts = account.permissions.gestionarCuentas || account.isSuperAdmin ? await panelClient.listAccounts() : [account];
    setState({ status: "real", me: account, accounts, error: null, errorStatus: null });
  } catch (err) {
    const rejected = err instanceof panelClient.PanelApiError && (err.status === 401 || err.status === 403);
    if (rejected) panelClient.logout();
    const status = err instanceof panelClient.PanelApiError ? err.status : 0;
    const message = err instanceof panelClient.PanelApiError ? err.message : "No hay conexión con el servidor del panel.";
    setState({ status: "sin-sesion", me: null, accounts: [], error: message, errorStatus: status });
  }
}

async function login(email: string, password: string) {
  await panelClient.login(email, password);
  await refresh();
  if (state.status !== "real") throw new Error(state.error ?? "No se pudo iniciar sesión");
}

/** Entrada desde la web pública con la sesión que ya tiene (mismo auth-service). */
async function loginWithToken(token: string) {
  panelClient.setToken(token);
  await refresh();
  if (state.status === "real") return;
  throw new Error(
    state.errorStatus === 401
      ? "El enlace para entrar ya no sirve. Inicia sesión con tu correo y contraseña."
      : (state.error ?? "No se pudo iniciar sesión")
  );
}

function logout() {
  panelClient.logout();
  setState({ status: "sin-sesion", me: null, accounts: [], error: null, errorStatus: null });
}

export function usePanelSession() {
  ensureInit();
  const s = useSyncExternalStore(subscribe, getSnapshot, () => INITIAL);
  const isReal = s.status === "real";
  const acting = isReal ? (s.me ?? undefined) : undefined;

  return {
    isReal,
    cargando: s.status === "cargando",
    error: s.error,
    accounts: s.accounts,
    acting,
    can(action: PanelAction) {
      return !!acting && (acting.isSuperAdmin || !!acting.permissions[action]);
    },
    login,
    loginWithToken,
    logout,
    refresh,
    async createAccount(input: { name: string; email: string; template: "administrador" | "herpetologo" }) {
      const account = await panelClient.createAccount(input);
      setState({ accounts: [...state.accounts, account] });
    },
    async togglePermission(accountId: string, action: PanelAction) {
      const target = state.accounts.find((a) => a.id === accountId);
      if (!target) return;
      const account = await panelClient.updatePermission(accountId, action, !target.permissions[action]);
      setState({ accounts: state.accounts.map((a) => (a.id === accountId ? account : a)) });
    },
    async removeAccount(id: string) {
      await panelClient.removeAccount(id);
      setState({ accounts: state.accounts.filter((a) => a.id !== id) });
    },
  };
}
