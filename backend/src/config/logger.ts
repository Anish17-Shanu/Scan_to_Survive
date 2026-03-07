import winston from "winston";
import { env } from "./env.js";

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: "scan-to-survive-backend" },
  transports: [new winston.transports.Console()]
});
