import fs from "fs-extra";
import { globby } from "globby";
import path from "node:path";

export const readFile = (filePath: string): Promise<string> => fs.readFile(filePath, "utf-8");

export const writeFile = (filePath: string, content: string): Promise<void> =>
  fs.outputFile(filePath, content, "utf-8");

export const readFileSync = (filePath: string): string => fs.readFileSync(filePath, "utf-8");

export const writeFileSync = (filePath: string, content: string): void =>
  fs.outputFileSync(filePath, content, "utf-8");

export const exists = (filePath: string): Promise<boolean> => fs.pathExists(filePath);

export const existsSync = (filePath: string): boolean => fs.pathExistsSync(filePath);

export const ensureDir = (dirPath: string): Promise<void> => fs.ensureDir(dirPath);

export const ensureDirSync = (dirPath: string): void => fs.ensureDirSync(dirPath);

export const remove = (filePath: string): Promise<void> => fs.remove(filePath);

export const removeSync = (filePath: string): void => fs.removeSync(filePath);

export const copy = (src: string, dest: string): Promise<void> => fs.copy(src, dest);

export const copySync = (src: string, dest: string): void => fs.copySync(src, dest);

export const move = (src: string, dest: string): Promise<void> => fs.move(src, dest);

export const moveSync = (src: string, dest: string): void => fs.moveSync(src, dest);

export const glob = (patterns: string | string[], options?: { cwd?: string }): Promise<string[]> =>
  globby(patterns, options);

export const readDir = (dirPath: string): Promise<string[]> => fs.readdir(dirPath);

export const readDirSync = (dirPath: string): string[] => fs.readdirSync(dirPath);

export const stat = (filePath: string): Promise<fs.Stats> => fs.stat(filePath);

export const statSync = (filePath: string): fs.Stats => fs.statSync(filePath);

export const isFile = async (filePath: string): Promise<boolean> => {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
};

export const isDirectory = async (dirPath: string): Promise<boolean> => {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
};

export const join = (...paths: string[]): string => path.join(...paths);

export const resolve = (...paths: string[]): string => path.resolve(...paths);

export const dirname = (filePath: string): string => path.dirname(filePath);

export const basename = (filePath: string, ext?: string): string => path.basename(filePath, ext);

export const extname = (filePath: string): string => path.extname(filePath);
