import { render, screen } from "@testing-library/react";
import ReliefRequestsList from "./ReliefRequestsList";

jest.mock("react-router-dom", () => ({
  __esModule: true,
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock("../layout/DashboardShell", () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="dashboard-shell">{children}</div>,
}));

describe("ReliefRequestsList", () => {
  beforeEach(() => {
    localStorage.setItem("role", "admin");
    global.fetch = jest.fn((url) => {
      if (String(url).includes("/api/drrmo/requests/queue")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ requests: [] }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
    localStorage.clear();
  });

  test("renders without reading accomplished pagination state before initialization", async () => {
    render(<ReliefRequestsList />);

    expect(await screen.findByTestId("dashboard-shell")).toBeInTheDocument();
  });
});
