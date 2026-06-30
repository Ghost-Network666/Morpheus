/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    getApiBase: () => Promise<string | null>;
    [key: string]: any;
  };
}
