import "./load-env"; // must be first: populates env before @qrew/db loads
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { assertTokenSecretsConfigured } from "@qrew/core";
import { AppModule } from "./app.module";
import { ZodExceptionFilter } from "./common/zod-exception.filter";

async function bootstrap(): Promise<void> {
  // Fail closed in production: never sign tokens with the public dev-default secrets.
  if (process.env.NODE_ENV === "production") assertTokenSecretsConfigured();

  const app = await NestFactory.create(AppModule);
  // Dev is same-origin via the Vite proxy, so CORS is a no-op there; set CORS_ORIGINS in a
  // non-proxied deploy (the Authorization header makes requests preflighted).
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()) ?? true,
    allowedHeaders: ["authorization", "content-type", "x-merchant-id", "x-active-merchant"],
  });
  app.useGlobalFilters(new ZodExceptionFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`Qrew API listening on :${port}`);
}

void bootstrap();
