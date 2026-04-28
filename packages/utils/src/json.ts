export const parseJson = <T = unknown>(content: string): T => JSON.parse(content) as T;

export const stringifyJson = <T>(data: T, pretty = true): string =>
  pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

export const safeParseJson = <T = unknown>(
  content: string,
): { success: true; data: T } | { success: false; error: Error } => {
  try {
    return { success: true, data: JSON.parse(content) as T };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
};
