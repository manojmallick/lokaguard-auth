// src/regulatory/dnb-client.ts
// DNB API client — reads DNB_API_BASE_URL from env

import { config } from "../config";
import type { DORAInitialNotification, DNBSubmissionResponse } from "../types/report.types";

export class DNBSubmissionError extends Error {
  code = "DNB_SUBMISSION_ERROR" as const;
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "DNBSubmissionError";
  }
}

export class DNBClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.DNB_API_BASE_URL;
  }

  async submitReport(
    report: DORAInitialNotification,
    authToken: string,
  ): Promise<DNBSubmissionResponse> {
    if (config.DEMO_MODE) {
      // Mock DNB accepts all submissions in demo mode
      await new Promise((r) => setTimeout(r, 1_500)); // simulate network
      return {
        referenceId: `DNB-${report.referenceNumber}-${Date.now()}`,
        receivedAt: new Date().toISOString(),
        status: "accepted",
      };
    }

    const res = await fetch(`${this.baseUrl}/reports/initial`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "X-DNB-LEI": report.financialEntityLEI,
        "X-Report-Reference": report.referenceNumber,
      },
      body: JSON.stringify(report),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new DNBSubmissionError(
        `DNB API submission failed: ${res.status} ${body}`,
        res.status,
      );
    }

    const data = (await res.json()) as DNBSubmissionResponse;
    return data;
  }

  async getReportStatus(
    referenceId: string,
    authToken: string,
  ): Promise<{ status: string; updatedAt: string }> {
    if (config.DEMO_MODE) {
      return { status: "accepted", updatedAt: new Date().toISOString() };
    }

    const res = await fetch(`${this.baseUrl}/reports/${referenceId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!res.ok) {
      throw new DNBSubmissionError(`DNB status check failed: ${res.status}`, res.status);
    }

    return (await res.json()) as { status: string; updatedAt: string };
  }
}
