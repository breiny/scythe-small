interface GpsAccuracyBadgeProps {
  accuracyMeters: number | null;
}

export function GpsAccuracyBadge({ accuracyMeters }: GpsAccuracyBadgeProps) {
  if (accuracyMeters === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-stone-100 text-stone-500">
        Accuracy unknown
      </span>
    );
  }

  const color =
    accuracyMeters < 3
      ? 'bg-green-100 text-green-700'
      : accuracyMeters <= 5
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-red-100 text-red-700';

  const label =
    accuracyMeters < 3
      ? 'Excellent'
      : accuracyMeters <= 5
        ? 'Good'
        : 'Poor';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${color}`}
    >
      {label} ({accuracyMeters.toFixed(1)}m)
    </span>
  );
}
