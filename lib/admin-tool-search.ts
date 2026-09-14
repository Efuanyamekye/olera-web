export interface AdminTool {
  label: string;
  href: string;
  section: string;
  description: string;
  keywords?: string;
}

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Every word must match. Prefer names over descriptions and aliases. */
export function findAdminTools(tools: AdminTool[], query: string): AdminTool[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const words = normalized.split(/\s+/);
  return tools
    .map((tool) => {
      const label = normalize(tool.label);
      const text = normalize(`${tool.label} ${tool.section} ${tool.description} ${tool.keywords ?? ""}`);
      const score = label === normalized ? 4
        : label.startsWith(normalized) ? 3
        : label.includes(normalized) ? 2
        : normalize(tool.description).includes(normalized) ? 1 : 0;
      return { tool, score, matches: words.every((word) => text.includes(word)) };
    })
    .filter(({ matches }) => matches)
    .sort((a, b) => b.score - a.score)
    .map(({ tool }) => tool);
}
