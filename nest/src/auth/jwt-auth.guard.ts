import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { verify } from "jsonwebtoken";

export const JWT_SECRET = Symbol("JWT_SECRET");

// Equivalent of checkJWT in ../../../src/middleware/session.ts: the token is the last
// space-separated part of the Authorization header, any failure is 401 INVALID_SESSION.
// Unlike Express there is no fallback secret and the algorithm is pinned (S6, decisions.md).
// Any valid token passes; roles are not checked while A1 is open.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JWT_SECRET) private readonly secret: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.split(" ").pop();
    try {
      verify(`${token}`, this.secret, { algorithms: ["HS256"] });
      return true;
    } catch {
      throw new UnauthorizedException({ msg: "INVALID_SESSION" });
    }
  }
}
