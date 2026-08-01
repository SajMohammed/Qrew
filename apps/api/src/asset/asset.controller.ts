import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Res,
  NotFoundException,
  ParseUUIDPipe,
} from "@nestjs/common";
import type { Response } from "express";
import { AssetUploadQuery } from "@qrew/contracts";
import { getAsset, storeAsset, InvalidInputError } from "@qrew/core";
import { Merchant, Public, Roles } from "../auth/auth.decorators";

@Controller("asset")
export class AssetController {
  /**
   * Upload a design image. The body is the raw file — see the `express.raw` registration in
   * main.ts — which keeps the browser side a one-liner (`body: file`) and avoids pulling in a
   * multipart parser for a single field.
   *
   * Owner/manager only, exactly like editing the design it feeds.
   */
  @Roles("owner", "manager")
  @Post()
  async upload(@Merchant() merchantId: string, @Query() query: unknown, @Body() body: unknown) {
    const { kind } = AssetUploadQuery.parse(query);
    if (!Buffer.isBuffer(body)) {
      throw new InvalidInputError("send the image as the raw request body with content-type: image/png");
    }
    return storeAsset(merchantId, kind, body);
  }

  /**
   * Serve an uploaded image.
   *
   * Public in the plainest sense: Google downloads this from its own servers, unauthenticated, to
   * put on a wallet pass. The random id is the capability — the same rule the card serial follows.
   */
  @Public()
  @Get(":id.png")
  async serve(@Param("id", ParseUUIDPipe) id: string, @Res() res: Response) {
    const asset = await getAsset(id);
    if (!asset) throw new NotFoundException("asset not found");
    res
      .type(asset.contentType)
      // Immutable: an edited image is a new upload with a new id, so this content never changes.
      .set("cache-control", "public, max-age=31536000, immutable")
      .send(asset.bytes);
  }
}
