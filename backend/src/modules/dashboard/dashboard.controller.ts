import type { Request, Response } from 'express';
import type { DashboardService, Boundaries } from './dashboard.service';

// Fronteiras de fallback em UTC (usadas se o cliente não mandar as suas).
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
export function startOfUtcWeek(now: Date): Date {
  const day = startOfUtcDay(now);
  const dow = day.getUTCDay(); // 0=domingo
  return new Date(day.getTime() - dow * 86400_000);
}

// Um param só é aceito se for uma data válida; senão, cai no fallback.
function parseBoundary(raw: unknown, fallback: Date): Date {
  if (typeof raw !== 'string') return fallback;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? fallback : d;
}

export function createDashboardController(service: DashboardService) {
  return {
    async get(req: Request, res: Response) {
      const now = new Date();
      const b: Boundaries = {
        today: parseBoundary(req.query.today, startOfUtcDay(now)),
        week: parseBoundary(req.query.week, startOfUtcWeek(now)),
        month: parseBoundary(req.query.month, startOfUtcMonth(now)),
      };
      res.json(await service.getStats(b));
    },
  };
}
