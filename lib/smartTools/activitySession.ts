import type { ActivitySession } from './types';

export function startActivitySession(
  session: ActivitySession,
  startedAt = new Date().toISOString()
): ActivitySession {
  return {
    ...session,
    status: 'active',
    startedAt,
    endedAt: undefined,
  };
}

export function pauseActivitySession(
  session: ActivitySession
): ActivitySession {
  if (session.status !== 'active') return session;

  return {
    ...session,
    status: 'paused',
  };
}

export function resumeActivitySession(
  session: ActivitySession
): ActivitySession {
  if (session.status !== 'paused') return session;

  return {
    ...session,
    status: 'active',
  };
}

export function stopActivitySession(
  session: ActivitySession,
  endedAt = new Date().toISOString()
): ActivitySession {
  if (
    session.status !== 'active' &&
    session.status !== 'paused'
  ) {
    return session;
  }

  const durationSeconds = session.startedAt
  ? Math.max(
      0,
      Math.floor(
        (new Date(endedAt).getTime() -
          new Date(session.startedAt).getTime()) / 1000
      )
    )
  : 0;

return {
  ...session,
  status: 'completed',
  endedAt,
  metrics: {
    ...session.metrics,
    duration_seconds: durationSeconds,
  },
};
}