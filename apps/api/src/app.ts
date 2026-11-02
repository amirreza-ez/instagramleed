import { ArgumentsHost, Catch, ExceptionFilter, HttpException, INestApplication, Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, NestFactory } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { AuthGuard, CoreModule } from './common/core';
import { AdminModule } from './modules/admin';
import { AuthModule } from './modules/auth';
import { BillingModule } from './modules/billing';
import { CrmModule } from './modules/crm';
import { ImportsModule } from './modules/imports';
import { LeadsModule } from './modules/leads';
import { MetaModule } from './modules/meta';

// BigInt (campaign budgets) → JSON number
(BigInt.prototype as any).toJSON = function () { return Number(this); };

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger('Error');
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (e instanceof HttpException) {
      const body: any = e.getResponse();
      return res.status(e.getStatus()).json(typeof body === 'string' ? { statusCode: e.getStatus(), message: body } : { statusCode: e.getStatus(), ...body });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return res.status(404).json({ statusCode: 404, message: 'مورد یافت نشد' });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return res.status(409).json({ statusCode: 409, message: 'این مورد تکراری است' });
    this.log.error(e?.stack ?? e);
    res.status(500).json({ statusCode: 500, message: 'خطای داخلی سرور؛ لطفاً دوباره تلاش کنید' });
  }
}

const webDist = path.resolve(__dirname, '../../web/dist');
const serveWeb = process.env.NODE_ENV === 'production' && fs.existsSync(webDist);

@Module({
  imports: [
    CoreModule,
    JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: process.env.JWT_SECRET, signOptions: { issuer: 'eazazi-lead' } }) }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    ...(serveWeb ? [ServeStaticModule.forRoot({ rootPath: webDist, exclude: ['/api/{*path}'] })] : []),
    AuthModule, BillingModule, LeadsModule, ImportsModule, CrmModule, MetaModule, AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

export async function createApp(): Promise<INestApplication> {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set (>=32 chars)');
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: process.env.NODE_ENV === 'test' ? ['error'] : undefined });
  app.setGlobalPrefix('api');
  app.use(helmet({ contentSecurityPolicy: serveWeb ? { directives: { 'img-src': ["'self'", 'data:', 'https:'], 'connect-src': ["'self'"] } } : false }));
  app.use(cookieParser());
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('EAZAZI LEAD INSTAGRAM API').setVersion('1.0').addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc);
  app.enableShutdownHooks();
  return app;
}
