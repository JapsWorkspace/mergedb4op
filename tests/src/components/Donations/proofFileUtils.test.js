import {
  buildProofFileHrefCandidates,
  buildProofFileHref,
  isImageProofFile,
} from "./proofFileUtils";

describe("proof file url handling", () => {
  const baseUrl = "https://example.test";

  test("builds upload proof urls from bare filenames", () => {
    expect(buildProofFileHref("receipt-1.jpg", baseUrl)).toBe(
      "https://example.test/uploads/proofs/receipt-1.jpg"
    );
  });

  test("keeps stored uploads proof paths from being duplicated", () => {
    expect(buildProofFileHref("uploads/proofs/receipt-1.jpg", baseUrl)).toBe(
      "https://example.test/uploads/proofs/receipt-1.jpg"
    );
  });

  test("returns absolute proof urls unchanged", () => {
    expect(
      buildProofFileHref("https://cdn.example.test/proofs/receipt-1.jpg", baseUrl)
    ).toBe("https://cdn.example.test/proofs/receipt-1.jpg");
  });

  test("detects image proof files from stored paths", () => {
    expect(isImageProofFile("uploads/proofs/receipt-1.jpeg")).toBe(true);
  });

  test("builds proof urls from object-style payloads", () => {
    expect(
      buildProofFileHref({ fileUrl: "uploads/proofs/receipt-1.jpg" }, baseUrl)
    ).toBe("https://example.test/uploads/proofs/receipt-1.jpg");
  });

  test("encodes proof filenames that include spaces", () => {
    expect(buildProofFileHref("Project Guidelines 1.pdf", baseUrl)).toBe(
      "https://example.test/uploads/proofs/Project%20Guidelines%201.pdf"
    );
  });

  test("builds multiple fallback candidates for proof-prefixed paths", () => {
    expect(buildProofFileHrefCandidates("proofs/receipt-1.jpg", baseUrl)).toEqual([
      "https://example.test/uploads/proofs/receipt-1.jpg",
      "https://example.test/proofs/receipt-1.jpg",
    ]);
  });
});
