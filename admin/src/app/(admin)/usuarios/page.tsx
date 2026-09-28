import { Suspense } from "react";
import { AppUsers } from "@/components/users/app-users";

export default function UsuariosPage() {
  return (
    <Suspense>
      <AppUsers />
    </Suspense>
  );
}
