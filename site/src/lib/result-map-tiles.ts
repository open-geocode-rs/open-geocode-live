// Draw OpenFreeMap vector tiles using the API result map palette.

import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const TILEJSON = "https://tiles.openfreemap.org/planet";
// The tiles' most detailed level: streets, buildings, house numbers. Deeper zooms
// draw these tiles larger.
export const MAX_Z = 14;
// The credit the tiles' and the map data's licences require wherever a map shows.
export const CREDIT = "© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors";

export type Palette = Record<"water" | "waterway" | "park" | "landcover" | "building" | "buildingEdge" | "path" | "rail" | "roadMinor" | "roadMid" | "roadMajor" | "label" | "placeLabel" | "labelHalo", string>;

// Bottom to top. Roads go from minor to major, so a major road is drawn over the
// streets it crosses.
type Paint = { layer: string; classes?: string[]; fill?: keyof Palette; stroke?: keyof Palette; width?: number; dash?: number[] };
const PAINT: Paint[] = [
  { layer: "landcover", classes: ["grass", "wood", "farmland"], fill: "landcover" },
  { layer: "park", fill: "park" },
  { layer: "water", fill: "water" },
  { layer: "waterway", stroke: "waterway", width: 1.25 },
  { layer: "building", fill: "building", stroke: "buildingEdge", width: 0.75 },
  { layer: "transportation", classes: ["path", "track"], stroke: "path", width: 1, dash: [1, 3] },
  { layer: "transportation", classes: ["rail", "transit"], stroke: "rail", width: 1, dash: [6, 4] },
  { layer: "transportation", classes: ["minor", "service"], stroke: "roadMinor", width: 1.25 },
  { layer: "transportation", classes: ["secondary", "tertiary"], stroke: "roadMid", width: 2 },
  { layer: "transportation", classes: ["motorway", "trunk", "primary"], stroke: "roadMajor", width: 2.75 },
];

// A slow tile server never holds a request open: past this the map is skipped.
const TIMEOUT = 8000;

// The tile URL carries a data version that changes on each release, so it's read
// from the TileJSON rather than written down. A failed read is retried next time.
let template: Promise<string> | undefined;
const tileTemplate = () =>
  (template ??= fetch(TILEJSON, { signal: AbortSignal.timeout(TIMEOUT) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`TileJSON: ${response.status}`);
      const { tiles } = await response.json();
      const url = Array.isArray(tiles) ? tiles[0] : undefined;
      if (typeof url !== "string" || !["{z}", "{x}", "{y}"].every((part) => url.includes(part))) {
        throw new Error("TileJSON has no tile URL template");
      }
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Invalid tile URL protocol");
      return url;
    })
    .catch((error) => {
      template = undefined;
      throw error;
    }));

// Streets are named along their longest straight stretch, so the name can sit on
// it; places at their point. Lower rank is placed first and wins overlaps.
type Label = { name: string; rank: number; x: number; y: number; angle: number; room: number; segment?: [number, number, number, number] };
// Paths and labels are built once, UNIT px across from the tile's corner, and scaled
// to whatever size a tile is drawn at.
const UNIT = 4096;
export type Tile = { x: number; y: number; paths: Path2D[]; labels: Label[] };

const STREET_RANK: Record<string, number> = { motorway: 1, trunk: 1, primary: 1, secondary: 2, tertiary: 2, minor: 3 };

// In Latin script where the tiles have it, so a zoomed-out map reads in one script.
const nameOf = (properties: Record<string, unknown>) => properties["name:latin"] ?? properties.name;

// Close in, the neighbourhoods; further out, the towns, then the regions.
function placeClasses(z: number): string[] {
  if (z >= 13) return ["suburb", "quarter", "neighbourhood"];
  if (z >= 9) return ["city", "town"];
  if (z >= 5) return ["city", "state"];
  return ["country"];
}

function paths(tile: VectorTile): Path2D[] {
  const size = UNIT;
  return PAINT.map((paint) => {
    const path = new Path2D();
    const layer = tile.layers[paint.layer];
    if (!layer) return path;
    const scale = size / layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      if (paint.classes && !paint.classes.includes(String(feature.properties.class))) continue;
      if (feature.type !== (paint.fill ? 3 : 2)) continue;
      for (const ring of feature.loadGeometry()) {
        ring.forEach((p, k) => (k ? path.lineTo(p.x * scale, p.y * scale) : path.moveTo(p.x * scale, p.y * scale)));
        if (feature.type === 3) path.closePath();
      }
    }
    return path;
  });
}

