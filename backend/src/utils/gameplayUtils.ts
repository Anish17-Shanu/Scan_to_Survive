export function buildGameplayMeta(mainSteps: number, rapidFireQuestions: number, rapidDurationSeconds: number) {
  return {
    main_steps: mainSteps,
    rapid_fire_questions: rapidFireQuestions,
    rapid_fire_duration_seconds: rapidDurationSeconds,
    total_steps: mainSteps + rapidFireQuestions
  };
}

export function computeProgressPercent(currentOrder: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  const normalized = Math.max(0, Math.min(currentOrder, totalSteps));
  return (normalized / totalSteps) * 100;
}

export function buildMilestoneBadge(title: string, order: number): string {
  return `${title.toUpperCase().replace(/\s+/g, "-")}-${order}`;
}
