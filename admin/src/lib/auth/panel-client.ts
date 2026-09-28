import type { PanelAccount, PanelAction } from "@/lib/auth/panel-accounts";

const TOKEN_KEY = "anura-admin:panel-jwt:v1";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // sin almacenamiento disponible
  }
}

class PanelApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PanelApiError(res.status, body.message || `Error ${res.status}`);
  return body as T;
}

/** Login real contra auth-service (email + contraseña). No hay Google todavía para el panel. */
export async function login(email: string, password: string): Promise<void> {
  const body = await call<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(body.token);
}

export function logout() {
  setToken(null);
}

/** 403 = el correo tiene sesión válida pero no es cuenta del panel. 401 = el token no sirve. */
export async function me(): Promise<PanelAccount> {
  const body = await call<{ account: PanelAccount }>("/api/panel/me");
  return body.account;
}

export async function listAccounts(): Promise<PanelAccount[]> {
  const body = await call<{ accounts: PanelAccount[] }>("/api/panel/accounts");
  return body.accounts;
}

export async function createAccount(input: {
  name: string;
  email: string;
  template: "administrador" | "herpetologo";
}): Promise<PanelAccount> {
  const body = await call<{ account: PanelAccount }>("/api/panel/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.account;
}

export async function updatePermission(id: string, action: PanelAction, value: boolean): Promise<PanelAccount> {
  const body = await call<{ account: PanelAccount }>(`/api/panel/accounts/${id}/permissions`, {
    method: "PATCH",
    body: JSON.stringify({ action, value }),
  });
  return body.account;
}

export async function removeAccount(id: string): Promise<void> {
  await call<undefined>(`/api/panel/accounts/${id}`, { method: "DELETE" });
}

export { PanelApiError };
