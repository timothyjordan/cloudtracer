import { Command } from "commander";
import { scan } from "./scanner.js";
import { formatTree } from "./output/tree.js";
import { formatJson } from "./output/json.js";
import { formatYaml } from "./output/yaml.js";
import { formatMarkdown } from "./output/markdown.js";

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
  .name("sitestack")
  .description("Scan a website and identify all cloud providers it uses")
  .version(__PACKAGE_VERSION__)
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

program.parse();
