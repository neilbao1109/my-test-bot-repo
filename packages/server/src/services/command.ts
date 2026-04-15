import type { CommandResult } from '../types.js';

interface CommandDef {
  name: string;
  description: string;
  usage: string;
}

const COMMANDS: CommandDef[] = [
  { name: 'help', description: 'Show available commands', usage: '/help' },
  { name: 'clear', description: 'Clear conversation history (UI only)', usage: '/clear' },
  { name: 'model', description: 'Switch or show current model', usage: '/model [name]' },
  { name: 'system', description: 'Set system prompt for Bot', usage: '/system <prompt>' },
  { name: 'status', description: 'Show Bot status', usage: '/status' },
  { name: 'export', description: 'Export chat history', usage: '/export [json|md]' },
  { name: 'thread', description: 'Start a thread on the last message', usage: '/thread' },
];

// State per room
const roomState: Map<string, { model: string; systemPrompt: string }> = new Map();

function getState(roomId: string) {
  if (!roomState.has(roomId)) {
    roomState.set(roomId, { model: 'default', systemPrompt: '' });
  }
  return roomState.get(roomId)!;
}

export function parseCommand(input: string): { command: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { command: trimmed.slice(1).toLowerCase(), args: '' };
  }
  return {
    command: trimmed.slice(1, spaceIdx).toLowerCase(),
    args: trimmed.slice(spaceIdx + 1).trim(),
  };
}

export function executeCommand(command: string, args: string, roomId: string): CommandResult {
  const state = getState(roomId);

  switch (command) {
    case 'help': {
      const lines = COMMANDS.map(c => `**${c.usage}** — ${c.description}`);
      return { success: true, output: '📋 **Available Commands:**\n\n' + lines.join('\n') };
    }
    case 'clear':
      return { success: true, output: '🗑️ Conversation cleared.', data: { action: 'clear' } };
    case 'model': {
      if (!args) {
        return { success: true, output: `🤖 Current model: **${state.model}**` };
      }
      state.model = args;
      return { success: true, output: `🤖 Model switched to **${args}**` };
    }
    case 'system': {
      if (!args) {
        return { success: true, output: state.systemPrompt ? `📝 System prompt: ${state.systemPrompt}` : '📝 No system prompt set.' };
      }
      state.systemPrompt = args;
      return { success: true, output: `📝 System prompt updated.` };
    }
    case 'status': {
      const mode = process.env.OPENCLAW_AUTH_TOKEN ? 'OpenClaw Gateway' : 'Demo (mock)';
      return { success: true, output: `✅ **Bot Status:**\n- Mode: ${mode}\n- Gateway: ${process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789'}\n- Model: ${state.model}\n- System Prompt: ${state.systemPrompt || '(none)'}\n- Status: Online` };
    }
    case 'export':
      return { success: true, output: '📦 Export triggered.', data: { action: 'export', format: args || 'json' } };
    case 'thread':
      return { success: true, output: '🧵 Thread started.', data: { action: 'thread' } };
    default:
      return { success: false, output: `❌ Unknown command: /${command}. Type /help for available commands.` };
  }
}

export function getCommands(): CommandDef[] {
  return COMMANDS;
}
