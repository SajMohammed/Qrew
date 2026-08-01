/**
 * A public-facing server that serves images and nothing else: a card's stamp strip, and the
 * design images a shop has uploaded.
 *
 * Google downloads the strip itself, so the image has to be reachable from the internet — but the
 * main API runs with AUTH_DEV_BYPASS in development, where an `x-merchant-id` header is accepted as
 * proof of tenancy. Tunnelling that to the public internet would hand anyone who found the URL full
 * read/write access to the shop. So this exists instead: one route, no auth surface, no mutations,
 * nothing else routable.
 *
 *   pnpm strip:serve            # then tunnel THIS port, not 4000
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { createServer } from "node:http";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const PORT = Number(process.env.STRIP_PORT ?? 4100);

async function main() {
  const { getCardStrip } = await import("../src/card");
  const { getAsset } = await import("../src/asset");

  const server = createServer(async (req, res) => {
    if (req.method !== "GET") {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }

    // Both ids are unguessable and ARE the capability — the card serial, the asset id.
    const strip = req.url?.match(/^\/card\/([^/?]+)\/strip\.png(?:\?|$)/);
    const asset = req.url?.match(/^\/asset\/([^/?]+)\.png(?:\?|$)/);
    if (!strip && !asset) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }

    try {
      if (asset) {
        const found = await getAsset(decodeURIComponent(asset[1]!));
        if (!found) {
          res.writeHead(404, { "content-type": "text/plain" }).end("asset not found");
          return;
        }
        res
          .writeHead(200, {
            "content-type": found.contentType,
            // Immutable: an edited image is a new upload with a new id.
            "cache-control": "public, max-age=31536000, immutable",
            "content-length": found.bytes.length,
          })
          .end(found.bytes);
        return;
      }

      const png = await getCardStrip(decodeURIComponent(strip![1]!));
      if (!png) {
        res.writeHead(404, { "content-type": "text/plain" }).end("card not found");
        return;
      }
      res
        .writeHead(200, {
          "content-type": "image/png",
          // Short: the image changes the moment a stamp lands.
          "cache-control": "public, max-age=60",
          "content-length": png.length,
        })
        .end(png);
    } catch (err) {
      console.error("[strip] ", err);
      res.writeHead(500).end("error");
    }
  });

  server.listen(PORT, () => {
    console.log(`\n  stamp-strip server on http://localhost:${PORT}`);
    console.log(`  routes: GET /card/:serial/strip.png, GET /asset/:id.png\n`);
    console.log(`  Tunnel THIS port — never 4000, which accepts the dev auth bypass.\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
