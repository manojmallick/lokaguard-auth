// scripts/dnb-mock/server.js
// Mock DNB (De Nederlandsche Bank) Reporting API for local development and hackathon demo.
// Mirrors the real DNB DORA ICT incident reporting API contract.

const http = require("http");
const { randomUUID } = require("crypto");

const PORT = 8080;
const submissions = new Map();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(payload);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  console.log(`[DNB-MOCK] ${method} ${path}`);

  // ── Health check ────────────────────────────────────────────
  if (method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok", service: "DNB Mock Reporting API", version: "1.0.0" });
  }

  // ── CORS preflight ──────────────────────────────────────────
  if (method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" });
    return res.end();
  }

  // ── POST /v1/incident-reports  (submit DORA initial notification) ──
  if (method === "POST" && path === "/v1/incident-reports") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return json(res, 400, { error: "invalid_request", message: "Request body must be valid JSON" });
    }

    // Validate mandatory DORA Article 19 fields
    const required = ["financialEntityName", "financialEntityLEI", "detectionDateTime", "incidentType", "incidentDescription"];
    const missing = required.filter((f) => !body[f]);
    if (missing.length > 0) {
      return json(res, 422, {
        error: "validation_error",
        message: `Missing mandatory DORA Article 19 fields: ${missing.join(", ")}`,
        fields: missing,
      });
    }

    const referenceId = `DNB-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    const record = {
      referenceId,
      status: "received",
      financialEntityName: body.financialEntityName,
      financialEntityLEI: body.financialEntityLEI,
      incidentType: body.incidentType,
      receivedAt: now,
      reportingDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // +4 hours
      nextUpdateDue: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),    // +72 hours
    };

    submissions.set(referenceId, { ...record, fullReport: body });

    console.log(`[DNB-MOCK] Report received: ${referenceId} from ${body.financialEntityName}`);

    return json(res, 201, record);
  }

  // ── GET /v1/incident-reports/:referenceId  (status check) ──
  const statusMatch = path.match(/^\/v1\/incident-reports\/([A-Z0-9-]+)$/);
  if (method === "GET" && statusMatch) {
    const referenceId = statusMatch[1];
    const record = submissions.get(referenceId);
    if (!record) {
      return json(res, 404, { error: "not_found", message: `Report ${referenceId} not found` });
    }
    return json(res, 200, record);
  }

  // ── GET /v1/incident-reports  (list all — for testing) ──
  if (method === "GET" && path === "/v1/incident-reports") {
    const list = Array.from(submissions.values()).map(({ fullReport: _, ...r }) => r);
    return json(res, 200, { reports: list, total: list.length });
  }

  return json(res, 404, { error: "not_found", message: `${method} ${path} is not a valid endpoint` });
});

server.listen(PORT, () => {
  console.log(`[DNB-MOCK] Mock DNB Reporting API listening on http://localhost:${PORT}`);
  console.log(`[DNB-MOCK] Endpoints:`);
  console.log(`[DNB-MOCK]   POST /v1/incident-reports   — Submit DORA Article 19 notification`);
  console.log(`[DNB-MOCK]   GET  /v1/incident-reports   — List all submitted reports`);
  console.log(`[DNB-MOCK]   GET  /v1/incident-reports/:id — Get report status`);
  console.log(`[DNB-MOCK]   GET  /health                — Health check`);
});
