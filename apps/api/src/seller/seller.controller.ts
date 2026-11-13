import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateProductDto, UpdateProductDto, UpdateStockDto } from './seller.dto';
import { SellerService } from './seller.service';

const multer = require('multer') as { memoryStorage: () => unknown };

interface UploadedProductFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Controller('seller')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SHOP_OWNER')
export class SellerController {
  constructor(private readonly seller: SellerService) {}

  @Get('shops')
  shops(@Req() request: AuthenticatedRequest) {
    return this.seller.shops(request.user.sub);
  }

  @Get('shops/:shopId/products')
  products(@Req() request: AuthenticatedRequest, @Param('shopId', ParseUUIDPipe) shopId: string) {
    return this.seller.products(request.user.sub, shopId);
  }

  @Post('shops/:shopId/products')
  createProduct(
    @Req() request: AuthenticatedRequest,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Body() input: CreateProductDto,
  ) {
    return this.seller.createProduct(request.user.sub, shopId, input);
  }

  @Patch('products/:productId')
  updateProduct(
    @Req() request: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: UpdateProductDto,
  ) {
    return this.seller.updateProduct(request.user.sub, productId, input);
  }

  @Patch('products/:productId/variants/:variantId/stock')
  updateStock(
    @Req() request: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() input: UpdateStockDto,
  ) {
    return this.seller.updateStock(request.user.sub, productId, variantId, input.quantityAvailable);
  }

  @Post('products/:productId/submit')
  submit(@Req() request: AuthenticatedRequest, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.seller.submit(request.user.sub, productId);
  }

  @Post('products/:productId/images')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', {
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
    fileFilter: (_request, file, callback) =>
      callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
  }))
  uploadImage(
    @Req() request: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
    @UploadedFile() file?: UploadedProductFile,
  ) {
    return this.seller.uploadImage(request.user.sub, productId, file);
  }

  @Delete('products/:productId/images/:imageId')
  deleteImage(
    @Req() request: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.seller.deleteImage(request.user.sub, productId, imageId);
  }
}

