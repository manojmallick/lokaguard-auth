// src/llm/qwen.client.ts
// Ollama HTTP client for Qwen 2.5

import { config } from "../config";

export interface QwenMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface QwenResponse {
  model: string;
  message: QwenMessage;
  done: boolean;
  total_duration?: number;
}

export class QwenClient {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = config.OLLAMA_BASE_URL;
    this.model = config.OLLAMA_MODEL;
  }

  async chat(messages: QwenMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama error: ${res.status} ${body}`);
    }

    const data = (await res.json()) as QwenResponse;
    return data.message.content;
  }

  async generate(prompt: string): Promise<string> {
    return this.chat([{ role: "user", content: prompt }]);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let qwenInstance: QwenClient | null = null;

export function getQwenClient(): QwenClient {
  if (!qwenInstance) {
    qwenInstance = new QwenClient();
  }
  return qwenInstance;
}
