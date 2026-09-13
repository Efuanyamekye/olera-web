import { getCityConfig, hourIn, nextStaffedStart } from './config';

export function citySendWindow(slug: string, now = new Date()) {
  const config = getCityConfig(slug);
  if (!config) throw new Error('Unknown city timezone; cannot schedule safely');
  return { allowed: hourIn(config.timeZone, now) >= 8 && hourIn(config.timeZone, now) < 20, timeZone: config.timeZone,
    nextStart: nextStaffedStart(config.timeZone, now).toISOString() };
}

