import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CreateAddressDto } from './checkout.dto';
import { CheckoutService } from './checkout.service';

@Controller('checkout')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER', 'SHOP_OWNER')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get('zones')
  zones() {
    return this.checkout.zones();
  }

  @Get('addresses')
  addresses(@Req() request: AuthenticatedRequest) {
    return this.checkout.addresses(request.user.sub);
  }

  @Post('addresses')
  createAddress(@Req() request: AuthenticatedRequest, @Body() input: CreateAddressDto) {
    return this.checkout.createAddress(request.user.sub, input);
  }

  @Get('quote')
  quote(@Req() request: AuthenticatedRequest, @Query('addressId') addressId: string) {
    return this.checkout.quote(request.user.sub, addressId);
  }
}
