import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { SessionGate } from "@/components/layout/session-gate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <div className="flex h-full bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </SessionGate>
  );
}
