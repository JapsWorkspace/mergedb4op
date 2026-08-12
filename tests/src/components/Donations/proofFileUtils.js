const IMAGE_PROOF_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"];
const DOCUMENT_PROOF_EXTENSIONS = ["pdf", "doc", "docx"];

const extractProofFileValue = (value = "") => {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    return (
      value.url ||
      value.fileUrl ||
      value.path ||
      value.filePath ||
      value.filename ||
      value.fileName ||
      value.name ||
      ""
    );
  }

  return "";
};

const getNormalizedProofValue = (value = "") =>
  String(extractProofFileValue(value) || "").trim().replace(/\\/g, "/");

const getFileExtension = (value = "") => {
  const normalized = getNormalizedProofValue(value).split("?")[0].split("#")[0];
  const parts = normalized.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
};

export const getProofFileExtension = getFileExtension;

export const isImageProofFile = (value = "") =>
  Boolean(
    value &&
      typeof value === "object" &&
      String(value.type || value.mimeType || value.mimetype || "")
        .toLowerCase()
        .startsWith("image/")
  ) || IMAGE_PROOF_EXTENSIONS.includes(getFileExtension(value));

export const isDocumentProofFile = (value = "") =>
  DOCUMENT_PROOF_EXTENSIONS.includes(getFileExtension(value)) ||
  Boolean(
    value &&
      typeof value === "object" &&
      /pdf|wordprocessingml|msword/i.test(
        String(value.type || value.mimeType || value.mimetype || "")
      )
  );

const withBaseUrl = (path = "", baseUrl = "") => {
  const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/+$/, "");
  const normalizedPath = String(path || "").replace(/^\/+/, "");

  return normalizedBaseUrl
    ? `${normalizedBaseUrl}/${encodeURI(normalizedPath)}`
    : `/${encodeURI(normalizedPath)}`;
};

export const buildProofFileHrefCandidates = (value = "", baseUrl = "") => {
  const normalizedValue = getNormalizedProofValue(value);

  if (!normalizedValue) {
    return [];
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    return [normalizedValue];
  }

  const normalizedWithoutLeadingSlash = normalizedValue.replace(/^\/+/, "");

  if (normalizedWithoutLeadingSlash.startsWith("api/")) {
    return [withBaseUrl(normalizedWithoutLeadingSlash, baseUrl)];
  }

  const fileName = normalizedWithoutLeadingSlash.split("/").pop() || normalizedWithoutLeadingSlash;
  const hasDirectorySegments = normalizedWithoutLeadingSlash.includes("/");
  const candidates = [
    normalizedWithoutLeadingSlash.startsWith("uploads/")
      ? normalizedWithoutLeadingSlash
      : hasDirectorySegments
      ? `uploads/proofs/${fileName}`
      : `uploads/proofs/${normalizedWithoutLeadingSlash}`,
    hasDirectorySegments ? normalizedWithoutLeadingSlash : "",
    normalizedWithoutLeadingSlash.startsWith("proofs/")
      ? `uploads/${normalizedWithoutLeadingSlash}`
      : `proofs/${fileName}`,
    `uploads/proofs/${fileName}`,
  ]
    .filter(Boolean)
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .map((candidate) => withBaseUrl(candidate, baseUrl));

  return candidates;
};

export const buildProofFileHref = (value = "", baseUrl = "") => {
  const [firstCandidate = ""] = buildProofFileHrefCandidates(value, baseUrl);
  return firstCandidate;
};
