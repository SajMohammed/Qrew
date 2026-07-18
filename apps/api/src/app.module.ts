import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller";
import { LoyaltyModule } from "./loyalty/loyalty.module";
import { EnrollModule } from "./enroll/enroll.module";
import { CardModule } from "./card/card.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ProgramModule } from "./program/program.module";
import { LeadsModule } from "./leads/leads.module";
import { TenantMiddleware } from "./tenant/tenant.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoyaltyModule,
    EnrollModule,
    CardModule,
    DashboardModule,
    ProgramModule,
    LeadsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Resolve the tenant for every request before any handler runs.
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
