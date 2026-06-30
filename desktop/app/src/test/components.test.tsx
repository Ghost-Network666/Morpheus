import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TitleBar } from "../components/TitleBar";
import { Sidebar } from "../components/Sidebar";

describe("TitleBar", () => {
  it("renders the app name and connection name", () => {
    render(<TitleBar connectionName="http://127.0.0.1:7860" />);
    expect(screen.getByText("Morpheus")).toBeInTheDocument();
    expect(screen.getByText("http://127.0.0.1:7860")).toBeInTheDocument();
  });

  it("shows the provided connection name as status", () => {
    render(<TitleBar connectionName="my-server.local:7860" />);
    expect(screen.getByText("my-server.local:7860")).toBeInTheDocument();
  });
});

describe("Sidebar", () => {
  it("renders Chat nav item", () => {
    const onSelect = vi.fn();
    render(<Sidebar active="chat" onSelect={onSelect} />);
    const chatBtn = screen.getByTitle("Chat");
    expect(chatBtn).toBeInTheDocument();
  });

  it("calls onSelect with 'chat' when Chat button is clicked", () => {
    const onSelect = vi.fn();
    render(<Sidebar active="chat" onSelect={onSelect} />);
    fireEvent.click(screen.getByTitle("Chat"));
    expect(onSelect).toHaveBeenCalledWith("chat");
  });

  it("applies active styling to the active view", () => {
    const { container } = render(<Sidebar active="chat" onSelect={vi.fn()} />);
    const chatBtn = screen.getByTitle("Chat");
    expect(chatBtn.className).toContain("text-accent");
  });
});
