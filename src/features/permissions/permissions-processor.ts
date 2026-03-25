import { z } from "zod/mini";

import { RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH } from "../../constants/rulesync-paths.js";
import { FeatureProcessor } from "../../types/feature-processor.js";
import type { RulesyncFile } from "../../types/rulesync-file.js";
import type { ToolFile } from "../../types/tool-file.js";
import type { ToolTarget } from "../../types/tool-targets.js";
import { formatError } from "../../utils/error.js";
import type { Logger } from "../../utils/logger.js";
import { ClaudecodePermissions } from "./claudecode-permissions.js";
import { RulesyncPermissions } from "./rulesync-permissions.js";
import type {
  ToolPermissionsForDeletionParams,
  ToolPermissionsFromFileParams,
  ToolPermissionsFromRulesyncPermissionsParams,
  ToolPermissionsSettablePaths,
} from "./tool-permissions.js";
import { ToolPermissions } from "./tool-permissions.js";

const permissionsProcessorToolTargetTuple = ["claudecode"] as const;

export type PermissionsProcessorToolTarget = (typeof permissionsProcessorToolTargetTuple)[number];

export const PermissionsProcessorToolTargetSchema = z.enum(permissionsProcessorToolTargetTuple);

type ToolPermissionsFactory = {
  class: {
    fromRulesyncPermissions(
      params: ToolPermissionsFromRulesyncPermissionsParams & { global?: boolean },
    ): ToolPermissions | Promise<ToolPermissions>;
    fromFile(params: ToolPermissionsFromFileParams): Promise<ToolPermissions>;
    forDeletion(params: ToolPermissionsForDeletionParams): ToolPermissions;
    getSettablePaths(options?: { global?: boolean }): ToolPermissionsSettablePaths;
  };
  meta: {
    supportsProject: boolean;
    supportsGlobal: boolean;
    supportsImport: boolean;
  };
};

const toolPermissionsFactories = new Map<PermissionsProcessorToolTarget, ToolPermissionsFactory>([
  [
    "claudecode",
    {
      class: ClaudecodePermissions,
      meta: {
        supportsProject: false,
        supportsGlobal: true,
        supportsImport: true,
      },
    },
  ],
]);

const permissionsProcessorToolTargets: ToolTarget[] = [...toolPermissionsFactories.entries()]
  .filter(([, factory]) => factory.meta.supportsProject)
  .map(([target]) => target);
const permissionsProcessorToolTargetsGlobal: ToolTarget[] = [...toolPermissionsFactories.entries()]
  .filter(([, factory]) => factory.meta.supportsGlobal)
  .map(([target]) => target);
const permissionsProcessorToolTargetsImportable: ToolTarget[] = [...toolPermissionsFactories.entries()]
  .filter(([, factory]) => factory.meta.supportsProject && factory.meta.supportsImport)
  .map(([target]) => target);
const permissionsProcessorToolTargetsGlobalImportable: ToolTarget[] = [
  ...toolPermissionsFactories.entries(),
]
  .filter(([, factory]) => factory.meta.supportsGlobal && factory.meta.supportsImport)
  .map(([target]) => target);

export class PermissionsProcessor extends FeatureProcessor {
  private readonly toolTarget: PermissionsProcessorToolTarget;
  private readonly global: boolean;

  constructor({
    baseDir = process.cwd(),
    toolTarget,
    global = false,
    dryRun = false,
    logger,
  }: {
    baseDir?: string;
    toolTarget: ToolTarget;
    global?: boolean;
    dryRun?: boolean;
    logger: Logger;
  }) {
    super({ baseDir, dryRun, logger });
    const result = PermissionsProcessorToolTargetSchema.safeParse(toolTarget);
    if (!result.success) {
      throw new Error(
        `Invalid tool target for PermissionsProcessor: ${toolTarget}. ${formatError(result.error)}`,
      );
    }
    this.toolTarget = result.data;
    this.global = global;
  }

  private getFactory(): ToolPermissionsFactory {
    const factory = toolPermissionsFactories.get(this.toolTarget);
    if (!factory) {
      throw new Error(`Unsupported tool target: ${this.toolTarget}`);
    }
    return factory;
  }

  private getRulesyncBaseDir(): string {
    return this.global ? process.cwd() : this.baseDir;
  }

  async loadRulesyncFiles(): Promise<RulesyncFile[]> {
    try {
      return [
        await RulesyncPermissions.fromFile({
          baseDir: this.getRulesyncBaseDir(),
          validate: true,
        }),
      ];
    } catch (error) {
      this.logger.debug(
        `Failed to load Rulesync permissions file (${RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH}): ${formatError(error)}`,
      );
      return [];
    }
  }

  async loadToolFiles({ forDeletion = false }: { forDeletion?: boolean } = {}): Promise<ToolFile[]> {
    try {
      const factory = this.getFactory();
      const paths = factory.class.getSettablePaths({ global: this.global });
      if (forDeletion) {
        const toolPermissions = factory.class.forDeletion({
          baseDir: this.baseDir,
          relativeDirPath: paths.relativeDirPath,
          relativeFilePath: paths.relativeFilePath,
          global: this.global,
        });
        return toolPermissions.isDeletable() ? [toolPermissions] : [];
      }

      const toolPermissions = await factory.class.fromFile({
        baseDir: this.baseDir,
        validate: true,
        global: this.global,
      });
      return [toolPermissions];
    } catch (error) {
      const message = `Failed to load permissions files for tool target: ${this.toolTarget}: ${formatError(error)}`;
      if (error instanceof Error && error.message.includes("no such file or directory")) {
        this.logger.debug(message);
      } else {
        this.logger.error(message);
      }
      return [];
    }
  }

  async convertRulesyncFilesToToolFiles(rulesyncFiles: RulesyncFile[]): Promise<ToolFile[]> {
    const rulesyncPermissions = rulesyncFiles.find(
      (file): file is RulesyncPermissions => file instanceof RulesyncPermissions,
    );
    if (!rulesyncPermissions) {
      throw new Error(`No ${RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH} found.`);
    }

    const factory = this.getFactory();
    const toolPermissions = await factory.class.fromRulesyncPermissions({
      baseDir: this.baseDir,
      rulesyncPermissions,
      global: this.global,
    });
    return [toolPermissions];
  }

  async convertToolFilesToRulesyncFiles(toolFiles: ToolFile[]): Promise<RulesyncFile[]> {
    const toolPermissions = toolFiles.filter(
      (file): file is ToolPermissions => file instanceof ToolPermissions,
    );
    return toolPermissions.map((file) => file.toRulesyncPermissions());
  }

  static getToolTargets({
    global = false,
    importOnly = false,
  }: {
    global?: boolean;
    importOnly?: boolean;
  } = {}): ToolTarget[] {
    if (global) {
      return importOnly
        ? permissionsProcessorToolTargetsGlobalImportable
        : permissionsProcessorToolTargetsGlobal;
    }
    return importOnly ? permissionsProcessorToolTargetsImportable : permissionsProcessorToolTargets;
  }
}
