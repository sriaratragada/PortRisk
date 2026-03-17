import { utcNowIso } from "@/lib/utils";
import type { ResearchCandidate, ResearchFeatureBundle, ResearchInsight } from "@/lib/types";
import { buildFallbackResearchInsight } from "@/lib/research";

const AI_API_KEY = process.env.AI_API_KEY;
const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1";
const AI_MODEL = process.env.AI_MODEL ?? "openai/gpt-4o-mini";

function parseJsonPayload(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AI response did not contain JSON");
  }
  return JSON.parse(match[0]) as Record<string, unknown>;
}

function buildFallbackRankings(candidates: ResearchCandidate[]) {
  return candidates.map((candidate) => ({
    ticker: candidate.ticker,
    fitScore: candidate.fitScore,
    rationale: candidate.deterministicSummary,
    portfolioFitSummary: candidate.diversificationImpact,
    topConcern:
      candidate.topConcern ??
      (candidate.concentrationImpact.includes("largest position")
        ? "Starter sizing could make this an outsized position."
        : "Main trade-off is whether the diversification gain offsets the new risk budget."),
    whyNow:
      candidate.whyNow ??
      "The name cleared deterministic portfolio-fit thresholds from the Yahoo research feed."
  }));
}

export async function rankResearchCandidates(input: {
  benchmark: string;
  portfolioName: string;
  candidates: ResearchCandidate[];
}) {
  const rawPromptInput = {
    benchmark: input.benchmark,
    portfolioName: input.portfolioName,
    candidates: input.candidates.map((candidate) => ({
      ticker: candidate.ticker,
      companyName: candidate.companyName,
      sector: candidate.sector,
      sourceType: candidate.sourceType,
      sourceLabel: candidate.sourceLabel,
      currentPrice: candidate.currentPrice,
      marketCap: candidate.marketCap,
      changePercent: candidate.changePercent,
      fitScore: candidate.fitScore,
      diversificationImpact: candidate.diversificationImpact,
      concentrationImpact: candidate.concentrationImpact,
      overlapNote: candidate.overlapNote,
      benchmarkContext: candidate.benchmarkContext,
      dataConfidence: candidate.dataConfidence
    }))
  };

  if (!AI_API_KEY || input.candidates.length === 0) {
    return {
      rankings: buildFallbackRankings(input.candidates),
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
              "You are a portfolio research copilot. Return valid JSON only. Use only the provided data. Do not invent fundamentals, sectors, or recommendations beyond the supplied candidate universe."
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Rank Yahoo-sourced equity ideas for portfolio fit.",
              outputSchema: {
                rankings: [
                  {
                    ticker: "string",
                    fitScore: "number 1-100",
                    rationale: "string",
                    portfolioFitSummary: "string",
                    topConcern: "string",
                    whyNow: "string"
                  }
                ]
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
    const rankings = Array.isArray(parsed.rankings)
      ? parsed.rankings
          .map((entry) => ({
            ticker: String(entry?.ticker ?? "").trim().toUpperCase(),
            fitScore:
              typeof entry?.fitScore === "number" && Number.isFinite(entry.fitScore)
                ? Math.max(1, Math.min(100, Math.round(entry.fitScore)))
                : null,
            rationale: String(entry?.rationale ?? "").trim(),
            portfolioFitSummary: String(entry?.portfolioFitSummary ?? "").trim(),
            topConcern: String(entry?.topConcern ?? "").trim(),
            whyNow: String(entry?.whyNow ?? "").trim()
          }))
          .filter((entry) => entry.ticker)
      : buildFallbackRankings(input.candidates);

    return { rankings, rawPromptInput };
  } catch {
    return {
      rankings: buildFallbackRankings(input.candidates),
      rawPromptInput
    };
  }
}

export async function generateResearchInsight(input: {
  featureBundle: ResearchFeatureBundle;
  watchlistNotes?: {
    thesis?: string;
    catalysts?: string;
    risks?: string;
    valuationNotes?: string;
    notes?: string;
  } | null;
}): Promise<{
  insight: ResearchInsight;
  rawPromptInput: Record<string, unknown>;
}> {
  const rawPromptInput = {
    featureBundle: input.featureBundle,
    watchlistNotes: input.watchlistNotes ?? null
  };

  if (!AI_API_KEY) {
    return {
      insight: buildFallbackResearchInsight(input.featureBundle),
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
              "You are a portfolio research copilot. Return valid JSON only. Use only supplied inputs. Do not invent company facts, sectors, financial metrics, or trade advice."
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Generate a concise research memo and portfolio-fit explanation for a Yahoo-sourced idea.",
              outputSchema: {
                summary: "string",
                fitScore: "number 1-100 or null",
                portfolioFit: "string",
                benchmarkContext: "string",
                whyNow: "string",
                topConcern: "string",
                thesis: ["string"],
                catalysts: ["string"],
                risks: ["string"],
                valuationFrame: "string",
                diligenceQuestions: ["string"],
                missingData: ["string"],
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
    const fallback = buildFallbackResearchInsight(input.featureBundle);

    const insight: ResearchInsight = {
      ticker: input.featureBundle.ticker,
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary : fallback.summary,
      fitScore:
        typeof parsed.fitScore === "number" && Number.isFinite(parsed.fitScore)
          ? Math.max(1, Math.min(100, Math.round(parsed.fitScore)))
          : fallback.fitScore,
      portfolioFit:
        typeof parsed.portfolioFit === "string" && parsed.portfolioFit.trim()
          ? parsed.portfolioFit
          : fallback.portfolioFit,
      benchmarkContext:
        typeof parsed.benchmarkContext === "string" && parsed.benchmarkContext.trim()
          ? parsed.benchmarkContext
          : fallback.benchmarkContext,
      whyNow:
        typeof parsed.whyNow === "string" && parsed.whyNow.trim()
          ? parsed.whyNow
          : fallback.whyNow,
      topConcern:
        typeof parsed.topConcern === "string" && parsed.topConcern.trim()
          ? parsed.topConcern
          : fallback.topConcern,
      thesis: Array.isArray(parsed.thesis) ? parsed.thesis.map(String).slice(0, 4) : fallback.thesis,
      catalysts: Array.isArray(parsed.catalysts) ? parsed.catalysts.map(String).slice(0, 4) : fallback.catalysts,
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).slice(0, 4) : fallback.risks,
      valuationFrame:
        typeof parsed.valuationFrame === "string" && parsed.valuationFrame.trim()
          ? parsed.valuationFrame
          : fallback.valuationFrame,
      diligenceQuestions: Array.isArray(parsed.diligenceQuestions)
        ? parsed.diligenceQuestions.map(String).slice(0, 5)
        : fallback.diligenceQuestions,
      missingData: Array.isArray(parsed.missingData)
        ? parsed.missingData.map(String).slice(0, 6)
        : fallback.missingData,
      dataConfidence:
        parsed.dataConfidence === "HIGH" || parsed.dataConfidence === "MEDIUM"
          ? parsed.dataConfidence
          : fallback.dataConfidence,
      generatedAt: utcNowIso(),
      model: AI_MODEL,
      provider: AI_BASE_URL,
      source: "AI"
    };

    return { insight, rawPromptInput };
  } catch {
    return {
      insight: buildFallbackResearchInsight(input.featureBundle),
      rawPromptInput
    };
  }
}
