import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH } from "../constants/rulesync-paths.js";
import { readFileContent, writeFileContent } from "../utils/file.js";
import { runGenerate, runImport, useGlobalTestDirectories } from "./e2e-helper.js";

describe("E2E: permissions (global mode)", () => {
  const { getProjectDir, getHomeDir } = useGlobalTestDirectories();

  it("should import Claude Code global permissions into rulesync canonical format", async () => {
    const projectDir = getProjectDir();
    const homeDir = getHomeDir();

    await writeFileContent(
      join(homeDir, ".claude", "settings.json"),
      JSON.stringify(
        {
          env: {
            FOO: "bar",
          },
          permissions: {
            allow: ["Bash(git status *)", "WebFetch"],
            deny: ["Read(.env)"],
            ask: ["Bash(rm *)"],
            defaultMode: "default",
          },
        },
        null,
        2,
      ),
    );

    await runImport({
      target: "claudecode",
      features: "permissions",
      global: true,
      env: { HOME_DIR: homeDir },
    });

    const importedContent = await readFileContent(
      join(projectDir, RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH),
    );
    const parsed = JSON.parse(importedContent);
    expect(parsed.permission.bash["git status *"]).toBe("allow");
    expect(parsed.permission.bash["rm *"]).toBe("ask");
    expect(parsed.permission.read[".env"]).toBe("deny");
    expect(parsed.permission.webfetch["*"]).toBe("allow");
  });

  it("should generate Claude Code global settings while preserving non-permissions settings", async () => {
    const projectDir = getProjectDir();
    const homeDir = getHomeDir();

    await writeFileContent(
      join(projectDir, RULESYNC_PERMISSIONS_RELATIVE_FILE_PATH),
      JSON.stringify(
        {
          permission: {
            bash: {
              "git status *": "allow",
            },
            webfetch: {
              "*": "ask",
            },
          },
        },
        null,
        2,
      ),
    );

    await writeFileContent(
      join(homeDir, ".claude", "settings.json"),
      JSON.stringify(
        {
          env: {
            FOO: "bar",
          },
          permissions: {
            defaultMode: "default",
          },
        },
        null,
        2,
      ),
    );

    await runGenerate({
      target: "claudecode",
      features: "permissions",
      global: true,
      env: { HOME_DIR: homeDir },
    });

    const generatedContent = await readFileContent(join(homeDir, ".claude", "settings.json"));
    const parsed = JSON.parse(generatedContent);
    expect(parsed.env).toEqual({ FOO: "bar" });
    expect(parsed.permissions.defaultMode).toBe("default");
    expect(parsed.permissions.allow).toEqual(["Bash(git status *)"]);
    expect(parsed.permissions.ask).toEqual(["WebFetch"]);
    expect(parsed.permissions.deny).toEqual([]);
  });
});
