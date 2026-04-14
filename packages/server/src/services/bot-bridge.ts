import type { BotContext, BotStatus } from '../types.js';

/**
 * Bot Bridge — abstraction layer for communicating with AI bots.
 * Default implementation uses a simple echo/mock. 
 * Replace with OpenClaw WebChat API for production.
 */

// Simulated streaming: yields chunks of a response
async function* mockStream(content: string): AsyncGenerator<string> {
  // Simulate a thoughtful bot response
  const responses: Record<string, string> = {
    default: "I'm ClawBot, your AI assistant. I can help with coding, questions, creative tasks, and more. Try asking me something specific!",
  };

  let response = responses.default;

  // Simple keyword matching for demo
  const lower = content.toLowerCase();
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('你好')) {
    response = "Hey there! 👋 I'm ClawBot. What can I help you with today?";
  } else if (lower.includes('help')) {
    response = "I can help with:\n- **Coding** — Write, debug, explain code\n- **Questions** — Answer anything I know\n- **Creative** — Stories, ideas, brainstorming\n- **Commands** — Type `/help` for slash commands\n\nJust ask away!";
  } else if (lower.includes('code') || lower.includes('function')) {
    response = "Sure! Here's an example:\n\n```typescript\nfunction greet(name: string): string {\n  return `Hello, ${name}! Welcome to ClawChat.`;\n}\n\nconsole.log(greet('World'));\n```\n\nWant me to write something specific?";
  } else if (lower.includes('joke')) {
    response = "Why do programmers prefer dark mode? Because light attracts bugs! 🐛😄";
  } else {
    // Generate a contextual response
    response = `I received your message: "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"\n\nThis is a demo response from ClawBot. In production, this would connect to OpenClaw or another AI backend for real responses.\n\nTry these:\n- Ask me to write code\n- Tell me a topic to discuss\n- Use \`/help\` for commands`;
  }

  // Stream character by character with realistic delays
  const words = response.split(' ');
  for (let i = 0; i < words.length; i++) {
    const chunk = (i === 0 ? '' : ' ') + words[i];
    yield chunk;
    await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50));
  }
}

export async function* streamBotResponse(content: string, context: BotContext): AsyncGenerator<string> {
  yield* mockStream(content);
}

export async function getBotStatus(): Promise<BotStatus> {
  return {
    connected: true,
    model: 'clawbot-demo',
    uptime: process.uptime(),
  };
}
