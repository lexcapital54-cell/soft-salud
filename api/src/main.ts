import { Logger, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // La historia guarda firmas y consentimientos en base64: el límite por defecto (100 KB) bloquea el guardado.
  app.useBodyParser('json', { limit: '15mb' });
  app.useBodyParser('urlencoded', { limit: '15mb', extended: true });
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
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
