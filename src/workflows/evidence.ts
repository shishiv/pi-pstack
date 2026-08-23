/** Evidence coverage is explicit so an unavailable source cannot look searched. */

export const EVIDENCE_CATEGORIES = [
  "source-control",
  "issue-tracker",
  "long-form-documents",
  "real-time-chat",
  "infrastructure-observability",
  "error-tracking",
  "product-analytics",
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export interface EvidenceSource {
  category: EvidenceCategory;
  status: "available" | "gap";
  mcpNames: string[];
  reason?: string;
}

export interface EvidenceMappingOptions {
  availableMcps: readonly (
    | string
    | { name: string; tools?: readonly string[]; resources?: readonly string[] }
  )[];
}

export interface EvidenceMappingResult {
  sources: EvidenceSource[];
  gaps: string[];
}

const MATCHERS: Record<Exclude<EvidenceCategory, "source-control">, RegExp> = {
  "issue-tracker": /linear|jira|github[-_ ]?issues?|plane|shortcut|asana|youtrack/i,
  "long-form-documents": /notion|confluence|google[-_ ]?docs?|coda|slite|document/i,
  "real-time-chat": /slack|discord|teams?|mattermost|chat/i,
  "infrastructure-observability":
    /datadog|new[-_ ]?relic|honeycomb|grafana|splunk|observability|prometheus/i,
  "error-tracking": /sentry|rollbar|bugsnag|airbrake|exception|error[-_ ]?track/i,
  "product-analytics": /databricks|snowflake|bigquery|clickhouse|dbt|redshift|analytics|warehouse/i,
};

const CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  "source-control": "source control",
  "issue-tracker": "issue tracker",
  "long-form-documents": "long-form documents",
  "real-time-chat": "real-time chat",
  "infrastructure-observability": "infrastructure observability",
  "error-tracking": "error tracking",
  "product-analytics": "product analytics",
};

function mcpName(
  mcp: string | { name: string; tools?: readonly string[]; resources?: readonly string[] },
): string {
  return typeof mcp === "string" ? mcp : mcp.name;
}

function matchingNames(
  category: Exclude<EvidenceCategory, "source-control">,
  names: readonly string[],
): string[] {
  const matcher = MATCHERS[category];
  return names.filter((name) => matcher.test(name));
}

/** Map the seven evidence categories without dropping unavailable categories. */
export function mapEvidenceSources(options: EvidenceMappingOptions): EvidenceMappingResult {
  const names = options.availableMcps.map(mcpName).filter((name) => name.trim().length > 0);
  const sources: EvidenceSource[] = [
    { category: "source-control", status: "available", mcpNames: ["git/gh"] },
  ];
  const gaps: string[] = [];
  for (const category of EVIDENCE_CATEGORIES) {
    if (category === "source-control") continue;
    const matched = matchingNames(category, names);
    if (matched.length > 0) {
      sources.push({ category, status: "available", mcpNames: [...new Set(matched)] });
    } else {
      const reason = `No matching MCP available for ${CATEGORY_LABELS[category]}; this evidence category is an explicit gap.`;
      sources.push({ category, status: "gap", mcpNames: [], reason });
      gaps.push(reason);
    }
  }
  return { sources, gaps };
}

export const buildEvidenceCoverageMap = mapEvidenceSources;
