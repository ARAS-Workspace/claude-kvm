// Rule: Remove GitHub-specific callout blocks
//
// GitHub renders [!TIP], [!NOTE], [!WARNING] etc. as styled callouts.
// npm, MCP registries, and other platforms display them as raw text.
// This rule strips the entire callout block (opener + continuation lines).
//
// Options:
//   types — array of callout types to remove (default: all five)

export default {
  name: "Remove GitHub Callouts",
  description:
    "Strips [!TIP], [!NOTE], [!WARNING], [!IMPORTANT], [!CAUTION] blocks",
  order: 10,

  defaults: {
    types: ["TIP", "NOTE", "WARNING", "IMPORTANT", "CAUTION"],
  },

  transform(content, options = {}) {
    const types = options.types ?? this.defaults.types;
    const lines = content.split("\n");
    const result = [];
    let skipping = false;

    for (const line of lines) {
      if (
        !skipping &&
        types.some((t) => new RegExp(`^>\\s*\\[!${t}\\]`).test(line))
      ) {
        skipping = true;
        continue;
      }

      if (skipping && line.startsWith(">")) {
        continue;
      }

      skipping = false;
      result.push(line);
    }

    return result.join("\n").replace(/\n{3,}/g, "\n\n");
  },
};