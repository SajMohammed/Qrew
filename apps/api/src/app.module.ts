import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller";
import { AuthModule } from "./auth/auth.module";
import { LoyaltyModule } from "./loyalty/loyalty.module";
import { EnrollModule } from "./enroll/enroll.module";
import { CardModule } from "./card/card.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ProgramModule } from "./program/program.module";
import { LeadsModule } from "./leads/leads.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { StaffModule } from "./staff/staff.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule, // registers the global ClerkAuthGuard + RolesGuard (closed-by-default)
    LoyaltyModule,
    EnrollModule,
    CardModule,
    DashboardModule,
    ProgramModule,
    LeadsModule,
    OnboardingModule,
    StaffModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
