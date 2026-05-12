import { getToken } from './auth';

const API_BASE = '/api';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface SkillDeployment {
  id: string;
  botId: string;
  skillName: string;
  content: string;
  deployedBy: string;
  status: 'pending' | 'deployed' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  deployedAt: string | null;
}

export async function deploySkill(botId: string, name: string, content: string): Promise<SkillDeployment> {
  const res = await fetch(`${API_BASE}/bots/${botId}/skills`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Deploy failed');
  return data;
}

export async function listSkills(botId: string): Promise<SkillDeployment[]> {
  const res = await fetch(`${API_BASE}/bots/${botId}/skills`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to list skills');
  return data;
}

export async function removeSkill(botId: string, name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/bots/${botId}/skills/${name}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to remove skill');
  }
}
