# AGENTS.md

本文件记录本仓库内 AI Agent 的工作约定。执行任务时优先遵守本文件，再结合用户的实时指令。

## 协作原则

- 默认用中文沟通，除非用户明确要求英文。
- 优先做最小必要改动，不主动扩大重构范围。
- 修改前先理解现有实现；不确定时先询问，不要猜测业务规则。
- 不要主动提交、推送、打 tag，除非用户明确要求。

## GitNexus 优先

- 探索代码、追踪调用链、分析影响范围时，优先使用 GitNexus 工具。
- 修改函数、类、方法等符号前，必须先做 GitNexus impact analysis，并向用户说明直接调用方、受影响流程和风险等级。
- 提交前必须运行 GitNexus detect changes，确认影响范围符合预期。
- 如果 GitNexus 提示索引过期，先运行 `npx gitnexus analyze` 后再继续。

## 代码提交与版本

- 当前分支 `869` 的版本号采用 `v5x.x.x` 形式，例如 `v50.8.7` 表示 `v5 0.8.7`。
- tag 会自动触发 GitHub 构建脚本。
- 只有在用户要求推送时，才在最后一个版本上打 tag 并推送。

## Changelog

- 每次做必要的代码、配置、行为变更时，都要维护 changelog。
- Changelog 按时间分类，优先使用日期标题，例如 `## 2026-05-21`。
- 每条记录简洁说明变更内容和原因，不记录临时调试过程。

## 数据库

- 当前环境变量里的数据库是用户家里的私有数据库，一般无法连接。
- 测试或排查时不要长时间等待数据库连接；如果数据库不可用，明确说明该限制并继续做可离线验证的部分。

## Ruby 环境

- Ruby 使用 mise 管理的环境。
- 不要直接依赖系统 Ruby；运行 Ruby/Rails 相关命令时优先通过 mise 环境执行。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **wechat_rails** (5917 symbols, 10105 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/wechat_rails/context` | Codebase overview, check index freshness |
| `gitnexus://repo/wechat_rails/clusters` | All functional areas |
| `gitnexus://repo/wechat_rails/processes` | All execution flows |
| `gitnexus://repo/wechat_rails/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Changelog

### 2026-05-21

- 生成并整理 AGENTS.md，明确 GitNexus 优先、Changelog、数据库连接限制和 mise Ruby 环境约定。
