export function validateUsername(value) {
  const text = String(value || "").trim();

  if (!text) return "Username is required";
  if (text.length < 3) return "Username must be at least 3 characters";
  if (!/[a-zA-Z0-9]/.test(text)) {
    return "Username must contain letters or numbers";
  }

  return "";
}

export function validateEmail(value) {
  const text = String(value || "").trim().toLowerCase();

  if (!text) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return "Enter a valid email address";
  }

  return "";
}

export function validatePhoneNumber(value) {
  const text = String(value || "").trim();

  if (!text) return "Phone number is required";
  if (!/^09\d{9}$/.test(text)) {
    return "Phone number must start with 09 and be 11 digits";
  }

  return "";
}

export function validateHotline(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  const digits = text.replace(/\D/g, "");
  if (digits.length < 7) {
    return "Hotline must contain at least 7 digits";
  }

  return "";
}

export function validateAddress(value) {
  const text = String(value || "").trim();

  if (!text) return "Address is required";
  if (text.length < 5) return "Address must be at least 5 characters";
  if (!/[a-zA-Z0-9]/.test(text)) {
    return "Address must contain readable details";
  }

  return "";
}

export function validateStrongPassword(value) {
  const text = String(value || "");

  if (!text) return "Password is required";
  if (text.length < 8) {
    return "Password must contain at least 8 characters";
  }
  if (!/[A-Z]/.test(text)) {
    return "Password must contain at least 1 uppercase letter";
  }
  if (!/[a-z]/.test(text)) {
    return "Password must contain at least 1 lowercase letter";
  }
  if (!/\d/.test(text)) {
    return "Password must contain at least 1 number";
  }
  if (!/[^A-Za-z0-9]/.test(text)) {
    return "Password must contain at least 1 special character";
  }

  return "";
}

export function validateConfirmPassword(passwordValue, confirmValue) {
  if (!confirmValue) return "Please confirm the password";
  if (passwordValue !== confirmValue) return "Passwords do not match";
  return "";
}
