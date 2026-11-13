import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AddCartItemDto, UpdateCartItemDto } from './cart.dto';
import { CartService } from './cart.service';

@Controller('cart')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER', 'SHOP_OWNER')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.cart.get(request.user.sub);
  }

  @Post('items')
  add(@Req() request: AuthenticatedRequest, @Body() input: AddCartItemDto) {
    return this.cart.add(request.user.sub, input.variantId, input.quantity);
  }

  @Patch('items/:itemId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() input: UpdateCartItemDto,
  ) {
    return this.cart.update(request.user.sub, itemId, input.quantity);
  }

  @Delete('items/:itemId')
  remove(@Req() request: AuthenticatedRequest, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.cart.remove(request.user.sub, itemId);
  }
}
