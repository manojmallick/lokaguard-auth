// tests/regulatory/dora-classifier.test.ts
import { describe, it, expect } from "vitest";
import {
  classifyDORASeverity,
  classifyWithDetails,
  requiresDORAReport,
} from "../../src/regulatory/dora-classifier";

describe("classifyDORASeverity", () => {
  it("classifies as major when clientsAbsolute >= 100,000", () => {
    const result = classifyDORASeverity({
      affectedClients: 150_000,
      totalClients: 500_000,
      durationMinutes: 60,
      dataLoss: false,
      serviceType: "critical",
      geographicScope: "national",
      financialImpactEUR: 50_000,
    });
    expect(result).toBe("major");
  });

  it("classifies as major when clientsPercentage >= 10%", () => {
    const result = classifyDORASeverity({
      affectedClients: 60_000,
      totalClients: 500_000, // 12%
      durationMinutes: 30,
      dataLoss: false,
      serviceType: "standard",
      geographicScope: "local",
    });
    expect(result).toBe("major");
  });

  it("classifies as major on dataLoss regardless of scale", () => {
    const result = classifyDORASeverity({
      affectedClients: 10,
      totalClients: 500_000,
      durationMinutes: 5,
      dataLoss: true,
      serviceType: "standard",
      geographicScope: "local",
    });
    expect(result).toBe("major");
  });

  it("classifies as major when financial impact >= €100,000", () => {
    const result = classifyDORASeverity({
      affectedClients: 5,
      totalClients: 500_000,
      durationMinutes: 10,
      dataLoss: false,
      serviceType: "standard",
      geographicScope: "local",
      financialImpactEUR: 150_000,
    });
    expect(result).toBe("major");
  });

  it("classifies as major when critical service down >= 240 min", () => {
    const result = classifyDORASeverity({
      affectedClients: 100,
      totalClients: 500_000,
      durationMinutes: 300,
      dataLoss: false,
      serviceType: "critical",
      geographicScope: "local",
    });
    expect(result).toBe("major");
  });

  it("classifies as minor when no threshold is breached", () => {
    const result = classifyDORASeverity({
      affectedClients: 100,
      totalClients: 500_000, // 0.02%
      durationMinutes: 30,
      dataLoss: false,
      serviceType: "standard",
      geographicScope: "local",
      financialImpactEUR: 5_000,
      reputationalImpact: false,
    });
    expect(result).toBe("minor");
  });

  it("classifyWithDetails returns all 7 criteria", () => {
    const result = classifyWithDetails({
      affectedClients: 150_000,
      totalClients: 500_000,
      durationMinutes: 60,
      dataLoss: false,
      serviceType: "critical",
      geographicScope: "national",
    });
    expect(Object.keys(result.criteria)).toHaveLength(7);
    expect(result.criteriaMatched).toContain("clientsAbsolute");
    expect(result.criteriaMatched).toContain("clientsPercentage");
  });

  it("requiresDORAReport returns true for major, false for minor", () => {
    expect(requiresDORAReport("major")).toBe(true);
    expect(requiresDORAReport("minor")).toBe(false);
  });
});
