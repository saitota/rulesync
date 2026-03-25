import { ConfigResolver, type ConfigResolverResolveParams } from "../../config/config-resolver.js";
import { checkRulesyncDirExists, generate } from "../../lib/generate.js";
import { CLIError, ErrorCodes } from "../../types/json-output.js";
import type { Logger } from "../../utils/logger.js";
import {
  buildFeatureSummaryParts,
  calculateTotalCount,
  FEATURE_RESULT_DESCRIPTORS,
} from "../../utils/result.js";

export type GenerateOptions = ConfigResolverResolveParams;

/**
 * Log feature generation result with appropriate prefix based on dry run mode.
 */
function logFeatureResult(
  logger: Logger,
  params: {
    count: number;
    paths: string[];
    featureName: string;
    isPreview: boolean;
    modePrefix: string;
  },
): void {
  const { count, paths, featureName, isPreview, modePrefix } = params;
  if (count > 0) {
    if (isPreview) {
      logger.info(`${modePrefix} Would write ${count} ${featureName}`);
    } else {
      logger.success(`Written ${count} ${featureName}`);
    }
    for (const p of paths) {
      logger.info(`    ${p}`);
    }
  }
}

export async function generateCommand(logger: Logger, options: GenerateOptions): Promise<void> {
  const config = await ConfigResolver.resolve(options);

  const check = config.getCheck();

  const isPreview = config.isPreviewMode();
  const modePrefix = isPreview ? "[DRY RUN]" : "";

  logger.debug("Generating files...");

  if (!(await checkRulesyncDirExists({ baseDir: process.cwd() }))) {
    throw new CLIError(
      ".rulesync directory not found. Run 'rulesync init' first.",
      ErrorCodes.RULESYNC_DIR_NOT_FOUND,
    );
  }

  logger.debug(`Base directories: ${config.getBaseDirs().join(", ")}`);

  const features = config.getFeatures();

  if (features.includes("ignore")) {
    logger.debug("Generating ignore files...");
  }
  if (features.includes("mcp")) {
    logger.debug("Generating MCP files...");
  }
  if (features.includes("commands")) {
    logger.debug("Generating command files...");
  }
  if (features.includes("subagents")) {
    logger.debug("Generating subagent files...");
  }
  if (features.includes("skills")) {
    logger.debug("Generating skill files...");
  }
  if (features.includes("hooks")) {
    logger.debug("Generating hooks...");
  }
  if (features.includes("permissions")) {
    logger.debug("Generating permissions files...");
  }
  if (features.includes("rules")) {
    logger.debug("Generating rule files...");
  }

  const result = await generate({ config, logger });

  const totalGenerated = calculateTotalCount(result);

  const featureResults = FEATURE_RESULT_DESCRIPTORS.map((descriptor) => ({
    feature: descriptor.feature,
    count: result[descriptor.countKey],
    paths: result[`${descriptor.feature}Paths` as keyof typeof result] as string[],
    label: descriptor.label,
  }));

  for (const featureResult of featureResults) {
    logFeatureResult(logger, {
      count: featureResult.count,
      paths: featureResult.paths,
      featureName: featureResult.label(featureResult.count),
      isPreview,
      modePrefix,
    });
  }

  // Capture JSON data if in JSON mode
  if (logger.jsonMode) {
    logger.captureData(
      "features",
      Object.fromEntries(
        featureResults.map((featureResult) => [
          featureResult.feature,
          { count: featureResult.count, paths: featureResult.paths },
        ]),
      ),
    );
    logger.captureData("totalFiles", totalGenerated);
    logger.captureData("hasDiff", result.hasDiff);
    logger.captureData("skills", result.skills ?? []);
  }

  if (totalGenerated === 0) {
    const enabledFeatures = features.join(", ");
    logger.info(`✓ All files are up to date (${enabledFeatures})`);
    return;
  }

  const parts = buildFeatureSummaryParts(result);

  if (isPreview) {
    logger.info(`${modePrefix} Would write ${totalGenerated} file(s) total (${parts.join(" + ")})`);
  } else {
    logger.success(`🎉 All done! Written ${totalGenerated} file(s) total (${parts.join(" + ")})`);
  }

  // Handle --check mode exit code
  if (check) {
    if (result.hasDiff) {
      throw new CLIError(
        "Files are not up to date. Run 'rulesync generate' to update.",
        ErrorCodes.GENERATION_FAILED,
      );
    } else {
      logger.success("✓ All files are up to date.");
    }
  }
}
