import YAML from "yaml";

export const parseYaml = <T = unknown>(content: string): T => YAML.parse(content) as T;

export const stringifyYaml = <T>(data: T): string => YAML.stringify(data);

export const yamlToJson = <T = unknown>(content: string): T => parseYaml<T>(content);

export const jsonToYaml = <T>(data: T): string => stringifyYaml(data);
