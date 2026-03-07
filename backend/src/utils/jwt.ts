import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

type TeamClaims = {
  sub: string;
  role: "team";
  sessionId: string;
  eventId: string;
};

type AdminClaims = {
  sub: string;
  role: "admin";
};

const baseSignOptions: SignOptions = {
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  algorithm: "HS256"
};

export function signTeamToken(payload: TeamClaims): string {
  return jwt.sign(payload, env.JWT_SECRET, baseSignOptions);
}

export function signAdminToken(payload: AdminClaims): string {
  return jwt.sign(payload, env.JWT_SECRET, baseSignOptions);
}

export function verifyToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithms: ["HS256"]
  }) as jwt.JwtPayload;
}
