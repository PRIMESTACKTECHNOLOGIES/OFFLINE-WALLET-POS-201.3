import { Server } from "socket.io";
import type { Server as HttpServer } from "http";

let io: Server | null = null;

export function initWsServer(httpServer: HttpServer) {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization"]
    }
  });

  io.on("connection", (socket) => {
    const customerId = String(socket.handshake.query.customerId || "").trim();
    const merchantId = String(socket.handshake.query.merchantId || "").trim();

    if (customerId) {
      socket.join(customerId);
      console.log(`[WS] Socket ${socket.id} joined customer room ${customerId}`);
    }
    if (merchantId) {
      socket.join(merchantId);
      console.log(`[WS] Socket ${socket.id} joined merchant room ${merchantId}`);
    }
  });

  return io;
}

export function getWsServer() {
  if (!io) {
    throw new Error("WebSocket server has not been initialized");
  }
  return io;
}
