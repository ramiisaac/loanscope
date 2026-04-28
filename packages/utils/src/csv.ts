import { parse } from "csv-parse/sync";
import { stringify, Options as StringifyOptions } from "csv-stringify/sync";

export interface CsvParseOptions {
  columns?: boolean | string[];
  delimiter?: string;
  skip_empty_lines?: boolean;
}

export interface CsvStringifyOptions {
  columns?: string[];
  delimiter?: string;
  header?: boolean;
}

export const parseCsv = <T = Record<string, string>>(
  content: string,
  options: CsvParseOptions = {},
): T[] => {
  return parse(content, {
    columns: options.columns ?? true,
    delimiter: options.delimiter ?? ",",
    skip_empty_lines: options.skip_empty_lines ?? true,
    trim: true,
  }) as T[];
};

export const stringifyCsv = <T extends Record<string, unknown>>(
  data: T[],
  options: CsvStringifyOptions = {},
): string => {
  if (data.length === 0) return "";
  const opts: StringifyOptions = {
    header: options.header ?? true,
    delimiter: options.delimiter ?? ",",
  };
  if (options.columns) {
    opts.columns = options.columns;
  }
  return stringify(data, opts);
};

export const csvToObjects = <T = Record<string, string>>(content: string): T[] =>
  parseCsv<T>(content);

export const objectsToCsv = <T extends Record<string, unknown>>(data: T[]): string =>
  stringifyCsv(data);
