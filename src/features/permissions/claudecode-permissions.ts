import { join } from "node:path";

import type { ValidationResult } from "../../types/ai-file.js";
import type { PermissionsConfig } from "../../types/permissions.js";
import { formatError } from "../../utils/error.js";
import { readFileContentOrNull, readOrInitializeFileContent } from "../../utils/file.js";
import { RulesyncPermissions } from "./rulesync-permissions.js";
import {
  ToolPermissions,
  type ToolPermissionsForDeletionParams,
  type ToolPermissionsFromFileParams,
  type ToolPermissionsFromRulesyncPermissionsParams,
  type ToolPermissionsParams,
  type ToolPermissionsSettablePaths,
} from "./tool-permissions.js";

type ClaudePermissionsValue = {
  allow?: string[] | null;
  ask?: string[] | null;
  deny?: string[] | null;
  [key: string]: unknown;
};

type ClaudeSettingsValue = Record<string, unknown> & {
  permissions?: ClaudePermissionsValue | null;
};

type PermissionAction = keyof Pick<Required<ClaudePermissionsValue>, "allow" | "ask" | "deny">;

const ACTION_PRIORITY: PermissionAction[] = ["deny", "ask", "allow"];

const CANONICAL_TO_CLAUDE_TOOL_NAMES: Record<string, string> = {
  bash: "Bash",
  edit: "Edit",
  read: "Read",
  skill: "Skill",
  webfetch: "WebFetch",
  websearch: "WebSearch",
  write: "Write",
};

const CLAUDE_TO_CANONICAL_TOOL_NAMES = new Map(
  Object.entries(CANONICAL_TO_CLAUDE_TOOL_NAMES).map(([canonical, claude]) => [claude, canonical]),
);

function getClaudeSettingsFileName(global: boolean): string {
  return global ? "settings.json" : "settings.local.json";
}

function toCanonicalToolName(toolName: string): string {
  return CLAUDE_TO_CANONICAL_TOOL_NAMES.get(toolName) ?? toolName;
}

function toClaudeToolName(toolName: string): string {
  return CANONICAL_TO_CLAUDE_TOOL_NAMES[toolName] ?? toolName;
}

function parsePermissionEntry(entry: string): { toolName: string; pattern: string } {
  const match = /^([^()]+)\((.*)\)$/s.exec(entry);
  if (!match) {
    return {
      toolName: toCanonicalToolName(entry),
      pattern: "*",
    };
  }

  return {
    toolName: toCanonicalToolName(match[1]?.trim() ?? entry),
    pattern: match[2] ?? "",
  };
}

function stringifyPermissionEntry(toolName: string, pattern: string): string {
  const claudeToolName = toClaudeToolName(toolName);
  if (pattern === "*") {
    return claudeToolName;
  }
  return `${claudeToolName}(${pattern})`;
}

function getPermissionEntries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function buildCanonicalPermissions(permissions: ClaudePermissionsValue | null | undefined): PermissionsConfig {
  const normalizedEntries = new Map<string, { toolName: string; pattern: string; action: PermissionAction }>();

  for (const action of ACTION_PRIORITY) {
    const entries = getPermissionEntries(permissions?.[action]);
    for (const entry of entries) {
      const { toolName, pattern } = parsePermissionEntry(entry);
      const key = `${toolName}\u0000${pattern}`;
      if (!normalizedEntries.has(key)) {
        normalizedEntries.set(key, { toolName, pattern, action });
      }
    }
  }

  const permission: PermissionsConfig["permission"] = {};
  for (const { toolName, pattern, action } of normalizedEntries.values()) {
    permission[toolName] ??= {};
    permission[toolName][pattern] = action;
  }

  return { permission };
}

function buildClaudePermissions(config: PermissionsConfig): Required<
  Pick<ClaudePermissionsValue, "allow" | "ask" | "deny">
