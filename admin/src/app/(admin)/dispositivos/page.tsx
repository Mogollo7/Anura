import { Suspense } from "react";
import { AppDevices } from "@/components/devices/app-devices";

export default function DispositivosPage() {
  return (
    <Suspense>
      <AppDevices />
    </Suspense>
  );
}
