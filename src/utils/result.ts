type FeatureResultDescriptor = {
  feature: "rules" | "ignore" | "mcp" | "commands" | "subagents" | "skills" | "hooks" | "permissions";
  countKey: keyof CountableResult;
  label: (count: number) => string;
};

export const FEATURE_RESULT_DESCRIPTORS: FeatureResultDescriptor[] = [
  {
    feature: "rules",
    countKey: "rulesCount",
    label: (count) => (count === 1 ? "rule" : "rules"),
  },
  {
    feature: "ignore",
    countKey: "ignoreCount",
    label: (count) => (count === 1 ? "ignore file" : "ignore files"),
  },
  {
    feature: "mcp",
    countKey: "mcpCount",
    label: (count) => (count === 1 ? "MCP file" : "MCP files"),
  },
  {
    feature: "commands",
    countKey: "commandsCount",
    label: (count) => (count === 1 ? "command" : "commands"),
  },
  {
    feature: "subagents",
    countKey: "subagentsCount",
    label: (count) => (count === 1 ? "subagent" : "subagents"),
  },
  {
    feature: "skills",
    countKey: "skillsCount",
    label: (count) => (count === 1 ? "skill" : "skills"),
  },
  {
    feature: "hooks",
    countKey: "hooksCount",
    label: (count) => (count === 1 ? "hooks file" : "hooks files"),
  },
  {
    feature: "permissions",
    countKey: "permissionsCount",
    label: (count) => (count === 1 ? "permissions file" : "permissions files"),
  },
];

/**
 * Result of writing AI files, including both count and file paths
 */
export type WriteResult = {
  count: number;
  paths: string[];
};

/**
 * Result of feature generation, extending WriteResult with hasDiff
 */
export type FeatureGenerateResult = WriteResult & { hasDiff: boolean };

/**
 * Common count fields shared by ImportResult and GenerateResult
 */
export type CountableResult = {
  rulesCount: number;
  ignoreCount: number;
  mcpCount: number;
  commandsCount: number;
  subagentsCount: number;
  skillsCount: number;
  hooksCount: number;
  permissionsCount: number;
};

/**
 * Calculate the total count from a result object
 */
export function calculateTotalCount(result: CountableResult): number {
  return FEATURE_RESULT_DESCRIPTORS.reduce((total, descriptor) => {
    return total + result[descriptor.countKey];
  }, 0);
}

export function buildFeatureSummaryParts(result: CountableResult): string[] {
  return FEATURE_RESULT_DESCRIPTORS.flatMap((descriptor) => {
    const count = result[descriptor.countKey];
    if (count === 0) {
      return [];
    }
    return `${count} ${descriptor.label(count)}`;
  });
}
