// Serves the built site from dist/ on the first free port from 18385 up, for the scripts that look at pages.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const dist = fileURLToPath(new URL("../dist/", import.meta.url));

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

/** Starts the server and resolves to its origin and a function that stops it. */
export async function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    let file = join(dist, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!file.startsWith(dist) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  // One listener for the whole search, so the port read is the one the server holds, not the first one tried.
  const port = await new Promise((resolve, reject) => {
    let tried = 18385;
    const onError = (e) => {
      if (e.code === "EADDRINUSE" && tried < 18435) server.listen(++tried, "127.0.0.1");
      else {
        server.off("listening", onListening);
        reject(e);
      }
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server.address().port);
    };
    server.on("error", onError);
    server.once("listening", onListening);
    server.listen(tried, "127.0.0.1");
  });
  return { origin: `http://127.0.0.1:${port}`, stop: () => new Promise((r) => server.close(r)) };
}
