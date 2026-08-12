import { API_BASE_URL } from "../../config/api";
import { getProofFileExtension } from "./proofFileUtils";

const buildInventoryProofPreviewUrl = (url = "") =>
  `${API_BASE_URL}/api/inventory/proof-preview?url=${encodeURIComponent(url)}`;

const isPublicUrl = (url = "") =>
  /^https?:\/\//i.test(url) &&
  !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url);

const isWordDocument = (url = "") =>
  ["doc", "docx"].includes(getProofFileExtension(url));

export default function ProofDocumentPreview({ candidates = [], title = "Proof document" }) {
  const candidate = candidates.find(Boolean) || "";

  if (!candidate) {
    return (
      <div className="proof-document-preview-state">
        <strong>Document preview unavailable</strong>
        <p>No proof file URL was found for this document.</p>
      </div>
    );
  }

  if (isWordDocument(candidate)) {
    if (!isPublicUrl(candidate)) {
      return (
        <div className="proof-document-preview-state">
          <strong>Word preview unavailable</strong>
          <p>Word documents need a public file URL before they can be previewed.</p>
        </div>
      );
    }

    return (
      <iframe
        title={title}
        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
          candidate
        )}`}
      />
    );
  }

  return <iframe title={title} src={buildInventoryProofPreviewUrl(candidate)} />;
}
