// Rule: Replace Mermaid diagram blocks
//
// Mermaid diagrams render natively on GitHub but appear as raw code
// on npm, MCP registries, and other platforms.
// This rule replaces ```mermaid blocks with a redirect notice.
//
// Options:
//   repoUrl — GitHub repository URL (used to build anchor links)

export default {
  name: "Replace Mermaid Diagrams",
  description: "Replaces mermaid code blocks with a GitHub redirect notice",
  order: 20,

  defaults: {
    repoUrl: "https://github.com/ARAS-Workspace/claude-kvm",
  },

  transform(content, options = {}) {
    const repoUrl = options.repoUrl ?? this.defaults.repoUrl;
    const lines = content.split("\n");
    const result = [];
    let lastHeading = "";
    let inMermaid = false;

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,6}\s+(.+)/);
      if (headingMatch) lastHeading = headingMatch[1].trim();

      if (line.trim() === "```mermaid") {
        inMermaid = true;
        const anchor = lastHeading
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-");

        result.push("```bash");
        result.push(`# ${lastHeading}`);
        result.push("# Rendered as a Mermaid diagram on GitHub:");
        result.push(`open "${repoUrl}#${anchor}"`);
        result.push("```");
        continue;
      }

      if (inMermaid) {
        if (line.trim() === "```") inMermaid = false;
        continue;
      }

      result.push(line);
    }

    return result.join("\n");
  },
};