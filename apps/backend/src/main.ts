import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const session = require('express-session');
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

async function bootstrap() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  // Session middleware required for OAuth state verification
  app.use(session({
    secret: jwtSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict' as const,
      maxAge: 60_000, // 60s — only needed for OAuth handshake
    },
  }));

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: buildCorsOriginResolver(),
    credentials: true,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Interview Assistant API')
    .setDescription('API for VCS Interview Assistant')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();

function buildCorsOriginResolver() {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = new Set([
    process.env.FRONTEND_URL || 'http://localhost:4000',
    'http://localhost:4000',
    'http://localhost:3001',
    ...parseCommaSeparatedEnv(process.env.EXTENSION_ALLOWED_ORIGINS),
  ]);

  if (isProduction) {
    for (const origin of allowedOrigins) {
      if (origin.includes('*')) {
        throw new Error('Wildcard CORS origins are not allowed in production');
      }
    }
  }

  return (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    if (!isProduction && origin.startsWith('chrome-extension://')) {
      callback(null, true);
      return;
    }

    callback(new Error('CORS origin is not allowed'), false);
  };
}

function parseCommaSeparatedEnv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
