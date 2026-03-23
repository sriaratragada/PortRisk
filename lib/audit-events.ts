import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditCategory =
  | "PORTFOLIO"
  | "POSITION"
  | "RISK"
  | "STRESS"
  | "RESEARCH"
  | "COMPLIANCE"
  | "SYSTEM";

export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AuditOutcome = "SUCCESS" | "DENIED" | "FAILED";
export type AuditActorType = "USER" | "SYSTEM" | "SERVICE";
export type AuditPolicyResult = "PASS" | "FAIL" | "WARN";

export type AuditPolicyEvaluation = {
  policyId: string;
  result: AuditPolicyResult;
  message: string;
};

type ActionDefaults = {
  category: AuditCategory;
  severity: AuditSeverity;
  controlRefs: string[];
};

type AuditActionDefaultsMap = Record<string, ActionDefaults>;

const ACTION_DEFAULTS: AuditActionDefaultsMap = {
  ALLOCATION_COMMITTED: {
    category: "PORTFOLIO",
    severity: "INFO",
    controlRefs: ["CC7.2", "CC8.1"]
  },
  PORTFOLIO_BENCHMARK_UPDATED: {
    category: "PORTFOLIO",
    severity: "INFO",
    controlRefs: ["CC6.1", "CC7.2"]
  },
  PORTFOLIO_ARCHIVED: {
    category: "COMPLIANCE",
    severity: "WARNING",
    controlRefs: ["CC8.1", "CC9.2"]
  },
  POSITION_ADDED: {
    category: "POSITION",
    severity: "INFO",
    controlRefs: ["CC6.1", "CC7.2"]
  },
  POSITION_RESIZED: {
    category: "POSITION",
    severity: "INFO",
    controlRefs: ["CC6.1", "CC7.2"]
  },
  POSITION_REMOVED: {
    category: "POSITION",
    severity: "WARNING",
    controlRefs: ["CC6.1", "CC7.2"]
  },
  RISK_SCORED: {
    category: "RISK",
    severity: "INFO",
    controlRefs: ["CC3.2", "CC7.2"]
  },
  RISK_INSIGHT_GENERATED: {
    category: "RISK",
    severity: "INFO",
    controlRefs: ["CC3.2", "CC7.2"]
  },
  STRESS_TEST_RUN: {
    category: "STRESS",
    severity: "WARNING",
    controlRefs: ["CC3.2", "CC7.2"]
  },
  WATCHLIST_ITEM_ADDED: {
    category: "RESEARCH",
    severity: "INFO",
    controlRefs: ["CC2.3", "CC7.2"]
  },
  WATCHLIST_ITEM_UPDATED: {
    category: "RESEARCH",
    severity: "INFO",
    controlRefs: ["CC2.3", "CC7.2"]
  },
  WATCHLIST_ITEM_REMOVED: {
    category: "RESEARCH",
    severity: "WARNING",
    controlRefs: ["CC2.3", "CC7.2"]
  },
  WATCHLIST_ITEM_PROMOTED: {
    category: "RESEARCH",
    severity: "INFO",
    controlRefs: ["CC6.1", "CC7.2"]
  }
};

const DEFAULT_CONTROL_REFS = ["CC1.2", "CC7.2"];
const AUDIT_EVENT_VERSION = 2;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type RequestAuditContext = {
  requestId: string;
  route: string | null;
  method: string | null;
  sessionId: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
};

type AuditLogRow = {
  id: string;
  userId: string;
  portfolioId: string;
  timestamp: string;
  eventVersion: number;
  actionType: string;
  category: AuditCategory;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  requestId: string;
  route: string | null;
  method: string | null;
  sessionId: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
  reasonCode: string | null;
  controlRefs: string[];
  policyEvaluations: AuditPolicyEvaluation[];
  prevEventHash: string | null;
  eventHash: string;
  beforeState: JsonValue;
  afterState: JsonValue;
  riskTierBefore: string | null;
  riskTierAfter: string | null;
  metadata: JsonValue | null;
};

type WriteAuditEventInput = {
  request?: NextRequest | null;
  userId: string;
  portfolioId: string;
  actionType: string;
  beforeState?: unknown;
  afterState?: unknown;
  riskTierBefore?: string | null;
  riskTierAfter?: string | null;
  metadata?: unknown;
  category?: AuditCategory;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
  actorType?: AuditActorType;
  reasonCode?: string | null;
  controlRefs?: string[];
  policyEvaluations?: AuditPolicyEvaluation[];
};

type VerifyAuditHashInput = {
  userId: string;
  portfolioId?: string;
  limit?: number;
};

