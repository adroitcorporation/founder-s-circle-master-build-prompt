import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { sessionUser } from "./middleware/auth.middleware.js";
import { sendMessage } from "./services/messages.js";
import { ApiError } from "./utils.js";
export function createSockets(server: HttpServer) {
  const io = new Server(server, {
    cors: { origin: process.env.APP_ORIGIN, credentials: true },
    maxHttpBufferSize: 16_384,
    allowRequest: (req, cb) =>
      cb(null, req.headers.origin === process.env.APP_ORIGIN),
  });
  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("fc_session="))
        ?.slice(11);
      const s = await sessionUser(raw);
      socket.data.raw = raw;
      socket.data.userId = s.userId;
      socket.data.sessionId = s.id;
      next();
    } catch {
      next(new Error("Please log in to continue."));
    }
  });
  io.on("connection", (socket) => {
    if (
      (io.sockets.adapter.rooms.get(`user:${socket.data.userId}`)?.size ?? 0) >=
      5
    ) {
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${socket.data.userId}`);
    socket.join(`session:${socket.data.sessionId}`);
    const expiryCheck = setInterval(() => {
      void sessionUser(socket.data.raw).catch(() => socket.disconnect(true));
    }, 30_000);
    socket.on("disconnect", () => clearInterval(expiryCheck));
    let windowStart = Date.now();
    let attempts = 0;
    socket.on("send-message", async (input, ack) => {
      if (typeof ack !== "function") return;
      if (Date.now() - windowStart > 60_000) {
        attempts = 0;
        windowStart = Date.now();
      }
      if (++attempts > 40)
        return ack({ error: "Please wait before sending more messages." });
      try {
        const s = await sessionUser(socket.data.raw);
        const result = await sendMessage(s.userId, input);
        for (const id of [s.userId, ...result.other])
          io.to(`user:${id}`).emit("message", result.message);
        ack({ message: result.message });
      } catch (error) {
        ack({
          error:
            error instanceof ApiError
              ? error.message
              : "Unable to send message. Please try again.",
        });
      }
    });
  });
  return io;
}
