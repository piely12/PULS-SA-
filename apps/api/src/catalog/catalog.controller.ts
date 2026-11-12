import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Param,
  Query,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  categories() {
    return this.catalog.categories();
  }

  @Get('products')
  products(
    @Query('q') query?: string,
    @Query('category') category?: string,
    @Query('shop') shop?: string,
    @Query('sort') sort?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.catalog.products({ query, category, shop, sort, page, limit });
  }

  @Get('products/:id')
  product(@Param('id') id: string) {
    return this.catalog.product(id);
  }
}
