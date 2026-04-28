import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerQuoteCommand } from "../commands/quote";
import { registerEvaluateCommand } from "../commands/evaluate";
import { registerCompareCommand } from "../commands/compare";
import { registerGoalseekCommand } from "../commands/goalseek";
import { registerSimulateCommand } from "../commands/simulate";
import { registerDbCommand } from "../commands/db";
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

describe("CLI command registration", () => {
  it("registers quote command", () => {
    const program = new Command();
    registerQuoteCommand(program);
    const quoteCmd = program.commands.find((c) => c.name() === "quote");
    expect(quoteCmd).toBeDefined();
  });

  it("registers evaluate command", () => {
    const program = new Command();
    registerEvaluateCommand(program);
    const evalCmd = program.commands.find((c) => c.name() === "evaluate");
    expect(evalCmd).toBeDefined();
    expect(evalCmd?.options.some((option) => option.long === "--program")).toBe(true);
    expect(evalCmd?.options.some((option) => option.long === "--arm-fixed")).toBe(true);
  });

  it("registers compare command", () => {
    const program = new Command();
    registerCompareCommand(program);
    const compareCmd = program.commands.find((c) => c.name() === "compare");
    expect(compareCmd).toBeDefined();
    expect(compareCmd?.options.some((option) => option.long === "--program")).toBe(true);
  });

  it("registers goalseek command", () => {
    const program = new Command();
    registerGoalseekCommand(program);
    const goalseekCmd = program.commands.find((c) => c.name() === "goalseek");
    expect(goalseekCmd).toBeDefined();
    const maxLoanCmd = goalseekCmd?.commands.find((c) => c.name() === "max-loan");
    expect(maxLoanCmd?.options.some((option) => option.long === "--program")).toBe(true);
  });

  it("registers simulate command", () => {
    const program = new Command();
    registerSimulateCommand(program);
    const simCmd = program.commands.find((c) => c.name() === "simulate");
    expect(simCmd).toBeDefined();
    expect(simCmd?.options.some((option) => option.long === "--program")).toBe(true);
  });
});

describe("db command registration", () => {
  const buildProgram = (): Command => {
    const program = new Command();
    registerDbCommand(program);
    return program;
  };

  const dbCommand = (program: Command): Command => {
    const db = program.commands.find((c) => c.name() === "db");
    if (!db) throw new Error("db command not registered");
    return db;
  };

  it("registers the db parent command", () => {
    expect(dbCommand(buildProgram())).toBeDefined();
  });

  it.each([
    "init",
    "seed",
    "status",
    "list-lenders",
    "list-scenarios",
    "save-scenario",
    "load-scenario",
    "show-scenario",
    "delete-scenario",
    "rename-scenario",
  ])("registers db %s subcommand", (name) => {
    const sub = dbCommand(buildProgram()).commands.find((c) => c.name() === name);
    expect(sub).toBeDefined();
  });

  it("declares required options on save-scenario", () => {
    const save = dbCommand(buildProgram()).commands.find((c) => c.name() === "save-scenario");
    const longs = save?.options.map((o) => o.long) ?? [];
    expect(longs).toEqual(
      expect.arrayContaining(["--config", "--name", "--description", "--id", "--path"]),
    );
  });

  it("declares --output and --path on load-scenario", () => {
    const load = dbCommand(buildProgram()).commands.find((c) => c.name() === "load-scenario");
    const longs = load?.options.map((o) => o.long) ?? [];
    expect(longs).toEqual(expect.arrayContaining(["--output", "--path"]));
  });

  it("declares --json and --path on show-scenario", () => {
    const show = dbCommand(buildProgram()).commands.find((c) => c.name() === "show-scenario");
    const longs = show?.options.map((o) => o.long) ?? [];
    expect(longs).toEqual(expect.arrayContaining(["--json", "--path"]));
  });

  it("declares --name and --path on rename-scenario", () => {
    const rename = dbCommand(buildProgram()).commands.find((c) => c.name() === "rename-scenario");
    const longs = rename?.options.map((o) => o.long) ?? [];
    expect(longs).toEqual(expect.arrayContaining(["--name", "--path"]));
  });
});

