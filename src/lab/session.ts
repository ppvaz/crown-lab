
import type { RunMetrics } from './metrics';

export interface Attempt {
  attempt: number;
  combatId: string;
  slowMoId: string;
  encounterId: string;
  seed: number;
  metrics: RunMetrics;
}

export class Session {
  private readonly attempts: Attempt[] = [];
  private readonly counters = new Map<string, number>();

  private key(combatId: string, encounterId: string, slowMoId: string): string {
    return `${combatId}|${encounterId}|${slowMoId}`;
  }

  nextAttempt(combatId: string, encounterId: string, slowMoId: string): number {
    return (this.counters.get(this.key(combatId, encounterId, slowMoId)) ?? 0) + 1;
  }

  record(entry: Attempt): void {
    const k = this.key(entry.combatId, entry.encounterId, entry.slowMoId);
    this.counters.set(k, Math.max(this.counters.get(k) ?? 0, entry.attempt));
    this.attempts.push(entry);
  }

  all(): readonly Attempt[] {
    return this.attempts;
  }

  forConfig(combatId: string, encounterId: string, slowMoId: string): Attempt[] {
    return this.attempts.filter(
      (a) => a.combatId === combatId && a.encounterId === encounterId && a.slowMoId === slowMoId,
    );
  }

  summary(combatId: string, encounterId: string, slowMoId: string, limit = 6): string[] {
    const runs = this.forConfig(combatId, encounterId, slowMoId).slice(-limit);
    if (runs.length === 0) return ['  (no completed runs yet)'];
    return runs.map((r) => {
      const m = r.metrics;
      const acc = m.parryAccuracy === null ? ' -- ' : `${(m.parryAccuracy * 100).toFixed(0)}%`;
      const spread = m.offsetSd === null ? ' -- ' : `${m.offsetSd.toFixed(0)}ms`;
      return (
        `  #${String(r.attempt).padStart(2)} ${r.metrics.outcome.padEnd(8)} ` +
        `${(m.durationMs / 1000).toFixed(1)}s  parry ${acc}  sd ${spread}  dmg ${m.damageTaken.toFixed(0)}`
      );
    });
  }
}
