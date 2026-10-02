import { SelectedAnuran } from '../types';

export const INITIAL_ANURANS: SelectedAnuran[] = [
  {
    nameCommon: "Rana de Ojos Rojos",
    nameScientific: "Agalychnis callidryas",
    family: "Hylidae",
    confidence: 98.4,
    habitat: "Bosque tropical húmedo (neotrópico), principalmente de hábitos arborícolas nocturnos.",
    description: "Cuerpo de color verde brillante con costados azules y amarillos, patas delanteras y traseras con tonos naranja y unos característicos ojos grandes de color rojo con pupilas verticales.",
    soundDescription: "Canto silbante repetitivo y ruidoso clasificado como 'cluck' o 'chack'.",
    image: "https://images.unsplash.com/photo-1549488344-1f9b8d2bd1f3?auto=format&fit=crop&q=80&w=600"
  },
  {
    nameCommon: "Sapo de Caña (Sapo Marino)",
    nameScientific: "Rhinella marina",
    family: "Bufonidae",
    confidence: 94.1,
    habitat: "Terrestre, habita desde matorrales secos hasta áreas suburbanas y de cultivo húmedas.",
    description: "Espécimen de gran longitud y piel sumamente verrugosa. Posee glándulas parotoides muy grandes detrás de los ojos que secretan bufotoxinas nocivas ante amenazas.",
    soundDescription: "Canto resonante grave similar al rugido rítmico de un motor de combustión pequeño.",
    image: "https://images.unsplash.com/photo-1620055104273-094191fe8c85?auto=format&fit=crop&q=80&w=600"
  },
  {
    nameCommon: "Ranita Meridional",
    nameScientific: "Hyla meridionalis",
    family: "Hylidae",
    confidence: 89.7,
    habitat: "Zonas de vegetación de ribera, lagunas templadas, charcas estacionales y pastizales húmedos.",
    description: "Pequeña rana de color verde claro uniforme, piel muy lisa con ventosas en los dedos para trepar. Una línea oscura se extiende desde las narinas hasta los hombros.",
    soundDescription: "Croar potente, áspero y largo ('craaa-craaa-craaa') que se repite lentamente.",
    image: "https://images.unsplash.com/photo-1579380656108-f98e4df8ea62?auto=format&fit=crop&q=80&w=600"
  },
  {
    nameCommon: "Sapo Común",
    nameScientific: "Bufo bufo",
    family: "Bufonidae",
    confidence: 95.8,
    habitat: "Bosques templados, brezales húmedos, jardines y estanques en Europa y Asia.",
    description: "Cuerpo rollizo de color marrón arcilloso con piel áspera e irregular, ojos con iris cobrizo de pupila horizontal y glándulas parotoides marcadas en ángulo.",
    soundDescription: "Canto agudo similar a un chillido rítmico ('uip-uip-uip') emitido sobre la superficie.",
    image: "https://images.unsplash.com/photo-1504450758481-7338ecc7524a?auto=format&fit=crop&q=80&w=600"
  }
];

export const FLAMESHOT_TIPS = [
  { key: "P", tool: "Lápiz", description: "Dibuja trazos libres en color verde iNaturalist para encerrar detalles.", colorHex: "#4f8f1f" },
  { key: "A", tool: "Flecha", description: "Agrega flechas indicadoras precisas para señalar botones de acción.", colorHex: "#c0392b" },
  { key: "R", tool: "Rectángulo", description: "Enmarca resultados de clasificación de la IA.", colorHex: "#2f7d32" },
  { key: "T", tool: "Texto", description: "Añade notas explicativas rápidas encima de la captura.", colorHex: "#8bcf43" },
  { key: "B", tool: "Difuminador (Blur)", description: "Oculta datos sensibles, como tus API keys o contraseñas secretas.", colorHex: "#62705a" },
  { key: "N", tool: "Contador numérico", description: "Inserta círculos secuenciales numerados (1, 2, 3...) para guiar el flujo del usuario.", colorHex: "#8b6f47" },
];
