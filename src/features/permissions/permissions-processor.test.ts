import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH,
  RULESYNC_RELATIVE_DIR_PATH,
} from "../../constants/rulesync-paths.js";
import { createMockLogger } from "../../test-utils/mock-logger.js";
import { setupTestDirectory } from "../../test-utils/test-directories.js";
import { ensureDir, writeFileContent } from "../../utils/file.js";
import { ClaudecodePermissions } from "./claudecode-permissions.js";
import { PermissionsProcessor } from "./permissions-processor.js";
import { RulesyncPermissions } from "./rulesync-permissions.js";

const logger = createMockLogger();

describe("PermissionsProcessor", () => {
  let testDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ testDir, cleanup } = await setupTestDirectory());
    vi.spyOn(process, "cwd").mockReturnValue(testDir);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create instance with claudecode target", () => {
      const processor = new PermissionsProcessor({
        logger,
        baseDir: testDir,
        toolTarget: "claudecode",
        global: true,
      });

      expect(processor).toBeInstanceOf(PermissionsProcessor);
    });

    it("should throw for invalid tool target", () => {
      expect(() => {
        const _processor = new PermissionsProcessor({
          logger,
          baseDir: testDir,
          toolTarget: "cursor" as "claudecode",
          global: true,
        });
      }).toThrow("Invalid tool target for PermissionsProcessor");
    });
  });

  describe("getToolTargets", () => {
    it("should support claudecode only in global mode", () => {
      expect(PermissionsProcessor.getToolTargets({ global: true })).toEqual(["claudecode"]);
      expect(PermissionsProcessor.getToolTargets()).toEqual([]);
      expect(PermissionsProcessor.getToolTargets({ global: true, importOnly: true })).toEqual([
        "claudecode",
      ]);
    });
  });

  describe("loadRulesyncFiles", () => {
    it("should load rulesync permissions from baseDir in project mode", async () => {
      await ensureDir(join(testDir, RULESYNC_RELATIVE_DIR_PATH));
      await writeFileContent(
        join(testDir, RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH),
        JSON.stringify({
          permission: {
            bash: {
              "*": "ask",
            },
          },
        }),
      );

      const fakeHome = join(testDir, "fake-home");
      await ensureDir(fakeHome);
      await ensureDir(join(fakeHome, RULESYNC_RELATIVE_DIR_PATH));
      await writeFileContent(
        join(fakeHome, RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH),
        JSON.stringify({
          permission: {
            webfetch: {
              "*": "allow",
            },
          },
        }),
      );

      const processor = new PermissionsProcessor({
        logger,
        baseDir: fakeHome,
        toolTarget: "claudecode",
        global: false,
      });

      const files = await processor.loadRulesyncFiles();
      expect(files).toHaveLength(1);
      expect(files[0]).toBeInstanceOf(RulesyncPermissions);
      expect((files[0] as RulesyncPermissions).getJson()).toEqual({
        permission: {
          webfetch: {
            "*": "allow",
          },
        },
      });
    });

    it("should load rulesync permissions from cwd in global mode", async () => {
      await ensureDir(join(testDir, RULESYNC_RELATIVE_DIR_PATH));
      await writeFileContent(
        join(testDir, RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH),
        JSON.stringify({
          permission: {
            bash: {
              "*": "ask",
            },
          },
        }),
      );

      const fakeHome = join(testDir, "fake-home");
      await ensureDir(join(fakeHome, RULESYNC_RELATIVE_DIR_PATH));
      await writeFileContent(
        join(fakeHome, RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH),
        JSON.stringify({
          permission: {
            webfetch: {
              "*": "allow",
            },
          },
        }),
      );

      const processor = new PermissionsProcessor({
        logger,
        baseDir: fakeHome,
        toolTarget: "claudecode",
        global: true,
      });

      const files = await processor.loadRulesyncFiles();
      expect(files).toHaveLength(1);
      expect(files[0]).toBeInstanceOf(RulesyncPermissions);
      expect((files[0] as RulesyncPermissions).getJson()).toEqual({
        permission: {
          bash: {
            "*": "ask",
          },
        },
      });
    });
  });

  describe("loadToolFiles", () => {
    it("should load Claude settings in global mode", async () => {
      await ensureDir(join(testDir, ".claude"));
      await writeFileContent(
        join(testDir, ".claude", "settings.json"),
        JSON.stringify({
          permissions: {
            allow: ["WebFetch"],
          },
        }),
      );

      const processor = new PermissionsProcessor({
        logger,
        baseDir: testDir,
        toolTarget: "claudecode",
        global: true,
      });

      const files = await processor.loadToolFiles();
      expect(files).toHaveLength(1);
      expect(files[0]).toBeInstanceOf(ClaudecodePermissions);
    });

    it("should return empty array for deletion because Claude settings are not deletable", async () => {
      const processor = new PermissionsProcessor({
        logger,
        baseDir: testDir,
        toolTarget: "claudecode",
        global: true,
      });

      const files = await processor.loadToolFiles({ forDeletion: true });
      expect(files).toHaveLength(0);
    });
  });

  describe("conversion", () => {
    it("should convert rulesync permissions to Claude settings", async () => {
      await ensureDir(join(testDir, RULESYNC_RELATIVE_DIR_PATH));

      const processor = new PermissionsProcessor({
        logger,
        baseDir: testDir,
        toolTarget: "claudecode",
        global: true,
      });

      const rulesyncPermissions = new RulesyncPermissions({
        baseDir: testDir,
        relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
        relativeFilePath: "permissions.json",
        fileContent: JSON.stringify({
          permission: {
            webfetch: {
              "*": "allow",
            },
          },
        }),
      });

      const toolFiles = await processor.convertRulesyncFilesToToolFiles([rulesyncPermissions]);
      expect(toolFiles).toHaveLength(1);
      expect(toolFiles[0]).toBeInstanceOf(ClaudecodePermissions);
      expect(toolFiles[0]?.getRelativeFilePath()).toBe("settings.json");
    });

    it("should convert Claude settings to rulesync permissions", async () => {
      const processor = new PermissionsProcessor({
        logger,
        baseDir: testDir,
        toolTarget: "claudecode",
        global: true,
      });

      const toolFiles = [
        new ClaudecodePermissions({
          baseDir: testDir,
          relativeDirPath: ".claude",
          relativeFilePath: "settings.json",
          fileContent: JSON.stringify({
            permissions: {
              allow: ["Bash(git status *)"],
            },
          }),
          global: true,
        }),
      ];

      const rulesyncFiles = await processor.convertToolFilesToRulesyncFiles(toolFiles);
      expect(rulesyncFiles).toHaveLength(1);
      expect(rulesyncFiles[0]).toBeInstanceOf(RulesyncPermissions);
      expect((rulesyncFiles[0] as RulesyncPermissions).getJson()).toEqual({
        $schema: expect.any(String),
        permission: {
          bash: {
            "git status *": "allow",
          },
        },
      });
    });
  });
});
