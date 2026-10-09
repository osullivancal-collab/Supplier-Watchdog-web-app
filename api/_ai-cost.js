// Copied from SoleTasker api/_ai-cost.js (token pricing only). Telemetry, never billing.
// Centralised price snapshots for usage telemetry only. These values never
// affect customer billing or product allowance. Environment overrides allow a
// price change to be rolled out without a code deploy.
const TOKEN_PRICES_PER_MILLION_USD = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
};

const finiteNonNegative = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const rateOrDefault = (override, fallback) => {
  const parsed = finiteNonNegative(override);
  return parsed == null ? fallback ?? null : parsed;
};

export function estimateTokenCostUsd({
  model, inputTokens, outputTokens, inputRatePerMillion, outputRatePerMillion,
}) {
  const input = finiteNonNegative(inputTokens);
  const output = finiteNonNegative(outputTokens);
  if (input == null || output == null) return null;

  const known = TOKEN_PRICES_PER_MILLION_USD[model];
  const inputRate = rateOrDefault(inputRatePerMillion, known?.input);
  const outputRate = rateOrDefault(outputRatePerMillion, known?.output);
  if (inputRate == null || outputRate == null) return null;
  return (input * inputRate + output * outputRate) / 1_000_000;
}
