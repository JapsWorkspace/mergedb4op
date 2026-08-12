import api, { postMultipart, uploadSingleFile } from "./api";

function stringifyPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload || {}).map(([key, value]) => [
      key,
      value == null ? "" : String(value),
    ])
  );
}

export async function getDonations(params = {}) {
  const response = await api.get("/api/donations", { params });
  return Array.isArray(response.data) ? response.data : [];
}

export async function getMyDonations(userId, params = {}) {
  if (!userId) return [];

  const response = await api.get(`/api/donations/my-donations/${userId}`, {
    params,
  });

  return Array.isArray(response.data) ? response.data : [];
}

export async function getDonationById(donationId) {
  if (!donationId) return null;

  const response = await api.get(`/api/donations/${donationId}`);
  return response.data || null;
}

export async function getDonationNeeds(params = {}) {
  const response = await api.get("/api/donations/needs", { params });
  return Array.isArray(response.data) ? response.data : [];
}

export async function getDonationMatches(donationId) {
  if (!donationId) return [];

  const response = await api.get(`/api/donations/${donationId}/matches`);
  return Array.isArray(response.data) ? response.data : [];
}

export async function submitDonation(payload = {}, photo = null) {
  const parameters = stringifyPayload(payload);

  if (photo?.uri) {
    const response = await uploadSingleFile("/api/donations", photo.uri, {
      fieldName: "photos",
      mimeType: photo.type || photo.mimeType || "image/jpeg",
      fileName:
        photo.name ||
        photo.fileName ||
        `donation-proof-${Date.now()}.jpg`,
      parameters,
    });

    return response.data;
  }

  const formData = new FormData();

  Object.entries(parameters).forEach(([key, value]) => {
    formData.append(key, value);
  });

  const response = await postMultipart("/api/donations", formData);
  return response.data;
}

export async function resubmitDonation(donationId, payload = {}, photo = null) {
  if (!donationId) {
    throw new Error("Donation ID is required for resubmission.");
  }

  const parameters = stringifyPayload(payload);

  if (photo?.uri) {
    const response = await uploadSingleFile(
      `/api/donations/${donationId}/resubmit`,
      photo.uri,
      {
        fieldName: "photos",
        mimeType: photo.type || photo.mimeType || "image/jpeg",
        fileName:
          photo.name ||
          photo.fileName ||
          `donation-resubmission-${Date.now()}.jpg`,
        parameters,
        httpMethod: "PUT",
      }
    );

    return response.data;
  }

  const response = await api.put(
    `/api/donations/${donationId}/resubmit`,
    parameters
  );

  return response.data;
}

export async function updateDonationStatus(donationId, status, extraPayload = {}) {
  if (!donationId) {
    throw new Error("Donation ID is required.");
  }

  const response = await api.put(`/api/donations/${donationId}/status`, {
    status,
    ...extraPayload,
  });

  return response.data;
}

export async function assignDonation(donationId, assignmentPayload = {}) {
  if (!donationId) {
    throw new Error("Donation ID is required.");
  }

  const response = await api.put(
    `/api/donations/${donationId}/assign`,
    assignmentPayload
  );

  return response.data;
}

export async function createDonationNeed(payload = {}) {
  const response = await api.post("/api/donations/needs", payload);
  return response.data;
}
