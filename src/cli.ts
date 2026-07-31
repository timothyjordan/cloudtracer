import { Command } from "commander";
import chalk from "chalk";
import { scan } from "./index.js";
import { formatTree } from "./output/tree.js";
import { formatJson } from "./output/json.js";
import { formatYaml } from "./output/yaml.js";
import { formatMarkdown } from "./output/markdown.js";
import { runSkillsCommand } from "./skills/index.js";

declare const __PACKAGE_VERSION__: string;

interface CliOptions {
  json?: boolean;
  yaml?: boolean;
  markdown?: boolean;
  verbose?: boolean;
  timeout?: string;
}

const program = new Command();

program
  .name("cloudtracer")
  .description("Scan a website and identify all cloud providers it uses")
  .version(__PACKAGE_VERSION__);

program
  .command("scan", { isDefault: true })
  .description("Scan a domain and report its cloud and third-party services")
  .argument("<domain>", "Domain to scan (e.g. example.com)")
  .option("--json", "Output as JSON")
  .option("--yaml", "Output as YAML")
  .option("--markdown", "Output as Markdown with Mermaid diagram")
  .option("--verbose", "Show debug information")
  .option("--timeout <ms>", "Per-scanner timeout in milliseconds", "10000")
  .action(async (domain: string, options: CliOptions) => {
    // Strip protocol and path if provided
    const cleanDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "");

    if (!cleanDomain || cleanDomain.includes(" ")) {
      console.error("Error: Invalid domain");
      process.exit(1);
    }

    try {
      const result = await scan(cleanDomain, {
        timeout: parseInt(options.timeout ?? "10000"),
        verbose: options.verbose,
      });

      if (options.json) {
        console.log(formatJson(result));
      } else if (options.yaml) {
        console.log(formatYaml(result));
      } else if (options.markdown) {
        console.log(formatMarkdown(result));
      } else {
        console.log(formatTree(result));
      }
    } catch (err) {
      console.error(`Error scanning ${cleanDomain}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command("skill")
  .argument("[action]", "install (default), update, or uninstall")
  .description("Install, update, or uninstall the CloudTracer agent skill for your coding agents (idempotent)")
  .option("--global", "act on your home directory (default)")
  .option("--local", "act on the current project instead of the home directory")
  .option("--project", "guided install into the current project so collaborators share the skill")
  .option("--link", "symlink mode: one shared copy in .agents/skills, linked from each agent")
  .option("--copy", "copy mode: a SKILL.md in each agent's own skills dir (default)")
  .option("--target <dir>", "write the skill to <dir>/cloudtracer/SKILL.md, bypassing agent auto-detection")
  .option(
    "--agent <name>",
    "restrict to a specific agent (repeatable)",
    (value: string, prev: string[]) => [...prev, value],
    [],
  )
  .option("--check", "report what would change without writing (exits 1 on drift)")
  .option("--dry-run", "alias for --check")
  .option("--force", "overwrite a user-modified target or write through a symlink")
  .option("-y, --yes", "skip the interactive checklist and act on all detected agents")
  .option("-o, --output <format>", "text or json", "text")
  .action(async (action: string | undefined, options) => {
    if (options.output !== "text" && options.output !== "json") {
      console.error(chalk.red(`Invalid --output "${options.output}", expected "text" or "json"`));
      process.exit(2);
    }
    const exitCode = await runSkillsCommand(
      { ...options, action },
      {
        stdout: (line) => console.log(line),
        stderr: (line) => console.error(chalk.red(line)),
      },
    );
    if (exitCode !== 0) process.exit(exitCode);
  });

// Default to the `scan` subcommand so `cloudtracer example.com` (and
// `cloudtracer --json example.com`) behave like `cloudtracer scan …`. Insert
// `scan` right after the binary unless the user invoked a known command or asked
// for top-level help/version — that way any flags belong to `scan`, not the root.
const KNOWN_COMMANDS = new Set(["scan", "skill", "help"]);
const TOP_LEVEL_FLAGS = new Set(["-h", "--help", "-V", "--version"]);
const argv = process.argv.slice();
const first = argv[2];
if (first !== undefined && !KNOWN_COMMANDS.has(first) && !TOP_LEVEL_FLAGS.has(first)) {
  argv.splice(2, 0, "scan");
}

program.parseAsync(argv);