> {
  const byAction: Record<PermissionAction, string[]> = {
    allow: [],
    ask: [],
    deny: [],
  };

  const sortedTools = Object.keys(config.permission).toSorted();
  for (const toolName of sortedTools) {
    const rules = config.permission[toolName];
    if (!rules) {
      continue;
    }
    for (const pattern of Object.keys(rules).toSorted()) {
      const action = rules[pattern];
      if (!action) {
        continue;
      }
      byAction[action].push(stringifyPermissionEntry(toolName, pattern));
    }
  }

  return {
    allow: byAction.allow.toSorted(),
    ask: byAction.ask.toSorted(),
    deny: byAction.deny.toSorted(),
  };
}

export class ClaudecodePermissions extends ToolPermissions {
  private readonly settings: ClaudeSettingsValue;
  private readonly canonicalConfig: PermissionsConfig;

  constructor(params: ToolPermissionsParams) {
    super(params);

    let parsedSettings: ClaudeSettingsValue;
    try {
      parsedSettings = JSON.parse(this.fileContent) as ClaudeSettingsValue;
    } catch (error) {
      throw new Error(
        `Failed to parse Claude settings at ${join(this.relativeDirPath, this.relativeFilePath)}: ${formatError(error)}`,
        { cause: error },
      );
    }

    this.settings = parsedSettings;
    this.canonicalConfig = buildCanonicalPermissions(parsedSettings.permissions);
  }

  getJson(): ClaudeSettingsValue {
    return this.settings;
  }

  getCanonicalConfig(): PermissionsConfig {
    return this.canonicalConfig;
  }

  override isDeletable(): boolean {
    return false;
  }

  static getSettablePaths(options: { global?: boolean } = {}): ToolPermissionsSettablePaths {
    const global = options.global ?? false;
    return {
      relativeDirPath: ".claude",
      relativeFilePath: getClaudeSettingsFileName(global),
    };
  }

  toRulesyncPermissions(): RulesyncPermissions {
    return this.toRulesyncPermissionsDefault({
      fileContent: JSON.stringify(this.canonicalConfig, null, 2),
    });
  }

  static async fromRulesyncPermissions({
    baseDir = process.cwd(),
    rulesyncPermissions,
    validate = true,
    global = false,
  }: ToolPermissionsFromRulesyncPermissionsParams): Promise<ClaudecodePermissions> {
    const paths = this.getSettablePaths({ global });
    const filePath = join(baseDir, paths.relativeDirPath, paths.relativeFilePath);
    const existingContent = await readOrInitializeFileContent(filePath, JSON.stringify({}, null, 2));
    const settings = JSON.parse(existingContent) as ClaudeSettingsValue;
    const existingPermissions = settings.permissions ?? {};
    const mergedSettings: ClaudeSettingsValue = {
      ...settings,
      permissions: {
        ...existingPermissions,
        ...buildClaudePermissions(rulesyncPermissions.getJson()),
      },
    };

    return new ClaudecodePermissions({
      baseDir,
      relativeDirPath: paths.relativeDirPath,
      relativeFilePath: paths.relativeFilePath,
      fileContent: JSON.stringify(mergedSettings, null, 2),
      validate,
      global,
    });
  }

  static async fromFile({
    baseDir = process.cwd(),
    validate = true,
    global = false,
  }: ToolPermissionsFromFileParams): Promise<ClaudecodePermissions> {
    const paths = this.getSettablePaths({ global });
    const filePath = join(baseDir, paths.relativeDirPath, paths.relativeFilePath);
    const fileContent = await readFileContentOrNull(filePath);
    if (fileContent === null) {
      throw new Error(`no such file or directory: ${filePath}`);
    }

    return new ClaudecodePermissions({
      baseDir,
      relativeDirPath: paths.relativeDirPath,
      relativeFilePath: paths.relativeFilePath,
      fileContent,
      validate,
      global,
    });
  }

  validate(): ValidationResult {
    return { success: true, error: null };
  }

  static forDeletion({
    baseDir = process.cwd(),
    relativeDirPath,
    relativeFilePath,
    global = false,
  }: ToolPermissionsForDeletionParams): ClaudecodePermissions {
    return new ClaudecodePermissions({
      baseDir,
      relativeDirPath,
      relativeFilePath,
      fileContent: JSON.stringify({}, null, 2),
      validate: false,
      global,
    });
  }
}
