import type { Category } from "../types";

/** Shown on first load. */
export const DEFAULT_CATEGORY_IDS = ["gym", "park", "transit", "school", "groceries"];

/** Built-in categories users can toggle on; they can also define their own. */
export const PRESET_CATEGORIES: Category[] = [
  { id: "gym", label: "Gym", icon: "🏋️", tags: ["leisure=fitness_centre"] },
  { id: "park", label: "Park", icon: "🌳", tags: ["leisure=park"] },
  {
    id: "transit",
    label: "Transit stop",
    icon: "🚏",
    // public_transport=station mostly duplicates railway=station, so it's left out.
    tags: ["highway=bus_stop", "railway=station|halt|tram_stop"],
  },
  // Publicly funded schools with EQAO results, from Ontario open data (see src/api/schools.ts).
  { id: "school", label: "School", icon: "🏫", tags: ["amenity=school"], dataset: "schools" },
  { id: "groceries", label: "Groceries", icon: "🛒", tags: ["shop=supermarket|greengrocer"] },
  { id: "pharmacy", label: "Pharmacy", icon: "💊", tags: ["amenity=pharmacy"] },
  { id: "cafe", label: "Café", icon: "☕", tags: ["amenity=cafe"] },
  { id: "library", label: "Library", icon: "📚", tags: ["amenity=library"] },
  { id: "hospital", label: "Hospital", icon: "🏥", tags: ["amenity=hospital"] },
  { id: "playground", label: "Playground", icon: "🛝", tags: ["leisure=playground"] },
  { id: "beach", label: "Beach", icon: "🏖️", tags: ["natural=beach"] },
  {
    id: "downtown",
    label: "Downtown",
    icon: "🏙️",
    tags: [],
    fixed: { lat: 43.6487, lon: -79.3817, name: "King & Bay", detail: "Financial District, Toronto" },
  },
];

export function presetById(id: string): Category | undefined {
  return PRESET_CATEGORIES.find((c) => c.id === id);
}
