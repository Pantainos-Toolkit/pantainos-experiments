/**
 * Minimal tool loop implementation for claude-direct
 *
 * The protocol is simple:
 * 1. Send messages to /v1/messages
 * 2. If stop_reason === "tool_use", execute tools and add results to messages
 * 3. Call API again with updated messages
 * 4. Repeat until stop_reason === "end_turn" or max turns reached
 */

import { ClaudeDirect } from "./index.js";

// Tool definition (matches Anthropic API schema)
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

// Tool handler function
export type ToolHandler = (input: Record<string, any>) => Promise<string>;

// Content block types from API response
interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, any>;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface ToolLoopOptions {
  messages: Array<{ role: string; content: any }>;
  systemPrompt?: string;
  tools: ToolDefinition[];
  toolHandlers: Record<string, ToolHandler>;
  maxTurns?: number;
  maxTokens?: number;
  onToolUse?: (name: string, input: any, result: string) => void;
}

interface ToolLoopResult {
  content: string;
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCalls: Array<{ name: string; input: any; result: string }>;
}

/**
 * Execute a tool loop - handles tool_use responses automatically
 */
export async function executeToolLoop(
  client: ClaudeDirect,
  options: ToolLoopOptions
): Promise<ToolLoopResult> {
  const {
    systemPrompt,
    tools,
    toolHandlers,
    maxTurns = 10,
    maxTokens = 4096,
    onToolUse,
  } = options;

  // Clone messages to avoid mutation
  const messages: Array<{ role: string; content: any }> = JSON.parse(JSON.stringify(options.messages));

  let turns = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolCalls: Array<{ name: string; input: any; result: string }> = [];
  let finalContent = "";

  while (turns < maxTurns) {
    turns++;

    // Make API call
    const response = await client.queryRaw({
      messages,
      systemPrompt,
      maxTokens,
      tools,
    });

    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;

    // Add assistant message to history
    messages.push({
      role: "assistant",
      content: response.content,
    });

    // Check stop reason
    if (response.stop_reason === "end_turn") {
      // Extract final text
      finalContent = response.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");
      break;
    }

    if (response.stop_reason === "tool_use") {
      // Find tool_use blocks
      const toolUseBlocks = response.content.filter(
        (b: any) => b.type === "tool_use"
      ) as ToolUseBlock[];

      // Execute each tool
      const toolResults: ToolResultBlock[] = [];

      for (const toolUse of toolUseBlocks) {
        const handler = toolHandlers[toolUse.name];
        let result: string;
        let isError = false;

        if (!handler) {
          result = `Error: Unknown tool "${toolUse.name}"`;
          isError = true;
        } else {
          try {
            result = await handler(toolUse.input);
          } catch (err: any) {
            result = `Error: ${err.message}`;
            isError = true;
          }
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
          is_error: isError,
        });

        toolCalls.push({
          name: toolUse.name,
          input: toolUse.input,
          result,
        });

        if (onToolUse) {
          onToolUse(toolUse.name, toolUse.input, result);
        }
      }

      // Add tool results as user message
      messages.push({
        role: "user",
        content: toolResults,
      });
    } else {
      // Unknown stop reason, break
      console.warn(`Unexpected stop_reason: ${response.stop_reason}`);
      break;
    }
  }

  return {
    content: finalContent,
    turns,
    totalInputTokens,
    totalOutputTokens,
    toolCalls,
  };
}

// ============================================
// Example usage
// ============================================

export const exampleTools: ToolDefinition[] = [
  {
    name: "get_weather",
    description: "Get the current weather for a location",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "The city name, e.g. 'Tokyo' or 'San Francisco'",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "calculate",
    description: "Perform a mathematical calculation",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "A mathematical expression, e.g. '2 + 2' or '100 * 0.15'",
        },
      },
      required: ["expression"],
    },
  },
];

export const exampleHandlers: Record<string, ToolHandler> = {
  get_weather: async (input) => {
    // Simulated weather API
    const weather = {
      Tokyo: "22°C, Sunny",
      "San Francisco": "18°C, Foggy",
      London: "15°C, Rainy",
    };
    return weather[input.location as keyof typeof weather] || "Weather data not available";
  },
  calculate: async (input) => {
    try {
      // WARNING: In production, use a proper math parser, not eval!
      const result = Function(`"use strict"; return (${input.expression})`)();
      return String(result);
    } catch (err: any) {
      return `Calculation error: ${err.message}`;
    }
  },
};
