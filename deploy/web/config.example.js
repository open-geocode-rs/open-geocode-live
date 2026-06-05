// Prod config for the deployed UI. Copy to config.js (gitignored) and set your
// tiles URL; build-ui.mjs uses config.js if present, else this template. With no
// styleUrl, app.js builds the Protomaps style (glyphs/sprites from CDN); the API
// is proxied at <BASE>api/* by the Worker.
window.OPEN_GEOCODE_CONFIG = {
  pmtilesUrl: "https://tiles.example.com/basemap.pmtiles",
};
