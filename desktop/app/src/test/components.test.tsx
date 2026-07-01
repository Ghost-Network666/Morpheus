import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TitleBar } from "../components/TitleBar";
import { Sidebar } from "../components/Sidebar";

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
  collapsed: false,
  onToggleCollapse: vi.fn(),
};

describe("Sidebar", () => {
  it("renders Chat nav item", () => {
    render(<Sidebar {...defaultSidebarProps} />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("renders Settings nav item", () => {
    render(<Sidebar {...defaultSidebarProps} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("calls onSelect when a nav item is clicked", () => {
    const onSelect = vi.fn();
    render(<Sidebar {...defaultSidebarProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Chat"));
    expect(onSelect).toHaveBeenCalledWith("chat");
  });

  it("applies active styling to the active view", () => {
    render(<Sidebar {...defaultSidebarProps} />);
    const chatBtn = screen.getByText("Chat").closest("button");
    // Active button receives glass bg styling
    expect(chatBtn?.className).toContain("bg-white");
  });
});
