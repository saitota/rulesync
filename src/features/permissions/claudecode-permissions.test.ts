import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH,
  RULESYNC_PERMISSIONS_SCHEMA_URL,
} from "../../constants/rulesync-paths.js";
import { setupTestDirectory } from "../../test-utils/test-directories.js";
import { ensureDir, writeFileContent } from "../../utils/file.js";
import { RulesyncPermissions } from "./rulesync-permissions.js";
import { ClaudecodePermissions } from "./claudecode-permissions.js";

describe("ClaudecodePermissions", () => {
  let testDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ testDir, cleanup } = await setupTestDirectory());
    vi.spyOn(process, "cwd").mockReturnValue(testDir);
  });

  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  describe("getSettablePaths", () => {
    it("should return Claude settings path for global mode", () => {
      expect(ClaudecodePermissions.getSettablePaths({ global: true })).toEqual({
        relativeDirPath: ".claude",
        relativeFilePath: "settings.json",
      });
    });

    it("should return Claude local settings path for project mode", () => {
      expect(ClaudecodePermissions.getSettablePaths()).toEqual({
        relativeDirPath: ".claude",
        relativeFilePath: "settings.local.json",
      });
    });
  });

  describe("constructor", () => {
    it("should convert Claude permission entries to canonical permissions", () => {
      const settings = {
        permissions: {
          allow: [
            "Bash(git status *)",
            "WebFetch",
            "mcp__serena__find_file",
            "mcp__plugin_atlassian_atlassian__getJiraIssue",
          ],
          deny: ["Read(.env)"],
          ask: ["Bash(rm *)"],
          defaultMode: "default",
        },
      };

      const instance = new ClaudecodePermissions({
        baseDir: testDir,
        relativeDirPath: ".claude",
        relativeFilePath: "settings.json",
        fileContent: JSON.stringify(settings, null, 2),
        global: true,
      });

      expect(instance.getCanonicalConfig()).toEqual({
        permission: {
          bash: {
            "git status *": "allow",
            "rm *": "ask",
          },
          mcp__serena__find_file: {
            "*": "allow",
          },
          mcp__plugin_atlassian_atlassian__getJiraIssue: {
            "*": "allow",
          },
          read: {
            ".env": "deny",
          },
          webfetch: {
            "*": "allow",
          },
        },
      });
    });

    it("should prefer deny over allow and ask for duplicate specs", () => {
      const settings = {
        permissions: {
          allow: ["Bash(git push *)"],
          ask: ["Bash(git push *)"],
          deny: ["Bash(git push *)"],
        },
      };

      const instance = new ClaudecodePermissions({
        baseDir: testDir,
        relativeDirPath: ".claude",
        relativeFilePath: "settings.json",
        fileContent: JSON.stringify(settings, null, 2),
        global: true,
      });

      expect(instance.getCanonicalConfig()).toEqual({
        permission: {
          bash: {
            "git push *": "deny",
          },
        },
      });
    });

    it("should prefer ask over allow for duplicate specs when deny is absent", () => {
      const settings = {
        permissions: {
          allow: ["Bash(git fetch *)"],
          ask: ["Bash(git fetch *)"],
        },
      };

      const instance = new ClaudecodePermissions({
        baseDir: testDir,
        relativeDirPath: ".claude",
        relativeFilePath: "settings.json",
        fileContent: JSON.stringify(settings, null, 2),
        global: true,
      });

      expect(instance.getCanonicalConfig()).toEqual({
        permission: {
          bash: {
            "git fetch *": "ask",
          },
        },
      });
    });
  });

  describe("toRulesyncPermissions", () => {
    it("should create rulesync permissions with schema URL", () => {
      const instance = new ClaudecodePermissions({
        baseDir: testDir,
        relativeDirPath: ".claude",
        relativeFilePath: "settings.json",
        fileContent: JSON.stringify({
          permissions: {
            allow: ["WebFetch"],
          },
        }),
        global: true,
      });

      const rulesyncPermissions = instance.toRulesyncPermissions();
      expect(rulesyncPermissions).toBeInstanceOf(RulesyncPermissions);
      expect(rulesyncPermissions.getFilePath()).toBe(
        join(testDir, RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH),
      );
      expect(rulesyncPermissions.getJson()).toEqual({
        $schema: RULESYNC_PERMISSIONS_SCHEMA_URL,
        permission: {
          webfetch: {
            "*": "allow",
          },
        },
      });
    });
  });

  describe("fromRulesyncPermissions", () => {
    it("should merge generated permissions into existing Claude settings", async () => {
      await ensureDir(join(testDir, ".claude"));
      await writeFileContent(
        join(testDir, ".claude", "settings.json"),
        JSON.stringify(
          {
            env: {
              FOO: "bar",
            },
            permissions: {
              defaultMode: "default",
              allow: ["Bash(old *)"],
            },
          },
          null,
          2,
        ),
      );

      const rulesyncPermissions = new RulesyncPermissions({
        baseDir: testDir,
        relativeDirPath: ".rulesync",
        relativeFilePath: "permissions.json",
        fileContent: JSON.stringify({
          permission: {
            bash: {
              "git status *": "allow",
            },
            webfetch: {
              "*": "ask",
            },
          },
        }),
      });

      const instance = await ClaudecodePermissions.fromRulesyncPermissions({
        baseDir: testDir,
        rulesyncPermissions,
        global: true,
      });

      expect(instance.getJson()).toEqual({
        env: {
          FOO: "bar",
        },
        permissions: {
          defaultMode: "default",
          allow: ["Bash(git status *)"],
          ask: ["WebFetch"],
          deny: [],
        },
      });
    });
  });

  describe("fromFile", () => {
    it("should initialize empty permissions when settings file does not exist", async () => {
      const instance = await ClaudecodePermissions.fromFile({
        baseDir: testDir,
        global: true,
      });

      expect(instance.getCanonicalConfig()).toEqual({ permission: {} });
    });
  });
});
