/**
 * Ayudas del alta de especie que solo miran el texto que se escribe. La validación de verdad
 * (binomial, familia, coherencia del género, duplicados) la hace dataset-service
 * (services/dataset-service/src/especies.js): aquí no se repite, solo se muestra su mensaje.
 */

/** "boana  boans" → "Boana". Vacío mientras aún no hay una palabra que parezca un género. */
export function generoDelNombre(texto: string): string | null {
  const primera = texto.trim().split(/\s+/)[0] ?? "";
  if (!/^[A-Za-z]{3,}$/.test(primera)) return null;
  return primera.charAt(0).toUpperCase() + primera.slice(1).toLowerCase();
}

/** Enlace estable a una especie: "Boana boans" → "boana-boans" (?especie= también acepta el id). */
export const slugEspecie = (nombre: string) => nombre.trim().toLowerCase().replace(/\s+/g, "-");
