import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("12h"),
  JWT_ISSUER: z.string().default("scan-to-survive"),
  JWT_AUDIENCE: z.string().default("scan-to-survive-clients"),
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD_HASH: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  WS_BROADCAST_INTERVAL_MS: z.coerce.number().default(2000),
  DEFAULT_TRAP_PENALTY_SECONDS: z.coerce.number().default(180),
  DEFAULT_HINT_PENALTY_SECONDS: z.coerce.number().default(300)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
  throw new Error(`Invalid environment variables: ${message}`);
}

export const env = parsed.data;