export type VerifyAuditHashResult = {
  verified: boolean;
  checked: number;
  firstBrokenEventId: string | null;
  firstBrokenTimestamp: string | null;
  reason: string | null;
};

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
  return `{${entries.join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalizeAuditPayload(payload: unknown): string {
  return stableStringify(payload);
}

export function hashAuditPayload(payload: unknown): string {
  return sha256(canonicalizeAuditPayload(payload));
}

function header(request: NextRequest | null | undefined, key: string): string | null {
  return request?.headers.get(key) ?? null;
}

function extractClientIp(request?: NextRequest | null): string | null {
  const forwarded = header(request, "x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return header(request, "x-real-ip");
}

function buildRequestContext(request?: NextRequest | null): RequestAuditContext {
  const requestId = header(request, "x-request-id") ?? randomUUID();
  const sessionId = header(request, "x-session-id");
  const route = request?.nextUrl?.pathname ?? null;
  const method = request?.method ?? null;
  const ip = extractClientIp(request);
  const userAgent = header(request, "user-agent");
  return {
    requestId,
    sessionId,
    route,
    method,
    ipHash: ip ? sha256(ip) : null,
    userAgentHash: userAgent ? sha256(userAgent) : null
  };
}

function classifyAction(actionType: string): ActionDefaults {
  return (
    ACTION_DEFAULTS[actionType] ?? {
      category: "SYSTEM",
      severity: "INFO",
      controlRefs: DEFAULT_CONTROL_REFS
    }
  );
}

function buildPolicyEvaluations(input?: AuditPolicyEvaluation[]): AuditPolicyEvaluation[] {
  if (input && input.length > 0) {
    return input.map((item) => ({
      policyId: item.policyId,
      result: item.result,
      message: item.message
    }));
  }
  return [
    {
      policyId: "AUTHENTICATED_REQUEST",
      result: "PASS",
      message: "Request was authorized by an authenticated principal."
    }
  ];
}

async function fetchPreviousEventHash(
  supabase: SupabaseClient,
  userId: string,
  portfolioId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("AuditLog")
    .select("eventHash")
    .eq("userId", userId)
    .eq("portfolioId", portfolioId)
    .order("timestamp", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return typeof data?.eventHash === "string" && data.eventHash ? data.eventHash : null;
}

function toCanonicalPayload(row: Omit<AuditLogRow, "eventHash">): string {
  return stableStringify(row);
}

export async function writeAuditEvent(
  supabase: SupabaseClient,
  input: WriteAuditEventInput
): Promise<{ id: string; eventHash: string; requestId: string }> {
  const defaults = classifyAction(input.actionType);
  const requestContext = buildRequestContext(input.request);
  const prevEventHash = await fetchPreviousEventHash(supabase, input.userId, input.portfolioId);
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const controlRefs = input.controlRefs && input.controlRefs.length > 0 ? input.controlRefs : defaults.controlRefs;

  const rowWithoutHash: Omit<AuditLogRow, "eventHash"> = {
    id,
    userId: input.userId,
    portfolioId: input.portfolioId,
    timestamp,
    eventVersion: AUDIT_EVENT_VERSION,
    actionType: input.actionType,
    category: input.category ?? defaults.category,
    severity: input.severity ?? defaults.severity,
    outcome: input.outcome ?? "SUCCESS",
    actorType: input.actorType ?? "USER",
    requestId: requestContext.requestId,
    route: requestContext.route,
    method: requestContext.method,
    sessionId: requestContext.sessionId,
    ipHash: requestContext.ipHash,
    userAgentHash: requestContext.userAgentHash,
    reasonCode: input.reasonCode ?? null,
    controlRefs,
    policyEvaluations: buildPolicyEvaluations(input.policyEvaluations),
    prevEventHash,
    beforeState: normalizeAuditValue(input.beforeState ?? {}),
    afterState: normalizeAuditValue(input.afterState ?? {}),
    riskTierBefore: input.riskTierBefore ?? null,
    riskTierAfter: input.riskTierAfter ?? null,
    metadata: normalizeAuditValue(input.metadata)
  };

  const eventHash = sha256(toCanonicalPayload(rowWithoutHash));
  const row: AuditLogRow = {
    ...rowWithoutHash,
    eventHash
  };

  const { error } = await supabase.from("AuditLog").insert(row);
  if (error) {
    throw new Error(error.message);
  }

  return {
    id: row.id,
    eventHash: row.eventHash,
    requestId: row.requestId
  };
}

function normalizeAuditValue(value: unknown): JsonValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeAuditValue(entry));
  }
  if (typeof value === "object") {
    const normalized: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      normalized[key] = normalizeAuditValue(entry);
    }
    return normalized;
  }
  return String(value);
}

type RawAuditRow = {
  id: string;
  userId: string;
  portfolioId: string;
  timestamp: string;
  eventVersion: number | null;
  actionType: string;
  category: string | null;
  severity: string | null;
  outcome: string | null;
  actorType: string | null;
  requestId: string | null;
  route: string | null;
  method: string | null;
  sessionId: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
  reasonCode: string | null;
  controlRefs: unknown;
  policyEvaluations: unknown;
  prevEventHash: string | null;
  eventHash: string | null;
  beforeState: unknown;
  afterState: unknown;
  riskTierBefore: string | null;
  riskTierAfter: string | null;
  metadata: unknown;
};

function asAuditCategory(value: string | null): AuditCategory {
  if (
    value === "PORTFOLIO" ||
    value === "POSITION" ||
    value === "RISK" ||
    value === "STRESS" ||
    value === "RESEARCH" ||
    value === "COMPLIANCE" ||
    value === "SYSTEM"
  ) {
    return value;
  }
  return "SYSTEM";
}

function asAuditSeverity(value: string | null): AuditSeverity {
  if (value === "INFO" || value === "WARNING" || value === "CRITICAL") {
    return value;
  }
  return "INFO";
}

function asAuditOutcome(value: string | null): AuditOutcome {
  if (value === "SUCCESS" || value === "DENIED" || value === "FAILED") {
    return value;
  }
  return "SUCCESS";
}

function asAuditActorType(value: string | null): AuditActorType {
  if (value === "USER" || value === "SYSTEM" || value === "SERVICE") {
    return value;
  }
  return "USER";
}

function normalizeControlRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizePolicyEvaluations(value: unknown): AuditPolicyEvaluation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const candidate = entry as Partial<AuditPolicyEvaluation>;
      if (
        typeof candidate?.policyId === "string" &&
        (candidate.result === "PASS" || candidate.result === "FAIL" || candidate.result === "WARN") &&
        typeof candidate.message === "string"
      ) {
        return {
          policyId: candidate.policyId,
          result: candidate.result,
          message: candidate.message
        } satisfies AuditPolicyEvaluation;
      }
      return null;
    })
    .filter((entry): entry is AuditPolicyEvaluation => entry !== null);
}

function toCanonicalAuditRow(row: RawAuditRow): Omit<AuditLogRow, "eventHash"> {
  return {
    id: row.id,
    userId: row.userId,
    portfolioId: row.portfolioId,
    timestamp: row.timestamp,
    eventVersion: row.eventVersion ?? AUDIT_EVENT_VERSION,
    actionType: row.actionType,
    category: asAuditCategory(row.category),
    severity: asAuditSeverity(row.severity),
    outcome: asAuditOutcome(row.outcome),
    actorType: asAuditActorType(row.actorType),
    requestId: row.requestId ?? "",
    route: row.route,
    method: row.method,
    sessionId: row.sessionId,
    ipHash: row.ipHash,
    userAgentHash: row.userAgentHash,
    reasonCode: row.reasonCode,
    controlRefs: normalizeControlRefs(row.controlRefs),
    policyEvaluations: normalizePolicyEvaluations(row.policyEvaluations),
    prevEventHash: row.prevEventHash,
    beforeState: normalizeAuditValue(row.beforeState),
    afterState: normalizeAuditValue(row.afterState),
    riskTierBefore: row.riskTierBefore,
    riskTierAfter: row.riskTierAfter,
    metadata: normalizeAuditValue(row.metadata)
  };
}

export async function verifyAuditHashChain(
  supabase: SupabaseClient,
  input: VerifyAuditHashInput
): Promise<VerifyAuditHashResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 1000, 2000));
  let query = supabase
    .from("AuditLog")
    .select(
      "id,userId,portfolioId,timestamp,eventVersion,actionType,category,severity,outcome,actorType,requestId,route,method,sessionId,ipHash,userAgentHash,reasonCode,controlRefs,policyEvaluations,prevEventHash,eventHash,beforeState,afterState,riskTierBefore,riskTierAfter,metadata"
    )
    .eq("userId", input.userId)
    .not("eventHash", "is", null)
    .order("timestamp", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  if (input.portfolioId) {
    query = query.eq("portfolioId", input.portfolioId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RawAuditRow[];
  let previousHash: string | null = null;

  for (const row of rows) {
    const canonical = toCanonicalAuditRow(row);
    const calculatedHash = sha256(toCanonicalPayload(canonical));
    if (!row.eventHash || calculatedHash !== row.eventHash) {
      return {
        verified: false,
        checked: rows.length,
        firstBrokenEventId: row.id,
        firstBrokenTimestamp: row.timestamp,
        reason: "EVENT_HASH_MISMATCH"
      };
    }
    if ((row.prevEventHash ?? null) !== previousHash) {
      return {
        verified: false,
        checked: rows.length,
        firstBrokenEventId: row.id,
        firstBrokenTimestamp: row.timestamp,
        reason: "CHAIN_LINK_MISMATCH"
      };
    }
    previousHash = row.eventHash;
  }

  return {
    verified: true,
    checked: rows.length,
    firstBrokenEventId: null,
    firstBrokenTimestamp: null,
    reason: null
  };
}
