import { utcNowIso } from "@/lib/utils";
import type { RiskInsight, RiskReport } from "@/lib/types";

const AI_API_KEY = process.env.AI_API_KEY;
const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1";
const AI_MODEL = process.env.AI_MODEL ?? "openai/gpt-4o-mini";

function buildFallbackInsight(report: RiskReport): RiskInsight {
  const drivers = [
    ...report.vulnerabilities.slice(0, 2),
    ...report.topRiskContributors.slice(0, 1).map(
      (entry) => `${entry.ticker} is a leading contributor to portfolio variance.`
    )
  ].slice(0, 3);

  const resilienceFactors = report.resilienceFactors.slice(0, 2);
  const alerts = [
    ...(report.sectorConcentration[0] && report.sectorConcentration[0].weight > 0.35
      ? [{
          severity: "WATCH" as const,
          message: `${report.sectorConcentration[0].sector} is the dominant sector exposure at ${Math.round(report.sectorConcentration[0].weight * 100)}%.`
        }]
      : []),
    ...report.balanceSheetSignals.slice(0, 2).map((signal) => ({
      severity: signal.severity,
      message: `${signal.ticker}: ${signal.signal}`
    }))
  ].slice(0, 3);

  const recommendedActions = [
    report.singleNameConcentration[0] && report.singleNameConcentration[0].weight > 0.18
      ? `Review whether ${report.singleNameConcentration[0].ticker} should remain above an 18% weight.`
      : "Keep single-name sizing below hard concentration thresholds.",
    report.dataConfidence.overall === "LOW"
      ? "Refresh company fundamentals before relying on AI interpretation."
      : "Monitor benchmark-relative risk drift and top contributor changes.",
    report.returnDiagnostics.downsideVolatility > report.returnDiagnostics.realizedVolatility * 0.75
      ? "Downside volatility is elevated; consider a more defensive weight mix."
      : "Current downside behavior is controlled; monitor for regime deterioration."
  ].slice(0, 3);

  return {
    summary: `AI copilot fallback: ${report.summary}`,
    drivers: drivers.length > 0 ? drivers : ["No dominant portfolio risk driver exceeded the current fallback thresholds."],
    resilienceFactors:
      resilienceFactors.length > 0
        ? resilienceFactors
        : ["No standout resilience factor was detected from the deterministic signals."],
    alerts,
    recommendedActions,
    regimeCommentary: report.marketContext.summary,
    changeSummary: report.changeDiagnostics.summary,
    dataConfidence: report.dataConfidence.overall,
    generatedAt: utcNowIso(),
    model: "deterministic-fallback",
    provider: "local",
    source: "FALLBACK"
  };
}

function parseJsonPayload(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AI response did not contain JSON");
  }
  return JSON.parse(match[0]) as Partial<RiskInsight>;
}

export async function generateRiskInsight(report: RiskReport): Promise<{
  insight: RiskInsight;
  rawPromptInput: Record<string, unknown>;
}> {
  const rawPromptInput = {
    summary: report.summary,
    qualityScores: report.qualityScores,
    marketContext: report.marketContext,
    concentration: {
      sector: report.sectorConcentration.slice(0, 5),
      industry: report.industryConcentration.slice(0, 5),
      singleName: report.singleNameConcentration.slice(0, 5)
    },
    returnDiagnostics: report.returnDiagnostics,
    changeDiagnostics: report.changeDiagnostics,
    topRiskContributors: report.topRiskContributors.slice(0, 5),
    balanceSheetSignals: report.balanceSheetSignals.slice(0, 6),
    benchmarkComparison: report.benchmarkComparison,
    scenarioMatrix: report.scenarioMatrix,
    dataConfidence: report.dataConfidence
  };

  if (!AI_API_KEY) {
    return {
      insight: buildFallbackInsight(report),
      rawPromptInput
    };
  }

  try {
    const response = await fetch(`${AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an institutional portfolio risk copilot. Return valid JSON only. Do not provide direct financial advice. Explain risk clearly using only the provided input data."
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Generate a concise portfolio risk copilot note.",
              outputSchema: {
                summary: "string",
                drivers: ["string"],
                resilienceFactors: ["string"],
                alerts: [{ severity: "INFO | WATCH | HIGH", message: "string" }],
                recommendedActions: ["string"],
                regimeCommentary: "string",
                changeSummary: "string",
                dataConfidence: "HIGH | MEDIUM | LOW"
              },
              input: rawPromptInput
            })
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`AI request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI response was empty");
    }

    const parsed = parseJsonPayload(content);
    const fallbackInsight = buildFallbackInsight(report);
    const parsedAlerts: RiskInsight["alerts"] = Array.isArray(parsed.alerts)
      ? parsed.alerts
          .map((alert) => {
            const severity: RiskInsight["alerts"][number]["severity"] =
              alert?.severity === "HIGH" || alert?.severity === "WATCH" ? alert.severity : "INFO";
            return {
              severity,
              message: String(alert?.message ?? "")
            };
          })
          .filter((alert) => alert.message)
          .slice(0, 4)
      : fallbackInsight.alerts;
    const insight: RiskInsight = {
      summary: parsed.summary ?? fallbackInsight.summary,
      drivers: Array.isArray(parsed.drivers) ? parsed.drivers.slice(0, 3) : fallbackInsight.drivers,
      resilienceFactors: Array.isArray(parsed.resilienceFactors)
        ? parsed.resilienceFactors.slice(0, 3)
        : fallbackInsight.resilienceFactors,
      alerts: parsedAlerts,
      recommendedActions: Array.isArray(parsed.recommendedActions)
        ? parsed.recommendedActions.slice(0, 3)
        : fallbackInsight.recommendedActions,
      regimeCommentary: parsed.regimeCommentary ?? report.marketContext.summary,
      changeSummary: parsed.changeSummary ?? report.changeDiagnostics.summary,
      dataConfidence:
        parsed.dataConfidence === "HIGH" || parsed.dataConfidence === "MEDIUM"
          ? parsed.dataConfidence
          : report.dataConfidence.overall,
      generatedAt: utcNowIso(),
      model: AI_MODEL,
      provider: AI_BASE_URL,
      source: "AI"
    };

    return { insight, rawPromptInput };
  } catch {
    return {
      insight: buildFallbackInsight(report),
      rawPromptInput
    };
  }
}
