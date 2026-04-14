import { useState } from 'react';

interface LoginScreenProps {
  onLogin: (username: string) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (name) onLogin(name);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg">
      <div className="bg-dark-surface rounded-2xl p-8 w-full max-w-md shadow-2xl border border-dark-border">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <span className="text-2xl font-bold text-white">CC</span>
          </div>
          <h1 className="text-2xl font-bold text-white">ClawChat</h1>
          <p className="text-dark-muted mt-2">Chat with AI, together.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-text mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name..."
              autoFocus
              className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-xl text-white placeholder-dark-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
            />
          </div>
          <button
            type="submit"
            disabled={!username.trim()}
            className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition"
          >
            Start Chatting
          </button>
        </form>

        <p className="text-center text-dark-muted text-xs mt-6">
          No account needed. Just pick a name and go.
        </p>
      </div>
    </div>
  );
}
