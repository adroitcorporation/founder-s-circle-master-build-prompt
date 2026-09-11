import "./config/runtime.js";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { MulterError } from "multer";
import { ApiError } from "./utils.js";
import { db } from "./database.js";
import { authenticated } from "./middleware/auth.middleware.js";
import { authRouter } from "./routes/auth.routes.js";
import { profilesRouter } from "./routes/profiles.routes.js";
import { discoverRouter } from "./routes/discover.routes.js";
import { connectionsRouter } from "./routes/connections.routes.js";
import { messagesRouter } from "./routes/messages.routes.js";
import { safetyRouter } from "./routes/safety.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { verificationRouter, uploadsRouter } from "./routes/verification.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { ideasRouter } from "./routes/ideas.routes.js";
import { eventsRouter } from "./routes/events.routes.js";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "blob:", "data:"],
          connectSrc: [
            "'self'",
            ...(process.env.NODE_ENV === "production"
              ? []
              : ["ws://localhost:5173"]),
          ],
        },
      },
    }),
  );
  app.use(cors({ origin: process.env.APP_ORIGIN, credentials: true }));
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== process.env.APP_ORIGIN
    )
      return res.status(403).json({ error: "Request origin is not allowed." });
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "20kb" }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 200,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many requests. Please wait a minute." },
    }),
  );
  app.get("/api/health", async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });
  app.use("/api/auth", authRouter);
  app.use("/api", authenticated);
  app.use("/api/profiles", profilesRouter);
  app.use("/api/discover", discoverRouter);
  app.use("/api/connections", connectionsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api", safetyRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/verification", verificationRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/ideas", ideasRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });
  app.use(express.static("Frontend/dist"));
  app.get("/{*path}", (_req, res) =>
    res.sendFile("index.html", { root: "Frontend/dist" }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ApiError)
        return res.status(error.status).json({ error: error.message });
      if (error instanceof ZodError)
        return res.status(400).json({
          error: error.issues
            .map((x) => `${x.path.join(".")}: ${x.message}`)
            .join("; "),
        });
      if (error instanceof MulterError)
        return res
          .status(400)
          .json({ error: "Choose one image smaller than 5 MB." });
      if (error instanceof Error && "status" in error && error.status === 400)
        return res.status(400).json({
          error: "Invalid request or image. Please check your input.",
        });
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002")
          return res
            .status(409)
            .json({ error: "This username or record is already in use." });
        if (["P2003", "P2025"].includes(error.code))
          return res
            .status(400)
            .json({ error: "One of the selected records is unavailable." });
      }
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 413
      )
        return res.status(413).json({ error: "This request is too large." });
      console.error(
        "Request failed",
        error instanceof Error ? error.name : "UnknownError",
        error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "",
      );
      return res
        .status(500)
        .json({ error: "Something went wrong. Please try again." });
    },
  );
  return app;
}
