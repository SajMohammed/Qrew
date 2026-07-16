import { Controller, Get, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { getDashboard } from "@qrew/core";

@Controller("dashboard")
export class DashboardController {
  @Get()
  overview(@Req() req: Request) {
    if (!req.merchantId) throw new UnauthorizedException("no tenant resolved");
    return getDashboard(req.merchantId);
  }
}