describe("db custom-product command registration", () => {
  const findCustomProductCmd = (): Command => {
    const program = new Command();
    registerDbCommand(program);
    const dbCmd = program.commands.find((c) => c.name() === "db");
    expect(dbCmd).toBeDefined();
    const cp = dbCmd?.commands.find((c) => c.name() === "custom-product");
    expect(cp).toBeDefined();
    return cp as Command;
  };

  it("registers custom-product create with --file and --name", () => {
    const cp = findCustomProductCmd();
    const create = cp.commands.find((c) => c.name() === "create");
    expect(create).toBeDefined();
    expect(create?.options.some((o) => o.long === "--file")).toBe(true);
    expect(create?.options.some((o) => o.long === "--name")).toBe(true);
    expect(create?.options.some((o) => o.long === "--set-id")).toBe(true);
    expect(create?.options.some((o) => o.long === "--lender")).toBe(true);
  });

  it("registers custom-product list with --json and --path", () => {
    const cp = findCustomProductCmd();
    const list = cp.commands.find((c) => c.name() === "list");
    expect(list).toBeDefined();
    expect(list?.options.some((o) => o.long === "--json")).toBe(true);
    expect(list?.options.some((o) => o.long === "--path")).toBe(true);
  });

  it("registers custom-product show with a setId argument and --json", () => {
    const cp = findCustomProductCmd();
    const show = cp.commands.find((c) => c.name() === "show");
    expect(show).toBeDefined();
    expect(show?.options.some((o) => o.long === "--json")).toBe(true);
  });

  it("registers custom-product validate with --path", () => {
    const cp = findCustomProductCmd();
    const validate = cp.commands.find((c) => c.name() === "validate");
    expect(validate).toBeDefined();
    expect(validate?.options.some((o) => o.long === "--path")).toBe(true);
  });

  it("registers custom-product delete with --path", () => {
    const cp = findCustomProductCmd();
    const del = cp.commands.find((c) => c.name() === "delete");
    expect(del).toBeDefined();
    expect(del?.options.some((o) => o.long === "--path")).toBe(true);
  });
});

describe("db import command registration", () => {
  const getDbCmd = (): Command => {
    const program = new Command();
    registerDbCommand(program);
    const dbCmd = program.commands.find((c) => c.name() === "db");
    expect(dbCmd).toBeDefined();
    return dbCmd as Command;
  };

  it("registers import with --lender, --file, --format, --json, --path", () => {
    const dbCmd = getDbCmd();
    const imp = dbCmd.commands.find((c) => c.name() === "import");
    expect(imp).toBeDefined();
    expect(imp?.options.some((o) => o.long === "--lender")).toBe(true);
    expect(imp?.options.some((o) => o.long === "--file")).toBe(true);
    expect(imp?.options.some((o) => o.long === "--format")).toBe(true);
    expect(imp?.options.some((o) => o.long === "--json")).toBe(true);
    expect(imp?.options.some((o) => o.long === "--path")).toBe(true);
  });

  it("registers list-import-runs with --lender, --json, --path", () => {
    const dbCmd = getDbCmd();
    const list = dbCmd.commands.find((c) => c.name() === "list-import-runs");
    expect(list).toBeDefined();
    expect(list?.options.some((o) => o.long === "--lender")).toBe(true);
    expect(list?.options.some((o) => o.long === "--json")).toBe(true);
    expect(list?.options.some((o) => o.long === "--path")).toBe(true);
  });

  it("registers show-import-run with --json and --path", () => {
    const dbCmd = getDbCmd();
    const show = dbCmd.commands.find((c) => c.name() === "show-import-run");
    expect(show).toBeDefined();
    expect(show?.options.some((o) => o.long === "--json")).toBe(true);
    expect(show?.options.some((o) => o.long === "--path")).toBe(true);
  });

  it("registers catalog-history with --lender, --json, --path", () => {
    const dbCmd = getDbCmd();
    const hist = dbCmd.commands.find((c) => c.name() === "catalog-history");
    expect(hist).toBeDefined();
    expect(hist?.options.some((o) => o.long === "--lender")).toBe(true);
    expect(hist?.options.some((o) => o.long === "--json")).toBe(true);
    expect(hist?.options.some((o) => o.long === "--path")).toBe(true);
  });
});

describe("db audit command registration", () => {
  const getAuditCmd = (): Command => {
    const program = new Command();
    registerDbCommand(program);
    const dbCmd = program.commands.find((c) => c.name() === "db");
    expect(dbCmd).toBeDefined();
    const audit = dbCmd?.commands.find((c) => c.name() === "audit");
    expect(audit).toBeDefined();
    return audit as Command;
  };

  it("registers audit list with --command, --json, --path", () => {
    const audit = getAuditCmd();
    const list = audit.commands.find((c) => c.name() === "list");
    expect(list).toBeDefined();
    expect(list?.options.some((o) => o.long === "--command")).toBe(true);
    expect(list?.options.some((o) => o.long === "--json")).toBe(true);
    expect(list?.options.some((o) => o.long === "--path")).toBe(true);
  });

  it("registers audit show with --json and --path", () => {
    const audit = getAuditCmd();
    const show = audit.commands.find((c) => c.name() === "show");
    expect(show).toBeDefined();
    expect(show?.options.some((o) => o.long === "--json")).toBe(true);
    expect(show?.options.some((o) => o.long === "--path")).toBe(true);
  });

  it("evaluate command registers --audit", () => {
    const program = new Command();
    registerEvaluateCommand(program);
    const cmd = program.commands.find((c) => c.name() === "evaluate");
    expect(cmd?.options.some((o) => o.long === "--audit")).toBe(true);
  });

  it("compare command registers --audit", () => {
    const program = new Command();
    registerCompareCommand(program);
    const cmd = program.commands.find((c) => c.name() === "compare");
    expect(cmd?.options.some((o) => o.long === "--audit")).toBe(true);
  });

  it("simulate command registers --audit", () => {
    const program = new Command();
    registerSimulateCommand(program);
    const cmd = program.commands.find((c) => c.name() === "simulate");
    expect(cmd?.options.some((o) => o.long === "--audit")).toBe(true);
  });
});
