import { ConfigResolver, ConfigResolverResolveParams } from "../../config/config-resolver.js";
import { importFromTool } from "../../lib/import.js";
import { CLIError, ErrorCodes } from "../../types/json-output.js";
import type { Logger } from "../../utils/logger.js";
import {
  buildFeatureSummaryParts,
  calculateTotalCount,
  FEATURE_RESULT_DESCRIPTORS,
} from "../../utils/result.js";

export type ImportOptions = Omit<ConfigResolverResolveParams, "delete" | "baseDirs">;

export async function importCommand(logger: Logger, options: ImportOptions): Promise<void> {
  if (!options.targets) {
    throw new CLIError("No tools found in --targets", ErrorCodes.IMPORT_FAILED);
  }

  if (options.targets.length > 1) {
    throw new CLIError("Only one tool can be imported at a time", ErrorCodes.IMPORT_FAILED);
  }

  const config = await ConfigResolver.resolve(options);

  // eslint-disable-next-line no-type-assertion/no-type-assertion
  const tool = config.getTargets()[0]!;

  logger.debug(`Importing files from ${tool}...`);

  const result = await importFromTool({ config, tool, logger });

  const totalImported = calculateTotalCount(result);

  if (totalImported === 0) {
    const enabledFeatures = config.getFeatures().join(", ");
    logger.warn(`No files imported for enabled features: ${enabledFeatures}`);
    return;
  }

  // Capture JSON data if in JSON mode
  if (logger.jsonMode) {
    logger.captureData("tool", tool);
    const featureResults = FEATURE_RESULT_DESCRIPTORS.map((descriptor) => ({
      feature: descriptor.feature,
      count: result[descriptor.countKey],
    }));
    logger.captureData(
      "features",
      Object.fromEntries(
        featureResults.map((featureResult) => [featureResult.feature, { count: featureResult.count }]),
      ),
    );
    logger.captureData("totalFiles", totalImported);
  }

  const parts = buildFeatureSummaryParts(result);

  logger.success(`Imported ${totalImported} file(s) total (${parts.join(" + ")})`);
}
