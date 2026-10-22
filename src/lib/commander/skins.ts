// CommanderBG skins (Tim, 2026-10-21). Shared by the store, the game and the
// share pictures. A skin sets two colors: your ground ("me") and the enemy's
// ("them"). Seasonal skins (characters + art) come later and go in this list.
//
// Prices are in cents. "all" unlocks every skin forever, future ones included.
// The colorblind-friendly skin is free — accessibility is never for sale.

export type SkinId = string;
export type Skin = {
  id: SkinId;
  name: string;
  blurb: string;
  kind: "free" | "color" | "custom";
  price: number; // cents; 0 = free
  me: string;
  them: string;
};

export const SKINS: Skin[] = [
  { id: "classic", name: "Classic", blurb: "Your team's colors", kind: "free", price: 0, me: "", them: "" },
  { id: "clearsight", name: "Clear Sight", blurb: "Colorblind-friendly blue and orange", kind: "free", price: 0, me: "#0072b2", them: "#e69f00" },
  { id: "arctic", name: "Arctic", blurb: "Ice against the long night", kind: "color", price: 500, me: "#7cc8f2", them: "#2f3b5c" },
  { id: "jungle", name: "Jungle", blurb: "Canopy green, river mud", kind: "color", price: 500, me: "#3f9e4a", them: "#7a4e36" },
  { id: "desert", name: "Desert Storm", blurb: "Sand and scorched rock", kind: "color", price: 500, me: "#d9a85b", them: "#7d3f2b" },
  { id: "navy", name: "Navy", blurb: "Deep blue, battleship gray", kind: "color", price: 500, me: "#1f4fa0", them: "#8b95a3" },
  { id: "crimson", name: "Crimson", blurb: "Red banners, iron fields", kind: "color", price: 500, me: "#c62828", them: "#3e4a52" },
  { id: "royal", name: "Royal", blurb: "Purple and gold", kind: "color", price: 500, me: "#6a3fb5", them: "#c99a1a" },
  { id: "neon", name: "Neon", blurb: "Arcade cyan and hot pink", kind: "color", price: 500, me: "#00c6e0", them: "#e8287a" },
  { id: "sunset", name: "Sunset", blurb: "Orange sky, violet dusk", kind: "color", price: 500, me: "#f07a33", them: "#5b2a86" },
  { id: "midnight", name: "Midnight", blurb: "Electric blue in the dark", kind: "color", price: 500, me: "#3d5afe", them: "#2a2a2e" },
  { id: "camo", name: "Camo", blurb: "Olive drab and khaki", kind: "color", price: 500, me: "#5f6e3a", them: "#a88f63" },
  { id: "custom", name: "Your Colors", blurb: "Pick any two colors", kind: "custom", price: 1000, me: "#356fd0", them: "#d23b3b" },
];

/** Every skin, forever — including skins that don't exist yet. */
export const ALL_ACCESS = { id: "all", name: "All Skins, Forever", price: 10000 };

export const skinById = (id: string | null | undefined) => SKINS.find((s) => s.id === id) ?? null;
export const isHex = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

/** What a store item costs, or null when it isn't for sale. */
export function priceOf(item: string): number | null {
  if (item === ALL_ACCESS.id) return ALL_ACCESS.price;
  const s = skinById(item);
  return s && s.price > 0 ? s.price : null;
}

export const owns = (owned: string[], id: string) => skinById(id)?.price === 0 || owned.includes(id) || owned.includes(ALL_ACCESS.id);

/** The two colors to paint with: the skin's, your custom pair, or your team's. */
export function skinColors(skin: string | null | undefined, custom: { me?: string; them?: string } | null | undefined, side: "red" | "blue") {
  const team = side === "red" ? { me: "#d23b3b", them: "#356fd0" } : { me: "#356fd0", them: "#d23b3b" };
  if (skin === "custom" && custom && isHex(custom.me) && isHex(custom.them)) return { me: custom.me, them: custom.them };
  const s = skinById(skin);
  return s && s.me ? { me: s.me, them: s.them } : team;
}
