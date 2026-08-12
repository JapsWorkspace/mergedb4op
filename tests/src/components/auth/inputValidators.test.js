import {
  validateAddress,
  validateConfirmPassword,
  validateEmail,
  validateHotline,
  validatePhoneNumber,
  validateStrongPassword,
  validateUsername
} from "./inputValidators";

describe("inputValidators", () => {
  test("rejects missing and too-short usernames", () => {
    expect(validateUsername("")).toBe("Username is required");
    expect(validateUsername("ab")).toBe("Username must be at least 3 characters");
  });

  test("rejects malformed emails", () => {
    expect(validateEmail("")).toBe("Email is required");
    expect(validateEmail("wrong")).toBe("Enter a valid email address");
    expect(validateEmail("name@example.com")).toBe("");
  });

  test("requires phone numbers to start with 09 and be 11 digits", () => {
    expect(validatePhoneNumber("")).toBe("Phone number is required");
    expect(validatePhoneNumber("12345678901")).toBe(
      "Phone number must start with 09 and be 11 digits"
    );
    expect(validatePhoneNumber("09123456789")).toBe("");
  });

  test("rejects letter-only or too-short hotlines", () => {
    expect(validateHotline("")).toBe("");
    expect(validateHotline("abc")).toBe("Hotline must contain at least 7 digits");
    expect(validateHotline("044-123-4567")).toBe("");
  });

  test("requires readable addresses", () => {
    expect(validateAddress("")).toBe("Address is required");
    expect(validateAddress("abc")).toBe("Address must be at least 5 characters");
    expect(validateAddress("#####")).toBe("Address must contain readable details");
    expect(validateAddress("Purok 1, San Jose")).toBe("");
  });

  test("enforces strong passwords and confirmation", () => {
    expect(validateStrongPassword("")).toBe("Password is required");
    expect(validateStrongPassword("Aa1!")).toBe(
      "Password must contain at least 8 characters"
    );
    expect(validateStrongPassword("password1!")).toBe(
      "Password must contain at least 1 uppercase letter"
    );
    expect(validateStrongPassword("Password!")).toBe(
      "Password must contain at least 1 number"
    );
    expect(validateStrongPassword("Password1")).toBe(
      "Password must contain at least 1 special character"
    );
    expect(validateStrongPassword("Password1!")).toBe("");

    expect(validateConfirmPassword("Password1", "")).toBe(
      "Please confirm the password"
    );
    expect(validateConfirmPassword("Password1", "Password2")).toBe(
      "Passwords do not match"
    );
    expect(validateConfirmPassword("Password1", "Password1")).toBe("");
  });
});
