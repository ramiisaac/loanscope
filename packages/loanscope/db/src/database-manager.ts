import type { LoanScopeDB } from "./connection";
import { createDatabase, createMemoryDatabase } from "./connection";
import { applySchema } from "./migrate";
import { PersistentLenderRegistry } from "./persistent-registry";
import { CustomProductService } from "./custom-product-service";
import { createScenarioRepository } from "./repositories/scenario-repository";
import { createScenarioVersionRepository } from "./repositories/scenario-version-repository";
import { createComparisonRepository } from "./repositories/comparison-repository";
import { createSimulationRepository } from "./repositories/simulation-repository";
import { createImportRunRepository } from "./repositories/import-run-repository";
import { createAuditSessionRepository } from "./repositories/audit-session-repository";
import type { SavedScenarioRepository } from "./repositories/scenario-repository";
import type { ScenarioVersionRepository } from "./repositories/scenario-version-repository";
import type { SavedComparisonRepository } from "./repositories/comparison-repository";
import type { SavedSimulationRepository } from "./repositories/simulation-repository";
import type { ImportRunRepository } from "./repositories/import-run-repository";
import type { AuditSessionRepository } from "./repositories/audit-session-repository";

/**
 * High-level database manager that provides a unified entry point
 * for all persistence operations. Manages the database lifecycle
 * (creation, migration, closure) and exposes typed repositories
 * and services.
 */
export class DatabaseManager {
  readonly db: LoanScopeDB;
  readonly lenders: PersistentLenderRegistry;
  readonly customProducts: CustomProductService;
  readonly scenarios: SavedScenarioRepository;
  readonly scenarioVersions: ScenarioVersionRepository;
  readonly comparisons: SavedComparisonRepository;
  readonly simulations: SavedSimulationRepository;
  readonly importRuns: ImportRunRepository;
  readonly auditSessions: AuditSessionRepository;

  private constructor(db: LoanScopeDB) {
    this.db = db;
    this.lenders = new PersistentLenderRegistry(db);
    this.customProducts = new CustomProductService(db);
    this.scenarios = createScenarioRepository(db);
    this.scenarioVersions = createScenarioVersionRepository(db);
    this.comparisons = createComparisonRepository(db);
    this.simulations = createSimulationRepository(db);
    this.importRuns = createImportRunRepository(db);
    this.auditSessions = createAuditSessionRepository(db);
  }

  /**
   * Opens (or creates) a database at the given path, applies the schema,
   * and returns a fully initialized DatabaseManager.
   */
  static open(path: string): DatabaseManager {
    const db = createDatabase(path);
    applySchema(db);
    return new DatabaseManager(db);
  }

  /** Creates an in-memory database for tests. */
  static memory(): DatabaseManager {
    const db = createMemoryDatabase();
    applySchema(db);
    return new DatabaseManager(db);
  }

  /** Returns database statistics. */
  stats(): DatabaseStats {
    return {
      lenders: this.lenders.size,
      scenarios: this.scenarios.findAll().length,
      scenarioVersions: this.scenarios
        .findAll()
        .reduce((sum, s) => sum + this.scenarioVersions.countVersions(s.scenarioId), 0),
      comparisons: this.comparisons.findAll().length,
      simulations: this.simulations.findAll().length,
      customProductSets: this.customProducts.listSets().length,
      importRuns: this.importRuns.findAll().length,
      auditSessions: this.auditSessions.findAll().length,
    };
  }
}

export interface DatabaseStats {
  readonly lenders: number;
  readonly scenarios: number;
  readonly scenarioVersions: number;
  readonly comparisons: number;
  readonly simulations: number;
  readonly customProductSets: number;
  readonly importRuns: number;
  readonly auditSessions: number;
}
