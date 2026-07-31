/**
 * A public-facing server that serves ONE thing: a card's stamp strip.
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

  const server = createServer(async (req, res) => {
    // The serial is the capability, exactly as it is for the card read itself.
    const match = req.url?.match(/^\/card\/([^/?]+)\/strip\.png(?:\?|$)/);
    if (req.method !== "GET" || !match) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    try {
      const png = await getCardStrip(decodeURIComponent(match[1]!));
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
    console.log(`  only route: GET /card/:serial/strip.png\n`);
    console.log(`  Tunnel THIS port — never 4000, which accepts the dev auth bypass.\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
