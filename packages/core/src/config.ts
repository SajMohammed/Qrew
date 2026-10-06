import { unsafeTokenSecrets } from "./token";

/**
 * What a deployed process cannot run without.
 *
 * Every setting below has a development fallback — localhost Redis, the fake wallet provider, public
 * token secrets, CORS open to all — so a laptop needs no config. Each fallback is wrong in a deployed
 * environment, and none of them fails loudly: the API would start, sign tokens with a public key,
 * hand customers dead wallet links, or accept requests from any origin. So outside development and
 * test the process refuses to start until every one is set, and says which.
 *
 * An unset NODE_ENV counts as deployed. Forgetting to say "production" must not be a way to get the
 * development behaviour.
 */
export type ServiceRole = "api" | "worker";

type Env = Record<string, string | undefined>;

export function isDevelopmentLike(env: Env = process.env): boolean {
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

/** Everything wrong with this environment for a deployed process; empty when it is safe to start. */
export function configProblems(role: ServiceRole, env: Env = process.env): string[] {
  if (isDevelopmentLike(env)) return [];

  const problems: string[] = [];
  const set = (name: string) => Boolean(env[name]?.trim());
  const need = (name: string, why: string) => {
    if (!set(name)) problems.push(`${name} is not set: ${why}`);
  };
  const needHttps = (name: string, why: string) => {
    need(name, why);
    if (set(name) && !env[name]!.trim().startsWith("https://")) problems.push(`${name} must be an https:// URL`);
  };

  need("DATABASE_URL", "migrations and the admin path need the owner connection");
  need("DATABASE_URL_APP", "tenant queries need the row-level-security role");
  need("REDIS_URL", "the wallet-sync queue would look for Redis on localhost");
  needHttps("PUBLIC_API_URL", "Google fetches pass images and uploaded artwork from it");

  const provider = env.WALLET_PROVIDER?.trim();
  if (!provider || provider === "fake") {
    problems.push("WALLET_PROVIDER must name a real provider (google): the fake one issues dead links");
  } else if (provider === "google") {
    need("GOOGLE_WALLET_ISSUER_ID", "passes are issued under it");
    need("GOOGLE_WALLET_SA_EMAIL", "the service account signs every Google Wallet call");
    need("GOOGLE_WALLET_SA_PRIVATE_KEY", "the service account signs every Google Wallet call");
    needHttps("GOOGLE_WALLET_LOGO_URL", "Google rejects a pass class without a public logo");
  }

  if (role === "api") {
    for (const name of unsafeTokenSecrets(env)) {
      problems.push(`${name} is unset or the public development default`);
    }
    need("CLERK_SECRET_KEY", "no shop owner could sign in");
    need("GOOGLE_CLIENT_ID", "no customer could sign in with Google");
    need("CORS_ORIGINS", "the API would accept browser requests from any website");
    if (provider === "google") need("GOOGLE_WALLET_ORIGINS", "Google only shows the save button on listed origins");
    if (env.AUTH_DEV_BYPASS === "true") problems.push("AUTH_DEV_BYPASS must not be set outside development");
  }

  return problems;
}

/** Throw, listing every problem at once, unless this environment is safe to start in. */
export function assertDeployableConfig(role: ServiceRole, env: Env = process.env): void {
  const problems = configProblems(role, env);
  if (problems.length > 0) {
    throw new Error(`Refusing to start the ${role}:\n  - ${problems.join("\n  - ")}`);
  }
}
