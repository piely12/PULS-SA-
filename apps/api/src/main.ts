import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from './app.module';

const express = require('express') as { static: (...args: unknown[]) => any };

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const uploadRoot = join(process.cwd(), 'uploads');
  await mkdir(join(uploadRoot, 'products'), { recursive: true });
  const webOrigins = process.env.WEB_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean)
    ?? ['http://localhost:5173'];
  app.enableCors({ origin: webOrigins });
  app.use('/media', express.static(uploadRoot, { immutable: true, maxAge: '7d', dotfiles: 'deny' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(3000, '0.0.0.0');
}
bootstrap();