function labels(tile: VectorTile, z: number): Label[] {
  const size = UNIT;
  const out: Label[] = [];
  const classes = placeClasses(z);
  const places = tile.layers.place;
  for (let i = 0; places && i < places.length; i++) {
    const feature = places.feature(i);
    const name = nameOf(feature.properties);
    if (!classes.includes(String(feature.properties.class)) || typeof name !== "string") continue;
    const scale = size / places.extent;
    const [p] = feature.loadGeometry()[0];
    out.push({ name: name.toUpperCase(), rank: 0, x: p.x * scale, y: p.y * scale, angle: 0, room: Infinity });
  }
  const streets = tile.layers.transportation_name;
  for (let i = 0; streets && i < streets.length; i++) {
    const feature = streets.feature(i);
    const name = nameOf(feature.properties);
    const rank = STREET_RANK[String(feature.properties.class)];
    if (!rank || typeof name !== "string" || feature.type !== 2) continue;
    const scale = size / streets.extent;
    for (const line of feature.loadGeometry()) {
      for (let k = 1; k < line.length; k++) {
        const [a, b] = [line[k - 1], line[k]];
        if (a.x === b.x && a.y === b.y) continue;
        out.push({
          name, rank, angle: 0, room: 0, x: 0, y: 0,
          segment: [a.x * scale, a.y * scale, b.x * scale, b.y * scale],
        });
      }
    }
  }
  return out;
}

// A point in tile units at zoom z: the tile it falls in is the integer part.
export function project(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return [((lon + 180) / 360) * n, ((1 - Math.asinh(Math.tan((clamped * Math.PI) / 180)) / Math.PI) / 2) * n];
}

// Keep enough decoded tiles for several buffered views, and share pending fetches.
const CACHE_LIMIT = 64;
type TileData = Omit<Tile, "x" | "y">;
const cache = new Map<string, TileData>();
const pending = new Map<string, Promise<TileData>>();

