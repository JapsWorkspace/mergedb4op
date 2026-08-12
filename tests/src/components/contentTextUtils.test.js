import {
  CONTENT_PRIORITY_OPTIONS,
  CONTENT_STATUS_OPTIONS,
  MAX_CONTENT_DESCRIPTION_LENGTH,
  MAX_CONTENT_TITLE_LENGTH,
  sanitizeContentChoice,
  sanitizeContentDescription,
  sanitizeContentDescriptionInput,
  sanitizeContentTitle,
  sanitizeContentTitleInput,
  validateContentFields,
} from "./contentTextUtils";

describe("contentTextUtils", () => {
  test("sanitizes titles by trimming, collapsing spaces, and removing noisy symbols", () => {
    expect(sanitizeContentTitle("  !! Flood   advisory ###  ")).toBe(
      "Flood advisory"
    );
  });

  test("sanitizes descriptions while keeping readable punctuation and line breaks", () => {
    expect(
      sanitizeContentDescription(
        "  Stay indoors!!!\n\nBring water, food, and IDs. ###  "
      )
    ).toBe("Stay indoors!!\nBring water, food, and IDs.");
  });

  test("caps title and description length", () => {
    expect(
      sanitizeContentTitle("storm update ".repeat(20))
    ).toHaveLength(MAX_CONTENT_TITLE_LENGTH);
    expect(
      sanitizeContentDescription("evacuation support details ".repeat(40))
    ).toHaveLength(MAX_CONTENT_DESCRIPTION_LENGTH);
  });

  test("normalizes repeated punctuation and invalid choice values", () => {
    expect(sanitizeContentTitle("Flood alert!!!!!!")).toBe("Flood alert!!");
    expect(
      sanitizeContentChoice(" published ", CONTENT_STATUS_OPTIONS, "draft")
    ).toBe("published");
    expect(
      sanitizeContentChoice("super urgent", CONTENT_PRIORITY_OPTIONS, "medium")
    ).toBe("medium");
  });

  test("keeps in-progress spaces while typing", () => {
    expect(sanitizeContentTitleInput("Flood ")).toBe("Flood ");
    expect(sanitizeContentTitleInput("Flood advisory ")).toBe("Flood advisory ");
    expect(sanitizeContentDescriptionInput("Bring food and water ")).toBe(
      "Bring food and water "
    );
  });

  test("rejects values without enough readable letters", () => {
    expect(validateContentFields("1234567", "Weather notice")).toBe(
      "Title must contain readable letters."
    );
    expect(validateContentFields("Flood update", "1234567890")).toBe(
      "Description must contain readable details."
    );
  });

  test("accepts normal announcement-style content", () => {
    expect(
      validateContentFields(
        "Flood advisory for Barangay San Jose",
        "Residents near the river should monitor updates and prepare go-bags."
      )
    ).toBe("");
  });
});
