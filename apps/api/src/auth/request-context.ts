import "express";

/** What the ClerkAuthGuard learns from a verified token. */
export interface AuthContext {
  userId: string;
}

// Augment Express's Request with the fields the guard populates. (Replaces the old
// TenantMiddleware augmentation.) Type-only — erased at runtime.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      merchantId?: string;
      role?: string;
    }
  }
}
