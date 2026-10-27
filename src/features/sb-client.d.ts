declare global {
  interface Window {
    client?: {
      editorView: any;
      flashNotification?: (msg: string, type?: string) => void;
      rebuildEditorState?: () => void;
      [key: string]: any;
    };
  }
}

export { };
