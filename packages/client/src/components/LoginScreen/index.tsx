import { useState } from 'react';
import * as authService from '../../services/auth';
import type { User } from '../../types';

interface LoginScreenProps {
  onLogin: (user: User, token: string) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authService.login(email, password);
      authService.saveToken(result.token);
      onLogin(result.user, result.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const result = await authService.register(email, username, password);
      authService.saveToken(result.token);
      onLogin(result.user, result.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-xl text-white placeholder-dark-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition";

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4 md:px-0">
      <div className="bg-dark-surface rounded-2xl p-8 w-full max-w-md shadow-2xl border border-dark-border">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <span className="text-2xl font-bold text-white">CC</span>
          </div>
          <h1 className="text-2xl font-bold text-white">ClawChat</h1>
          <p className="text-dark-muted mt-2">Chat with AI, together.</p>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 bg-dark-bg rounded-xl p-1">
          <button
            onClick={() => { setTab('login'); setError(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${tab === 'login' ? 'bg-primary-600 text-white' : 'text-dark-muted hover:text-white'}`}
          >
            Login
          </button>
          <button
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${tab === 'register' ? 'bg-primary-600 text-white' : 'text-dark-muted hover:text-white'}`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
            </div>
            <button type="submit" disabled={loading || !email || !password} className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition">
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">Display Name</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Your name" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
            </div>
            <button type="submit" disabled={loading || !email || !username || !password || !confirmPassword} className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
