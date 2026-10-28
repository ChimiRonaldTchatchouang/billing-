import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { hash } from '@node-rs/argon2';
import { ENV, type Env } from '../config/env.js';
import { AppareilService } from './appareil.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PinService } from './pin.service.js';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ secret: env.JWT_ACCESS_SECRET }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PinService,
    AppareilService,
    { provide: 'ARGON_DUMMY', useFactory: () => hash('mot-de-passe-factice') },
  ],
  exports: [AuthService, PinService, AppareilService, JwtModule],
})
export class AuthModule {}
