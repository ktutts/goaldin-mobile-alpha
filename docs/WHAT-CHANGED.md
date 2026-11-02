# Change summary

- `app/today.tsx`: retries a missing pending action for up to two active goals, non-blocking; reloads when one is safely prepared.
- `app/goal/[id].tsx`: on/off preference under YOUR PATH; refresh after a completed Move's routine continuation; keeps previous TypeScript parameter annotations.
- `app/goal/milestone/[milestoneId].tsx`: triggers the same continuation after a successful completeNextMoveEngine call.
- `lib/nextMoveReadiness.ts`: user-consent check (latest goal-created/preference event), safe routine-only planning, model acknowledgement, recent blockers check, no progress rewriting, second status verification, no direct reminder/sensor activity, single-flight per device.
- `scripts/apply-goal-it-ready.cjs`: safe patch for the current GOAL IT creation experience, not a full-screen replacement.
- `scripts/apply-coach-routine.cjs`: safe patch against current goal-coach; protects recently deployed `Reached when:` fix and logs.
- `scripts/apply-plan-goal-quality.cjs`: improved new-goal planning prompt, independent of the goal-coach function.

No existing paths, milestones, workouts, schedules or reminders in a live account are automatically migrated by the package itself.
