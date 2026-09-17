import type { Href } from 'expo-router';

export function activityDetailHref(activityId: string): Href {
  return `/activity/${encodeURIComponent(activityId)}` as Href;
}

export function activityIdFromRouteParam(
  parameter: string | string[] | undefined,
): string | undefined {
  return Array.isArray(parameter) ? parameter[0] : parameter;
}
