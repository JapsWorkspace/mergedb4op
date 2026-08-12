const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { TextDecoder } = require("util");

const ALLOWED_SEVERITIES = ["success", "info", "notice", "warning", "critical"];
const DEFAULT_REGION = process.env.AWS_REGION || "us-east-1";
const DEFAULT_MODEL_ID =
  process.env.AWS_BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";
const DEFAULT_FALLBACK_MODEL_ID =
  process.env.AWS_BEDROCK_FALLBACK_MODEL_ID || "meta.llama3-8b-instruct-v1:0";
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 20000);
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeLower = (value) => normalizeString(value).toLowerCase();

const withTimeout = async (promise, timeoutMs, label) => {
  let timer = null;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} timed out`);
          error.code = "AI_TIMEOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const getBedrockClient = () => {
  return new BedrockRuntimeClient({
    region: DEFAULT_REGION,
  });
};

const parseAiJson = (rawText = "") => {
  try {
    const text = normalizeString(rawText);
    if (!text) return null;

    let cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
};

const buildAiProviderStatus = (error, provider = "unknown") => {
  const rawMessage = normalizeString(error?.message || error?.code || error?.name);
  const message = rawMessage.toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0) || 0;
  const code = normalizeString(error?.code || error?.name || "");

  let type = "unavailable";
  let fallbackReason = "AI provider was unavailable. Showing locally generated analytics instead.";

  if (
    message.includes("credential") ||
    message.includes("security token") ||
    message.includes("access key") ||
    code === "CredentialsProviderError"
  ) {
    type = "missing_credentials";
    fallbackReason =
      "AI provider credentials are missing. Showing locally generated analytics instead.";
  } else if (
    provider === "bedrock" &&
    (message.includes("accessdenied") ||
      message.includes("not authorized") ||
      message.includes("model access") ||
      message.includes("validationexception") ||
      message.includes("resource not found") ||
      message.includes("could not resolve the foundation model"))
  ) {
    type = "bedrock_access";
    fallbackReason =
      "AWS Bedrock model access may not be enabled. Showing locally generated analytics instead.";
  } else if (
    message.includes("json") ||
    message.includes("parse") ||
    message.includes("schema")
  ) {
    type = "invalid_json";
    fallbackReason =
      "AI provider did not return valid JSON. Showing locally generated analytics instead.";
  } else if (code === "AI_TIMEOUT" || message.includes("timed out")) {
    type = "timeout";
    fallbackReason =
      provider === "bedrock"
        ? "AWS Bedrock was unavailable. Showing locally generated analytics instead."
        : "Gemini was unavailable. Showing locally generated analytics instead.";
  } else if (status === 429 || message.includes("quota") || message.includes("throttle")) {
    type = "rate_limited";
    fallbackReason =
      provider === "bedrock"
        ? "AWS Bedrock was unavailable. Showing locally generated analytics instead."
        : "Gemini was unavailable. Showing locally generated analytics instead.";
  } else if (provider === "bedrock") {
    fallbackReason =
      "AWS Bedrock was unavailable. Showing locally generated analytics instead.";
  } else if (provider === "gemini") {
    fallbackReason = "Gemini was unavailable. Showing locally generated analytics instead.";
  }

  return {
    provider,
    model: normalizeString(error?.modelId || ""),
    code,
    status,
    type,
    fallbackReason,
  };
};

const normalizeAiPayload = (parsed, fallback, metadata = {}) => {
  const safeFallback = fallback && typeof fallback === "object" ? fallback : {};
  const generatedAt = metadata.generatedAt || safeFallback.generatedAt || new Date();
  const fallbackReason =
    metadata.fallbackReason !== undefined
      ? metadata.fallbackReason
      : safeFallback.fallbackReason || "";

  const basePayload = {
    ...safeFallback,
    generatedAt,
    source: metadata.source || safeFallback.source || "rule_based_fallback",
    model: metadata.model || safeFallback.model || "local_rules",
    aiAvailable:
      metadata.aiAvailable !== undefined
        ? metadata.aiAvailable
        : safeFallback.aiAvailable !== undefined
        ? safeFallback.aiAvailable
        : false,
    fallbackReason,
    cacheHit:
      metadata.cacheHit !== undefined
        ? metadata.cacheHit
        : safeFallback.cacheHit !== undefined
        ? safeFallback.cacheHit
        : false,
    executiveSummary: safeFallback.executiveSummary,
  };

  if (metadata.cacheAgeMs !== undefined) {
    basePayload.cacheAgeMs = metadata.cacheAgeMs;
  }

  if (!parsed || !Array.isArray(parsed.insights)) {
    return basePayload;
  }

  const safeInsights = parsed.insights
    .filter((item) => item && typeof item === "object")
    .slice(0, 5)
    .map((item, index) => {
      const severity = ALLOWED_SEVERITIES.includes(item.severity)
        ? item.severity
        : "info";

      return {
        type: normalizeString(item.type) || `ai_insight_${index + 1}`,
        severity,
        title: normalizeString(item.title) || "AI insight",
        message:
          normalizeString(item.message) ||
          "The AI found a data-based operational pattern in the provided analytics facts.",
        action:
          normalizeString(item.action) ||
          "Review this area before making operational decisions.",
      };
    });

  if (!safeInsights.length) {
    return basePayload;
  }

  const severityRank = {
    critical: 4,
    warning: 3,
    notice: 2,
    info: 1,
    success: 0,
  };

  const overallSeverity = ALLOWED_SEVERITIES.includes(parsed.overallSeverity)
    ? parsed.overallSeverity
    : safeInsights.reduce((highest, insight) => {
        return severityRank[insight.severity] > severityRank[highest]
          ? insight.severity
          : highest;
      }, "success");

  const priorityActions = Array.isArray(parsed.priorityActions)
    ? parsed.priorityActions.map((item) => normalizeString(item)).filter(Boolean).slice(0, 5)
    : [];

  return {
    ...basePayload,
    overallSeverity,
    executiveSummary:
      normalizeString(parsed.executiveSummary) ||
      safeFallback.executiveSummary ||
      "AI reviewed the provided analytics facts.",
    priorityActions: priorityActions.length
      ? priorityActions
      : safeInsights.slice(0, 4).map((item) => item.action),
    insights: safeInsights,
  };
};

const extractBedrockText = (parsed) => {
  if (!parsed || typeof parsed !== "object") return "";

  const primary = parsed?.output?.message?.content;
  if (Array.isArray(primary)) {
    const joined = primary.map((item) => normalizeString(item?.text)).filter(Boolean).join(" ");
    if (joined) return joined;
  }

  const outputMessage = normalizeString(parsed?.output?.message?.content?.[0]?.text);
  if (outputMessage) return outputMessage;

  const resultsText = normalizeString(parsed?.results?.[0]?.outputText);
  if (resultsText) return resultsText;

  const contentText = normalizeString(parsed?.content?.[0]?.text);
  if (contentText) return contentText;

  const plainOutput = normalizeString(parsed?.outputText);
  if (plainOutput) return plainOutput;

  return "";
};

const callBedrockModel = async ({ prompt, modelId, timeoutMs }) => {
  const client = getBedrockClient();
  const body = {
    messages: [
      {
        role: "user",
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      max_new_tokens: Number(process.env.AWS_BEDROCK_MAX_TOKENS || 900),
      temperature: Number(process.env.AWS_BEDROCK_TEMPERATURE || 0.15),
      top_p: Number(process.env.AWS_BEDROCK_TOP_P || 0.8),
    },
  };

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });

  const response = await withTimeout(
    client.send(command),
    timeoutMs,
    `AWS Bedrock (${modelId})`
  );

  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded);
  const rawText = extractBedrockText(parsed);

  if (!rawText) {
    const error = new Error("AWS Bedrock returned an empty response body");
    error.modelId = modelId;
    throw error;
  }

  return {
    rawText,
    parsed: parseAiJson(rawText),
    model: modelId,
  };
};

const callGeminiModel = async ({ prompt, timeoutMs }) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is missing");
    error.code = "GEMINI_MISSING_KEY";
    throw error;
  }

  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const modelName = DEFAULT_GEMINI_MODEL;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: Number(process.env.AWS_BEDROCK_TEMPERATURE || 0.15),
      topP: Number(process.env.AWS_BEDROCK_TOP_P || 0.8),
      maxOutputTokens: Number(process.env.AWS_BEDROCK_MAX_TOKENS || 450),
    },
  });

  const result = await withTimeout(
    model.generateContent(prompt),
    timeoutMs,
    `Gemini (${modelName})`
  );
  const rawText = result?.response?.text?.() || "";

  if (!normalizeString(rawText)) {
    throw new Error("Gemini returned an empty response body");
  }

  return {
    rawText,
    parsed: parseAiJson(rawText),
    model: modelName,
  };
};

const buildCombinedFallbackReason = (statuses = []) => {
  if (!statuses.length) {
    return "AI provider was unavailable. Showing locally generated analytics instead.";
  }

  const hasBedrock = statuses.some((status) => status.provider === "bedrock");
  const hasGemini = statuses.some((status) => status.provider === "gemini");
  const hasInvalidJson = statuses.some((status) => status.type === "invalid_json");
  const hasAccessIssue = statuses.some((status) => status.type === "bedrock_access");
  const hasMissingCredentials = statuses.some(
    (status) => status.type === "missing_credentials"
  );

  if (hasInvalidJson) {
    return "AI provider did not return valid JSON. Showing locally generated analytics instead.";
  }

  if (hasAccessIssue) {
    return "AWS Bedrock model access may not be enabled. Showing locally generated analytics instead.";
  }

  if (hasMissingCredentials && !hasGemini) {
    return "AI provider credentials are missing. Showing locally generated analytics instead.";
  }

  if (hasBedrock && hasGemini) {
    return "AWS Bedrock and Gemini were unavailable. Showing locally generated analytics instead.";
  }

  if (hasBedrock) {
    return "AWS Bedrock was unavailable. Showing locally generated analytics instead.";
  }

  if (hasGemini) {
    return "Gemini was unavailable. Showing locally generated analytics instead.";
  }

  return "AI provider was unavailable. Showing locally generated analytics instead.";
};

const callAiAnalyticsProvider = async ({
  prompt,
  fallback,
  controllerLabel = "AI Analytics",
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => {
  const statuses = [];
  const providerPreference = normalizeLower(process.env.AI_PROVIDER) || "gemini";
  const primaryModelId = process.env.AWS_BEDROCK_MODEL_ID || DEFAULT_MODEL_ID;
  const fallbackModelId =
    process.env.AWS_BEDROCK_FALLBACK_MODEL_ID || DEFAULT_FALLBACK_MODEL_ID;
  const shouldTryGemini = Boolean(normalizeString(process.env.GEMINI_API_KEY));

  const tryBedrock = async (modelId) => {
    try {
      const result = await callBedrockModel({
        prompt,
        modelId,
        timeoutMs,
      });

      if (!result.parsed) {
        const error = new Error("AWS Bedrock did not return valid JSON");
        error.modelId = modelId;
        throw error;
      }

      return normalizeAiPayload(result.parsed, fallback, {
        generatedAt: fallback?.generatedAt || new Date(),
        source: "bedrock",
        model: modelId,
        aiAvailable: true,
        fallbackReason: "",
        cacheHit: false,
      });
    } catch (error) {
      const status = buildAiProviderStatus(error, "bedrock");
      status.model = modelId;
      statuses.push(status);
      console.error(`[${controllerLabel}] AWS Bedrock Error (${modelId}):`, error?.message || error);
      return null;
    }
  };

  const tryGemini = async () => {
    try {
      const result = await callGeminiModel({
        prompt,
        timeoutMs,
      });

      if (!result.parsed) {
        const error = new Error("Gemini did not return valid JSON");
        error.modelId = result.model;
        throw error;
      }

      return normalizeAiPayload(result.parsed, fallback, {
        generatedAt: fallback?.generatedAt || new Date(),
        source: "gemini",
        model: result.model,
        aiAvailable: true,
        fallbackReason: "",
        cacheHit: false,
      });
    } catch (error) {
      const status = buildAiProviderStatus(error, "gemini");
      statuses.push(status);
      console.error(`[${controllerLabel}] Gemini Error:`, error?.message || error);
      return null;
    }
  };

  let payload = null;

  if (providerPreference === "gemini") {
    payload = shouldTryGemini ? await tryGemini() : null;
  } else {
    payload = await tryBedrock(primaryModelId);
    if (!payload && fallbackModelId && fallbackModelId !== primaryModelId) {
      payload = await tryBedrock(fallbackModelId);
    }
    if (!payload && shouldTryGemini) {
      payload = await tryGemini();
    }
  }

  if (payload) {
    return payload;
  }

  const fallbackReason = buildCombinedFallbackReason(statuses);
  return normalizeAiPayload(null, fallback, {
    generatedAt: fallback?.generatedAt || new Date(),
    source: "rule_based_fallback",
    model: "local_rules",
    aiAvailable: false,
    fallbackReason,
    cacheHit: false,
  });
};

module.exports = {
  callAiAnalyticsProvider,
  parseAiJson,
  normalizeAiPayload,
  buildAiProviderStatus,
};
