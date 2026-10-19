import { DynamicModule, Global, Module } from "@nestjs/common";
import { JWT_SECRET, JwtAuthGuard } from "./jwt-auth.guard";

@Global()
@Module({})
export class AuthModule {
  static forRoot(jwtSecret: string): DynamicModule {
    if (!jwtSecret) {
      throw new Error("A JWT secret is required; there is no fallback (S6, decisions.md).");
    }
    return {
      module: AuthModule,
      providers: [{ provide: JWT_SECRET, useValue: jwtSecret }, JwtAuthGuard],
      exports: [JWT_SECRET, JwtAuthGuard],
    };
  }
}
