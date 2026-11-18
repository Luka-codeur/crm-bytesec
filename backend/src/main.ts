import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ErrorFilter, validationPipe } from './common/http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ErrorFilter());

  const origin = process.env['CORS_ORIGIN'] ?? '*';
  app.enableCors({ origin: origin === '*' ? true : origin.split(',') });

  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API CRM sur http://localhost:${port}/api`);
}

void bootstrap();
