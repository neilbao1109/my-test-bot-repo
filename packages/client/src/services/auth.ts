import type { User } from '../types';

const API_BASE = '/api/auth';

export async function register(email: string, username: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function getMe(token: string): Promise<User> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invalid token');
  return data.user;
}

export function saveToken(token: string) {
  localStorage.setItem('clawchat_token', token);
}

export function getToken(): string | null {
  return localStorage.getItem('clawchat_token');
}

export function clearToken() {
  localStorage.removeItem('clawchat_token');
}
