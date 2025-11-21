import http from "http";
import { URL } from "url";
import config from "./config.js";
import logger from "./logger.js";
import { sendBroadcast } from "./broadcast.js";

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function writeJson(res, statusCode, payload = {}) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const body = statusCode === 204 ? "" : JSON.stringify(payload);
  res.writeHead(statusCode, headers);
  res.end(body);
}

function isAuthorized(req) {
  const token = config.broadcastAccessToken;
  if (!token) return true;
  const authHeader = req.headers.authorization || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim() === token;
  }
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.trim() === token) {
    return true;
  }
  return false;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        if (!chunks.length) {
          resolve({});
          return;
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw));
      } catch (error) {
        const parseError = new Error("Invalid JSON payload");
        parseError.status = 400;
        reject(parseError);
      }
    });
    req.on("error", (error) => reject(error));
  });
}

async function handleBroadcast(req, res) {
  if (!isAuthorized(req)) {
    writeJson(res, 401, { error: "Unauthorized" });
    return;
  }
  try {
    const payload = await parseJsonBody(req);
    const { message, logins } = payload || {};
    const result = await sendBroadcast({ message, logins });
    writeJson(res, 200, { status: "ok", ...result });
  } catch (error) {
    logger.error({ err: error }, "Broadcast request failed");
    const status = error.status || 500;
    writeJson(res, status, { error: error.message || "Broadcast failed" });
  }
}

function requestListener(req, res) {
  if (req.method === "OPTIONS") {
    writeJson(res, 204, {});
    return;
  }
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/broadcast") {
    handleBroadcast(req, res);
    return;
  }
  writeJson(res, 404, { error: "Not found" });
}

const port = config.broadcastServerPort;
if (!port) {
  logger.fatal("BROADCAST_SERVER_PORT is not configured.");
  process.exit(1);
}

const server = http.createServer(requestListener);
server.listen(port, () => {
  logger.info({ port }, "Broadcast HTTP server is listening");
});
