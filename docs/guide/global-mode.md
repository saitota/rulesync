# Global Mode

You can use global mode via Rulesync by enabling `--global` option. It can also be called as user scope mode.

Global mode support is feature- and tool-specific.
Currently, Claude Code global mode supports rules, commands, subagents, skills, hooks, MCP, and permissions generation.
Claude Code global import is also supported for the same feature set where each feature implements import, including permissions from `~/.claude/settings.json`.

1. Create an any name directory. For example, if you prefer `~/.aiglobal`, run the following command.

   ```bash
   mkdir -p ~/.aiglobal
   ```

2. Initialize files for global files in the directory.

   ```bash
   cd ~/.aiglobal
   rulesync init
   ```

3. Edit `~/.aiglobal/rulesync.jsonc` to enable global mode.

   ```jsonc
   {
     "global": true,
   }
   ```

4. Edit `~/.aiglobal/.rulesync/rules/overview.md` to your preferences.

   ```md
   ---
   root: true
   ---

   # The Project Overview

   ...
   ```

5. Generate global settings.

   ```bash
   # Run in the `~/.aiglobal` directory
   rulesync generate
   ```

For example, Claude Code permissions can be imported and generated like this:

```bash
# Import Claude Code global permissions into .rulesync/permissions.json
rulesync import --global --targets claudecode --features permissions

# Generate Claude Code global permissions from .rulesync/permissions.json
rulesync generate --global --targets claudecode --features permissions
```

> [!NOTE]
> Currently, when in the directory enabled global mode:
>
> - `rulesync.jsonc` only supports `global`, `features`, `delete` and `verbose`.
> - Tools support only a single `root: true` file in global mode as a target, e.g. you can't have 2 root files targeting Claude.
> - Support is tool- and feature-specific, so use `rulesync generate --targets <tool> --features <feature>` or `rulesync import --targets <tool> --features <feature>` to stay within the supported matrix.
> - Claude Code permissions global round-trip currently targets `~/.claude/settings.json`.
