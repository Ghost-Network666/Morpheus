import { useEffect, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar, type View } from "./components/Sidebar";
import { ChatPage } from "./pages/ChatPage";
import { getApiBase } from "./lib/connection";

export function App() {
  const [view, setView] = useState<View>("chat");
  const [connectionName, setConnectionName] = useState("Connecting…");

  useEffect(() => {
    getApiBase().then((base) => setConnectionName(base));
  }, []);

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <TitleBar connectionName={connectionName} />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={view} onSelect={setView} />
        {view === "chat" && <ChatPage />}
      </div>
    </div>
  );
}
