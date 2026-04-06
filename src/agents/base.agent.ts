// src/agents/base.agent.ts
import { EventEmitter } from "events";
import type { AgentContext, AgentResult, AgentTrace } from "../types/agent.types";

export type { AgentContext, AgentResult, AgentTrace };

export abstract class BaseAgent extends EventEmitter {
  abstract readonly name: string;

  abstract run(ctx: AgentContext): Promise<AgentResult>;

  protected log(message: string, meta?: Record<string, unknown>): void {
    this.emit("log", {
      agent: this.name,
      message,
      meta,
      timestamp: new Date().toISOString(),
    });
  }

  protected emitStatus(
    stage: string,
    reportId: string,
    meta?: Record<string, unknown>,
  ): void {
    this.emit("status", {
      stage,
      agentName: this.name,
      reportId,
      timestamp: new Date().toISOString(),
      meta,
    });
  }

  protected startTrace(ctx: AgentContext): AgentTrace {
    const trace: AgentTrace = {
      agent: this.name,
      startedAt: new Date().toISOString(),
    };
    ctx.trace.push(trace);
    return trace;
  }

  protected completeTrace(trace: AgentTrace, success: boolean): void {
    trace.completedAt = new Date().toISOString();
    trace.success = success;
  }
}