async function tile(url: string, z: number, x: number, y: number): Promise<TileData> {
  const key = `${z}/${x}/${y}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const loaded = fetch(url.replace("{z}", `${z}`).replace("{x}", `${x}`).replace("{y}", `${y}`), { signal: AbortSignal.timeout(TIMEOUT) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`tile ${key}: ${response.status}`);
      const tile = new VectorTile(new PbfReader(new Uint8Array(await response.arrayBuffer())));
      const data = { paths: paths(tile), labels: labels(tile, z) };
      cache.set(key, data);
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      return data;
    })
    .finally(() => pending.delete(key));
  pending.set(key, loaded);
  return loaded;
}

// Every tile at zoom z that a view `width` by `height` px shows, with the tile-unit
// point (cx, cy) at (ax, ay) in the view and each tile drawn `size` px across.
export async function loadTiles(
  z: number,
  [cx, cy]: [number, number],
  [ax, ay]: [number, number],
  width: number,
  height: number,
  size: number,
): Promise<Tile[]> {
  const n = 2 ** z;
  const xs = [Math.floor(cx - ax / size), Math.floor(cx + (width - ax) / size)];
  const ys = [Math.max(0, Math.floor(cy - ay / size)), Math.min(n - 1, Math.floor(cy + (height - ay) / size))];
  const coords: [number, number][] = [];
  for (let x = xs[0]; x <= xs[1]; x++) for (let y = ys[0]; y <= ys[1]; y++) coords.push([x, y]);
  const url = await tileTemplate();
  // Wraps across the antimeridian; drawn at its unwrapped x.
  const results = await Promise.allSettled(coords.map(async ([x, y]) => ({ x, y, ...(await tile(url, z, ((x % n) + n) % n, y)) })));
  const available = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!available.length) throw new Error("No map tiles could be loaded");
  return available;
}

// Draws tiles `size` px across with the tile-unit point (cx, cy) at (ax, ay).
// A padded buffer leaves room to pan. Place labels within the visible viewport.
export function drawTiles(
  ctx: CanvasRenderingContext2D,
  tiles: Tile[],
  [cx, cy]: [number, number],
  [ax, ay]: [number, number],
  size: number,
  palette: Palette,
  family: string,
  width: number,
  height: number,
  [insetX, insetY]: [number, number],
) {
  const ox = ax - cx * size;
  const oy = ay - cy * size;
  // Lines keep their width in CSS px whatever size the tile is drawn at.
  const k = size / UNIT;
  for (const { x, y, paths } of tiles) {
    ctx.save();
    ctx.translate(ox + x * size, oy + y * size);
    // Tiles carry a margin of their neighbours' geometry; unclipped, translucent
    // fills would double up into dark seams.
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.clip();
    ctx.scale(k, k);
    PAINT.forEach((paint, i) => {
      if (paint.fill) {
        ctx.fillStyle = palette[paint.fill];
        ctx.fill(paths[i]);
      }
      if (paint.stroke) {
        ctx.strokeStyle = palette[paint.stroke];
        ctx.lineWidth = (paint.width ?? 1) / k;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.setLineDash((paint.dash ?? []).map((d) => d / k));
        ctx.stroke(paths[i]);
      }
    });
    ctx.restore();
  }
  ctx.save();
  ctx.translate(insetX, insetY);
  drawLabels(ctx, tiles, ox - insetX, oy - insetY, size, width, height, palette, family);
  ctx.restore();
}

// Find the visible portion of a street segment. Its full midpoint can be a block
// away from the map when the map is zoomed in.
function visibleSegment(label: Label, ox: number, oy: number, k: number, width: number, height: number): Label | undefined {
  if (!label.segment) return { ...label, x: ox + label.x * k, y: oy + label.y * k };
  const [x0, y0, x1, y1] = label.segment;
  const x = ox + x0 * k;
  const y = oy + y0 * k;
  const dx = (x1 - x0) * k;
  const dy = (y1 - y0) * k;
  const inset = 8;
  let start = 0;
  let end = 1;
  for (const [origin, delta, max] of [[x, dx, width], [y, dy, height]]) {
    if (!delta) {
      if (origin < inset || origin > max - inset) return;
      continue;
    }
    const a = (inset - origin) / delta;
    const b = (max - inset - origin) / delta;
    start = Math.max(start, Math.min(a, b));
    end = Math.min(end, Math.max(a, b));
  }
  if (start >= end) return;
  const middle = (start + end) / 2;
  let angle = Math.atan2(dy, dx);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  return { ...label, x: x + dx * middle, y: y + dy * middle, angle, room: Math.hypot(dx, dy) * (end - start) };
}

// Over every tile at once, since a tile's margin repeats its neighbours' names:
// a name already placed nearby is skipped, as is one that would overlap another.
function drawLabels(
  ctx: CanvasRenderingContext2D,
  tiles: Tile[],
  ox: number,
  oy: number,
  size: number,
  width: number,
  height: number,
  palette: Palette,
  family: string,
) {
  const k = size / UNIT;
  const all = tiles
    .flatMap(({ x, y, labels }) => labels.map((label) => visibleSegment(label, ox + x * size, oy + y * size, k, width, height)))
    .filter((label): label is Label => !!label && label.x > 0 && label.y > 0 && label.x < width && label.y < height)
    .sort((a, b) => a.rank - b.rank || b.room - a.room);
  const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const placed: { name: string; x: number; y: number }[] = [];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  for (const label of all) {
    const place = label.rank === 0;
    ctx.font = `${place ? 500 : 400} ${place ? 11 : 12}px ${family}`;
    ctx.letterSpacing = place ? "0.18em" : "0px";
    const w = ctx.measureText(label.name).width;
    if (w + 24 > label.room) continue;
    if (placed.some((p) => p.name === label.name && Math.hypot(p.x - label.x, p.y - label.y) < 480)) continue;
    // The rotated text's bounding box, padded.
    const hw = (Math.abs(Math.cos(label.angle)) * w + Math.abs(Math.sin(label.angle)) * 14) / 2 + 6;
    const hh = (Math.abs(Math.sin(label.angle)) * w + Math.abs(Math.cos(label.angle)) * 14) / 2 + 6;
    const box = { x0: label.x - hw, y0: label.y - hh, x1: label.x + hw, y1: label.y + hh };
    if (taken.some((t) => box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0)) continue;
    taken.push(box);
    placed.push(label);
    ctx.save();
    ctx.translate(label.x, label.y);
    ctx.rotate(label.angle);
    ctx.strokeStyle = palette.labelHalo;
    ctx.lineWidth = 3;
    ctx.strokeText(label.name, 0, 0);
    ctx.fillStyle = place ? palette.placeLabel : palette.label;
    ctx.fillText(label.name, 0, 0);
    ctx.restore();
  }
  ctx.letterSpacing = "0px";
}
