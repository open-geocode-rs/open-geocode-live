// Pre-render the Natural Earth land outline used by the hero globe.
import { geoEquirectangular, geoPath } from "d3-geo";
import sharp from "sharp";
import { feature } from "topojson-client";
import topo from "world-atlas/land-110m.json" with { type: "json" };

const width = 1024;
const height = 512;
const projection = geoEquirectangular().scale(width / (2 * Math.PI)).translate([width / 2, height / 2]);
const outline = geoPath(projection)(feature(topo, topo.objects.land));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path d="${outline}"/></svg>`;
await sharp(Buffer.from(svg))
  .extractChannel("alpha")
  .threshold(128)
  .png({ palette: true, colours: 2, dither: 0 })
  .toFile(new URL("../src/assets/globe-mask.png", import.meta.url).pathname);
