import { getDb } from '../db/schema.js';
import { getBridge } from './bot-registry.js';
import { v4 as uuid } from 'uuid';

const MAX_CONTENT_SIZE = 50 * 1024; // 50KB

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

function rowToDeployment(row: any): SkillDeployment {
  return {
    id: row.id,
    botId: row.bot_id,
    skillName: row.skill_name,
    content: row.content,
    deployedBy: row.deployed_by,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    deployedAt: row.deployed_at,
  };
}

/**
 * Deploy (or update) a skill to a bot.
 */
export async function deploySkill(
  botId: string,
  skillName: string,
  content: string,
  deployedBy: string
): Promise<SkillDeployment> {
  if (content.length > MAX_CONTENT_SIZE) {
    throw new Error(`Skill content too large (${content.length} bytes, max ${MAX_CONTENT_SIZE})`);
  }

  const db = getDb();
  const id = uuid();

  // Upsert into skill_deployments
  db.prepare(`
    INSERT INTO skill_deployments (id, bot_id, skill_name, content, deployed_by, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
    ON CONFLICT(bot_id, skill_name) DO UPDATE SET
      content = excluded.content,
      deployed_by = excluded.deployed_by,
      status = 'pending',
      error_message = NULL,
      deployed_at = NULL,
      created_at = datetime('now')
  `).run(id, botId, skillName, content, deployedBy);

  // Get the actual row (might be the old id if it was an update)
  const row = db.prepare(
    'SELECT * FROM skill_deployments WHERE bot_id = ? AND skill_name = ?'
  ).get(botId, skillName) as any;

  // Send install instruction via BotBridge
  const bridge = getBridge(botId);
  if (!bridge) {
    db.prepare(
      'UPDATE skill_deployments SET status = ?, error_message = ? WHERE bot_id = ? AND skill_name = ?'
    ).run('failed', 'Bot bridge not found', botId, skillName);
    const updated = db.prepare('SELECT * FROM skill_deployments WHERE bot_id = ? AND skill_name = ?').get(botId, skillName) as any;
    return rowToDeployment(updated);
  }

  try {
    const result = await bridge.sendSkillInstall(skillName, content);
    if (result.ok) {
      db.prepare(
        'UPDATE skill_deployments SET status = ?, deployed_at = datetime(\'now\') WHERE bot_id = ? AND skill_name = ?'
      ).run('deployed', botId, skillName);
    } else {
      db.prepare(
        'UPDATE skill_deployments SET status = ?, error_message = ? WHERE bot_id = ? AND skill_name = ?'
      ).run('failed', result.error || 'Unknown error', botId, skillName);
    }
  } catch (err: any) {
    db.prepare(
      'UPDATE skill_deployments SET status = ?, error_message = ? WHERE bot_id = ? AND skill_name = ?'
    ).run('failed', err.message, botId, skillName);
  }

  const final = db.prepare('SELECT * FROM skill_deployments WHERE bot_id = ? AND skill_name = ?').get(botId, skillName) as any;
  return rowToDeployment(final);
}

/**
 * Undeploy a skill from a bot.
 */
export async function undeploySkill(
  botId: string,
  skillName: string,
  _deployedBy: string
): Promise<{ ok: boolean; error?: string }> {
  const bridge = getBridge(botId);
  if (bridge) {
    try {
      await bridge.sendSkillUninstall(skillName);
    } catch (err: any) {
      console.warn(`[SkillDeploy] Uninstall RPC failed for ${skillName}: ${err.message}`);
    }
  }

  const db = getDb();
  db.prepare('DELETE FROM skill_deployments WHERE bot_id = ? AND skill_name = ?').run(botId, skillName);
  return { ok: true };
}

/**
 * List all skill deployments for a bot.
 */
export function listSkills(botId: string): SkillDeployment[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM skill_deployments WHERE bot_id = ? ORDER BY created_at DESC').all(botId) as any[];
  return rows.map(rowToDeployment);
}

/**
 * Get a single skill deployment.
 */
export function getSkill(botId: string, skillName: string): SkillDeployment | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skill_deployments WHERE bot_id = ? AND skill_name = ?').get(botId, skillName) as any;
  return row ? rowToDeployment(row) : null;
}
