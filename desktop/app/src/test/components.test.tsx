import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { TitleBar } from "../components/TitleBar";
import { Sidebar } from "../components/Sidebar";
import { TooltipProvider } from "../components/ui/Tooltip";

// Sidebar nav icons use Radix Tooltip, which must live under a TooltipProvider
// (the real app wraps the whole tree in one — see main.tsx).
const renderWithProviders = (ui: ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

const mockSystemInfo = {
  version: "1.0.0",
  default_model: "llama3.2:3b",
  default_provider: "ollama",
  tailscale_url: null,
  modules: {},
};

describe("TitleBar", () => {
  it("renders the app name", () => {
    render(<TitleBar systemInfo={null} />);
    expect(screen.getByText("Morpheus")).toBeInTheDocument();
  });

  it("shows version when systemInfo is provided", () => {
    render(<TitleBar systemInfo={mockSystemInfo} />);
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
  });
});

const defaultSidebarProps = {
  active: "chat" as const,
  onSelect: vi.fn(),
  systemInfo: null,
};

describe("Sidebar", () => {
  it("renders Chat nav item", () => {
    renderWithProviders(<Sidebar {...defaultSidebarProps} />);
    expect(screen.getByLabelText("Chat")).toBeInTheDocument();
  });

  it("renders Settings nav item", () => {
    renderWithProviders(<Sidebar {...defaultSidebarProps} />);
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
  });

  it("calls onSelect when a nav item is clicked", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Sidebar {...defaultSidebarProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText("Chat"));
    expect(onSelect).toHaveBeenCalledWith("chat");
  });

  it("marks the active view with aria-current", () => {
    renderWithProviders(<Sidebar {...defaultSidebarProps} active="chat" />);
    expect(screen.getByLabelText("Chat")).toHaveAttribute("aria-current", "page");
  });
});
