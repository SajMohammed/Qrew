import { z } from "zod";

// zod schemas are the single source of truth for request/response shapes.
// The API validates with them; every frontend infers its types from them.
// (No tRPC — end-to-end types come from sharing these schemas + a typed fetch client.)

export const StampRequest = z.object({
  enrollmentId: z.string().uuid(),
  idempotencyKey: z.string().min(8),
  locationId: z.string().uuid().optional(),
});
export type StampRequest = z.infer<typeof StampRequest>;

export const RedeemRequest = z.object({
  enrollmentId: z.string().uuid(),
  idempotencyKey: z.string().min(8),
});
export type RedeemRequest = z.infer<typeof RedeemRequest>;

export const EnrollRequest = z.object({
  merchantId: z.string().uuid(), // from the merchant's counter QR (public routing, not auth)
  programId: z.string().uuid(),
  phone: z.string().min(5).optional(),
  name: z.string().min(1).optional(),
  consent: z.object({ sms: z.boolean().optional(), whatsapp: z.boolean().optional() }).optional(),
});
export type EnrollRequest = z.infer<typeof EnrollRequest>;

export const ProgramDTO = z.object({
  id: z.string(),
  name: z.string(),
  stampsRequired: z.number().int(),
  rewardText: z.string(),
});
export type ProgramDTO = z.infer<typeof ProgramDTO>;
