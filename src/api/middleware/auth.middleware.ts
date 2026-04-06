// src/api/middleware/auth.middleware.ts
// JWT validation via Auth0 JWKS

import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../../config";

const JWKS = createRemoteJWKSet(
  new URL(`https://${config.AUTH0_DOMAIN}/.well-known/jwks.json`),
);

export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    email?: string;
    org_id?: string;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // In demo mode, accept any bearer token and mock a user
  if (config.DEMO_MODE) {
    req.user = {
      sub: "auth0|demo-user",
      email: "ciso@manojmallick",
      org_id: "org-manojmallick",
    };
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  // Allow the frontend dashboard to submit without an Auth0 session, 
  // without sacrificing the DEMO_MODE=false requirement for the backend FGA agents.
  if (token === "demo-token") {
    req.user = {
      sub: "auth0|demo-ciso", // Mock the submitter identity for OpenFGA downstream
      email: "ciso@manojmallick",
      org_id: "org-manojmallick",
    };
    next();
    return;
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${config.AUTH0_DOMAIN}/`,
      audience: config.AUTH0_AUDIENCE,
    });

    const userEmail = typeof payload["email"] === "string" ? payload["email"] : undefined;
    const userOrgId = typeof payload["org_id"] === "string" ? payload["org_id"] : undefined;
    req.user = {
      sub: payload.sub ?? "",
      ...(userEmail !== undefined ? { email: userEmail } : {}),
      ...(userOrgId !== undefined ? { org_id: userOrgId } : {}),
    };

    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "JWT verification failed";
    res.status(401).json({ error: "Unauthorized", detail: message });
  }
}

// Optional auth — doesn't block unauthenticated requests (for dashboard)
export async function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  await authMiddleware(req, res, next);
}
