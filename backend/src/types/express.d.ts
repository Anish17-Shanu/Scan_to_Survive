import type { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & {
        sub: string;
        role: "team" | "admin";
        sessionId?: string;
        eventId?: string;
      };
    }
  }
}

export {};
