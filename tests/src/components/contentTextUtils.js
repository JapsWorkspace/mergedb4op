export const MAX_CONTENT_TITLE_LENGTH = 90;
export const MAX_CONTENT_DESCRIPTION_LENGTH = 600;
export const CONTENT_STATUS_OPTIONS = ["draft", "published", "archived"];
export const CONTENT_PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];

const collapseWhitespace = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

const trimLongTokens = (value, maxTokenLength = 48) =>
  String(value || "")
    .split(/(\s+)/)
    .map((token) => (/\s+/.test(token) ? token : token.slice(0, maxTokenLength)))
    .join("");

const clampRepeatedPunctuation = (value) =>
  String(value || "").replace(/([!?.,:;'"#&/%()+$-])\1{2,}/g, "$1$1");

const stripUnsupportedCharacters = (value, { allowLineBreaks = false } = {}) => {
  const normalized = String(value || "").normalize("NFKC");

  return normalized.replace(
    new RegExp(`[^A-Za-z0-9 .,!?():;@%&/+'"#\\-_${allowLineBreaks ? "\\n" : ""}]`, "g"),
    ""
  );
};

const trimNoise = (value) =>
  String(value || "")
    .replace(/(^|[\s\n])[#@%&/+=_*^~`|\\]+(?=$|[\s\n])/g, " ")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9.!?)]$/, "")
    .trim();

const trimContentLines = (value) =>
  String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

const hasReadableLetters = (value, minimumLetters = 3) => {
  const matches = String(value || "").match(/[A-Za-z]/g);
  return (matches?.length || 0) >= minimumLetters;
};

export const sanitizeContentTitle = (value) =>
  trimContentLines(
    trimNoise(
      clampRepeatedPunctuation(
        trimLongTokens(stripUnsupportedCharacters(collapseWhitespace(value)), 32)
      )
    ).replace(/[ ]{2,}/g, " ")
  ).slice(0, MAX_CONTENT_TITLE_LENGTH);

export const sanitizeContentDescription = (value) =>
  trimContentLines(
    trimNoise(
      clampRepeatedPunctuation(
        trimLongTokens(
          stripUnsupportedCharacters(collapseWhitespace(value), {
            allowLineBreaks: true,
          }),
          56
        )
      )
    )
      .replace(/[ ]*\n[ ]*/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .replace(/[ ]{2,}/g, " ")
  ).slice(0, MAX_CONTENT_DESCRIPTION_LENGTH);
const sanitizeContentInputDraft = (
  value,
  { maxLength, allowLineBreaks = false, maxTokenLength = 48 } = {}
) => {
  const collapsed = collapseWhitespace(value);
  const stripped = stripUnsupportedCharacters(collapsed, { allowLineBreaks });
  const trimmedTokens = trimLongTokens(stripped, maxTokenLength);
  const clamped = clampRepeatedPunctuation(trimmedTokens);

  if (allowLineBreaks) {
    return clamped
      .replace(/[ ]*\n[ ]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .slice(0, maxLength);
  }

  return clamped.replace(/[ ]{2,}/g, " ").slice(0, maxLength);
};

export const sanitizeContentTitleInput = (value) =>
  sanitizeContentInputDraft(value, {
    maxLength: MAX_CONTENT_TITLE_LENGTH,
    allowLineBreaks: false,
    maxTokenLength: 32,
  });

export const sanitizeContentDescriptionInput = (value) =>
  sanitizeContentInputDraft(value, {
    maxLength: MAX_CONTENT_DESCRIPTION_LENGTH,
    allowLineBreaks: true,
    maxTokenLength: 56,
  });

export const sanitizeContentChoice = (value, allowedValues = [], fallback = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
};

export const validateContentFields = (title, description) => {
  const cleanTitle = sanitizeContentTitle(title);
  const cleanDescription = sanitizeContentDescription(description);

  if (!cleanTitle || !cleanDescription) {
    return "Title and description are required.";
  }

  if (!hasReadableLetters(cleanTitle, 3)) {
    return "Title must contain readable letters.";
  }

  if (!hasReadableLetters(cleanDescription, 6)) {
    return "Description must contain readable details.";
  }

  return "";
};
