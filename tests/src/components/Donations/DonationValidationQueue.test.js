import { render, screen, waitFor } from "@testing-library/react";
import DonationValidationQueue from "./DonationValidationQueue";

jest.mock("../layout/DashboardShell", () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));

jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      role: "admin",
    },
  }),
}));

const createJsonResponse = (data) =>
  Promise.resolve({
    ok: true,
    json: async () => data,
  });

describe("DonationValidationQueue", () => {
  const receivedDonation = {
    _id: "donation-1",
    status: "received",
    donorName: "Notocall",
    donationType: "monetary",
    inventoryType: "monetary",
    amount: 5200,
    referenceNumber: "4123512312",
    sourceType: "external",
    fulfillmentMethod: "drop_off",
    createdAt: "2026-05-06T02:15:00.000Z",
    updatedAt: "2026-05-06T02:15:00.000Z",
    photos: [],
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps the right panel empty when the active queue is empty", async () => {
    global.fetch = jest.fn((url) => {
      if (
        String(url).includes(
          "/api/donations?limit=300&type=monetary&scope=validation_queue"
        )
      ) {
        return createJsonResponse([receivedDonation]);
      }

      if (String(url).endsWith(`/api/donations/${receivedDonation._id}`)) {
        throw new Error("Details should not load for non-active donations.");
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    render(<DonationValidationQueue />);

    expect(
      await screen.findByText("No active donation records found.")
    ).toBeInTheDocument();
    expect(screen.getByText("No selected donation")).toBeInTheDocument();

    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining(`/api/donations/${receivedDonation._id}`),
      expect.anything()
    );
    await waitFor(() => {
      expect(screen.getByText("No selected donation")).toBeInTheDocument();
    });

    expect(screen.queryByText("Decision Panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Notocall")).not.toBeInTheDocument();
  });
});
