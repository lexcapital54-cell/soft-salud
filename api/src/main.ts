import { Logger, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  // Antes de CORS para que también queden trazados los preflight OPTIONS, que
  // el middleware de CORS responde y corta sin llegar al resto de la cadena.
  const httpLogger = new Logger('HTTP');
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const extra =
        req.method === 'OPTIONS'
          ? ` [preflight ${req.headers['access-control-request-method'] ?? '?'}]`
          : '';
      httpLogger.log(
        `${req.method} ${req.originalUrl}${extra} → ${res.statusCode} (${Date.now() - startedAt}ms)`,
      );
    });
    next();
  });

  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
