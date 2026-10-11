import "./load-env"; // must be first: populates env before @qrew/db loads
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { raw } from "express";
import { assertDeployableConfig } from "@qrew/core";
import { assertAppRoleIsolated } from "@qrew/db";
import { AppModule } from "./app.module";
import { ZodExceptionFilter } from "./common/zod-exception.filter";
import { DomainExceptionFilter } from "./common/domain-exception.filter";
import { securityHeaders } from "./common/security-headers";

async function bootstrap(): Promise<void> {
  // Fail closed outside development: no public token secrets, fake wallet, open CORS or missing
  // keys — and never a database role that would see every shop's data.
  assertDeployableConfig("api");
  await assertAppRoleIsolated();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable("x-powered-by");
  /*
   * How many proxies sit in front of us (TRUST_PROXY_HOPS, required in production: 1 behind the
   * ALB). Express then takes the client's address from that many X-Forwarded-For hops and no more,
   * which is what the rate limiter keys on. 0 locally, so nobody can choose their own address by
   * sending the header.
   */
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 0));
  app.use(securityHeaders);
  /*
   * Design images are uploaded as the raw request body rather than multipart — one file, one field,
   * so a multipart parser would be a dependency earning nothing. The limit sits above the domain's
   * own cap so an oversized file is rejected by storeAsset, which can say how big it was, instead
   * of by the body parser, which can only say "too large".
   */
  app.use("/asset", raw({ type: "image/png", limit: "1mb" }));
  // Dev is same-origin via the Vite proxy, so CORS is a no-op there; set CORS_ORIGINS in a
  // non-proxied deploy (the Authorization header makes requests preflighted).
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()) ?? true,
    allowedHeaders: ["authorization", "content-type", "x-merchant-id", "x-active-merchant"],
  });
  app.useGlobalFilters(new ZodExceptionFilter(), new DomainExceptionFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`Qrew API listening on :${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
