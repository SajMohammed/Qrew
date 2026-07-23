import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/auth.decorators";

@Public()
@Controller("health")
export class HealthController {
  @Get()
  health(): { status: string; ts: string } {
    return { status: "ok", ts: new Date().toISOString() };
  }
}
