import { Suspense } from "react";
import { ObservationsReview } from "@/components/observations/observations-review";

export default function ObservacionesPage() {
  return (
    <Suspense>
      <ObservationsReview />
    </Suspense>
  );
}
