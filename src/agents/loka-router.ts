// src/agents/loka-router.ts
import { EventEmitter } from "events";
import type { BaseAgent } from "./base.agent";
import type { AgentContext, AgentResult } from "../types/agent.types";

export interface AgentNode {
  id: string;
  agent: BaseAgent;
  dependsOn: string[];
}

export class LokaRouter extends EventEmitter {
  private registry = new Map<string, AgentNode>();

  register(node: AgentNode): this {
    this.registry.set(node.id, node);
    return this;
  }

  async execute(ctx: AgentContext): Promise<Map<string, AgentResult>> {
    const results = new Map<string, AgentResult>();
    const order = this.topologicalSort();

    for (const nodeId of order) {
      const node = this.registry.get(nodeId)!;

      // Forward all agent events to the router (dashboard subscribes to router)
      node.agent.on("status", (event: unknown) => this.emit("agent:status", event));
      node.agent.on("log", (event: unknown) => this.emit("agent:log", event));

      // Check all dependencies succeeded
      const depsFailed = node.dependsOn.some(
        (dep) => !results.get(dep)?.success,
      );
      if (depsFailed) {
        results.set(nodeId, { success: false, error: "Dependency failed" });
        this.emit("agent:skip", { nodeId, reason: "Dependency failed" });
        continue;
      }

      this.emit("agent:start", { nodeId, timestamp: new Date().toISOString() });
      try {
        const result = await node.agent.run(ctx);

        // Propagate data to ctx for downstream agents
        if (result.data) {
          if (nodeId === "regDataAgent") {
            ctx.incidentData = result.data as Record<string, unknown>;
          } else if (nodeId === "classifyAgent") {
            ctx.classificationResult = result.data as Record<string, unknown>;
          } else if (nodeId === "draftAgent") {
            ctx.draftReport = result.data as Record<string, unknown>;
          }
        }

        results.set(nodeId, result);
        this.emit("agent:complete", {
          nodeId,
          success: result.success,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        results.set(nodeId, { success: false, error });
        this.emit("agent:error", {
          nodeId,
          error,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  private topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();

    for (const [id, node] of this.registry) {
      inDegree.set(id, node.dependsOn.length);
      for (const dep of node.dependsOn) {
        if (!graph.has(dep)) graph.set(dep, []);
        graph.get(dep)!.push(id);
      }
    }

    const queue = [...this.registry.keys()].filter(
      (id) => inDegree.get(id) === 0,
    );
    const order: string[] = [];

    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const next of graph.get(id) ?? []) {
        const prev = inDegree.get(next)!;
        inDegree.set(next, prev - 1);
        if (inDegree.get(next) === 0) queue.push(next);
      }
    }

    if (order.length !== this.registry.size) {
      throw new Error("Circular dependency detected in agent DAG");
    }

    return order;
  }
}
