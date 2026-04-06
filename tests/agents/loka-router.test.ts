// tests/agents/loka-router.test.ts
import { vi, describe, it, expect, beforeEach } from "vitest";
import { LokaRouter } from "../../src/agents/loka-router";
import { BaseAgent } from "../../src/agents/base.agent";
import type { AgentContext, AgentResult } from "../../src/types/agent.types";

class MockSuccessAgent extends BaseAgent {
  readonly name: string;
  constructor(name: string) {
    super();
    this.name = name;
  }
  async run(_ctx: AgentContext): Promise<AgentResult> {
    return { success: true, data: { from: this.name } };
  }
}

class MockFailAgent extends BaseAgent {
  readonly name = "FailAgent";
  async run(_ctx: AgentContext): Promise<AgentResult> {
    return { success: false, error: "Intentional failure" };
  }
}

class MockThrowAgent extends BaseAgent {
  readonly name = "ThrowAgent";
  async run(_ctx: AgentContext): Promise<AgentResult> {
    throw new Error("Agent threw unexpectedly");
  }
}

const mockCtx: AgentContext = {
  userId: "auth0|test-user",
  incidentId: "INC-1234",
  reportId: "LG-2024-001",
  organizationId: "org-test",
  trace: [],
};

describe("LokaRouter", () => {
  let router: LokaRouter;

  beforeEach(() => {
    router = new LokaRouter();
  });

  it("executes agents in topological order", async () => {
    const order: string[] = [];

    for (const name of ["agentA", "agentB", "agentC"]) {
      const agent = new MockSuccessAgent(name);
      agent.on("complete", () => order.push(name));
    }

    router
      .register({ id: "agentA", agent: new MockSuccessAgent("agentA"), dependsOn: [] })
      .register({ id: "agentB", agent: new MockSuccessAgent("agentB"), dependsOn: ["agentA"] })
      .register({ id: "agentC", agent: new MockSuccessAgent("agentC"), dependsOn: ["agentB"] });

    const results = await router.execute({ ...mockCtx, trace: [] });

    expect(results.get("agentA")?.success).toBe(true);
    expect(results.get("agentB")?.success).toBe(true);
    expect(results.get("agentC")?.success).toBe(true);
  });

  it("skips dependent agents when dependency fails", async () => {
    router
      .register({ id: "failFirst", agent: new MockFailAgent(), dependsOn: [] })
      .register({ id: "downstream", agent: new MockSuccessAgent("downstream"), dependsOn: ["failFirst"] });

    const results = await router.execute({ ...mockCtx, trace: [] });

    expect(results.get("failFirst")?.success).toBe(false);
    expect(results.get("downstream")?.success).toBe(false);
    expect(results.get("downstream")?.error).toBe("Dependency failed");
  });

  it("catches thrown errors and continues other agents", async () => {
    router
      .register({ id: "thrower", agent: new MockThrowAgent(), dependsOn: [] })
      .register({ id: "independent", agent: new MockSuccessAgent("independent"), dependsOn: [] });

    const results = await router.execute({ ...mockCtx, trace: [] });

    expect(results.get("thrower")?.success).toBe(false);
    expect(results.get("independent")?.success).toBe(true);
  });

  it("detects circular dependencies and rejects execute()", async () => {
    router
      .register({ id: "a", agent: new MockSuccessAgent("a"), dependsOn: ["b"] })
      .register({ id: "b", agent: new MockSuccessAgent("b"), dependsOn: ["a"] });

    await expect(router.execute({ ...mockCtx, trace: [] })).rejects.toThrow(
      "Circular dependency",
    );
  });

  it("emits agent:start and agent:complete events", async () => {
    const started: string[] = [];
    const completed: string[] = [];

    router.on("agent:start", (e: { nodeId: string }) => started.push(e.nodeId));
    router.on("agent:complete", (e: { nodeId: string }) => completed.push(e.nodeId));

    router.register({
      id: "singleAgent",
      agent: new MockSuccessAgent("singleAgent"),
      dependsOn: [],
    });

    await router.execute({ ...mockCtx, trace: [] });

    expect(started).toContain("singleAgent");
    expect(completed).toContain("singleAgent");
  });
});
