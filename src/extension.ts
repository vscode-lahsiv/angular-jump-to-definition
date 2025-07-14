import * as vscode from "vscode";

// Utility regex patterns
const COMPONENT_DECORATOR = /@Component\s*\(([\s\S]*?)\)/m;
const DIRECTIVE_DECORATOR = /@Directive\s*\(([\s\S]*?)\)/m;
const PIPE_DECORATOR = /@Pipe\s*\(([\s\S]*?)\)/m;
const SELECTOR_PROP = /selector\s*:\s*['"`]([^'"`]+)['"`]/m;
const NAME_PROP = /name\s*:\s*['"`]([^'"`]+)['"`]/m;

type ArtifactType = "component" | "directive" | "pipe";
interface AngularArtifact {
  type: ArtifactType;
  selectorOrName: string;
  uri: vscode.Uri;
}

class AngularIndex {
  private _map: Map<string, AngularArtifact> = new Map();
  private _ready: Promise<void>;
  private _watcher?: vscode.FileSystemWatcher;

  constructor() {
    this._ready = this.buildIndex();
  }

  async getArtifact(name: string): Promise<AngularArtifact | undefined> {
    await this._ready;
    return this._map.get(name);
  }

  async rebuild() {
    this._map.clear();
    this._ready = this.buildIndex();
    await this._ready;
  }

  private async buildIndex(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      "**/*.ts",
      "**/node_modules/**"
    );

    await Promise.all(
      files.map(async (file) => {
        try {
          const doc = await vscode.workspace.openTextDocument(file);
          const text = doc.getText();

          // Component or Directive
          if (
            COMPONENT_DECORATOR.test(text) ||
            DIRECTIVE_DECORATOR.test(text)
          ) {
            const match = SELECTOR_PROP.exec(text);
            if (match) {
              const selector = match[1];
              // Support multiple selectors (comma-separated)
              selector.split(",").forEach((sel) => {
                const trimmed = sel.trim().replace(/[\[\]]/g, "");
                this._map.set(trimmed, {
                  type: COMPONENT_DECORATOR.test(text)
                    ? "component"
                    : "directive",
                  selectorOrName: trimmed,
                  uri: file,
                });
              });
            }
          }
          // Pipe
          if (PIPE_DECORATOR.test(text)) {
            const match = NAME_PROP.exec(text);
            if (match) {
              const name = match[1].trim();
              this._map.set(name, {
                type: "pipe",
                selectorOrName: name,
                uri: file,
              });
            }
          }
        } catch (err) {
          console.error("Error processing file:", file.fsPath, err);
        }
      })
    );

    // Watcher: updates on .ts file changes
    this._watcher?.dispose();
    this._watcher = vscode.workspace.createFileSystemWatcher("**/*.ts");
    this._watcher.onDidCreate((uri) => this.addFile(uri));
    this._watcher.onDidChange((uri) => this.addFile(uri));
    this._watcher.onDidDelete((uri) => this.removeFile(uri));
    console.log(
      `[AngularIndex] Indexed selectors: ${Array.from(this._map.keys()).join(
        ", "
      )}`
    );
  }

  private async addFile(uri: vscode.Uri) {
    // Same logic as buildIndex for a single file
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText();

      if (COMPONENT_DECORATOR.test(text) || DIRECTIVE_DECORATOR.test(text)) {
        const match = SELECTOR_PROP.exec(text);
        if (match) {
          const selector = match[1];
          selector.split(",").forEach((sel) => {
            const trimmed = sel.trim().replace(/[\[\]]/g, "");
            this._map.set(trimmed, {
              type: COMPONENT_DECORATOR.test(text) ? "component" : "directive",
              selectorOrName: trimmed,
              uri,
            });
          });
        }
      }
      if (PIPE_DECORATOR.test(text)) {
        const match = NAME_PROP.exec(text);
        if (match) {
          const name = match[1].trim();
          this._map.set(name, { type: "pipe", selectorOrName: name, uri });
        }
      }
    } catch {}
  }

  private removeFile(uri: vscode.Uri) {
    for (const [key, artifact] of this._map.entries()) {
      if (artifact.uri.toString() === uri.toString()) {
        this._map.delete(key);
      }
    }
  }
}

class AngularDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly index: AngularIndex) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Definition | undefined> {
    const range = document.getWordRangeAtPosition(position, /[\w-]+/);
    if (!range) return;
    const word = document.getText(range);
    const line = document.lineAt(position.line).text;

    // Match opening/closing/self-closing component/directive tag
    const tagPattern = new RegExp(`</?\\s*${word}(\\s|>|\\/|$)`);
    if (tagPattern.test(line)) {
      const artifact = await this.index.getArtifact(word);
      if (
        artifact &&
        (artifact.type === "component" || artifact.type === "directive")
      ) {
        return new vscode.Location(artifact.uri, new vscode.Position(0, 0));
      }
    }

    // Match pipe in interpolation or in *ngFor (e.g., {{ value | pipeName }})
    // Basic pattern: "| pipeName" (optionally surrounded by spaces)
    const pipePattern = new RegExp(`\\|\\s*${word}\\b`);
    if (pipePattern.test(line)) {
      const artifact = await this.index.getArtifact(word);
      if (artifact && artifact.type === "pipe") {
        return new vscode.Location(artifact.uri, new vscode.Position(0, 0));
      }
    }
    return;
  }
}

let index: AngularIndex;

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage(
    "Angular Goto Component Extension ACTIVATED!"
  );
  index = new AngularIndex();

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [
        { scheme: "file", language: "html" },
        { scheme: "file", language: "angular" },
      ],
      new AngularDefinitionProvider(index)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "angularGotoComponent.refreshIndex",
      async () => {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Rebuilding Angular index...",
          },
          () => index.rebuild()
        );
        vscode.window.showInformationMessage("Angular index refreshed.");
      }
    )
  );
}

export function deactivate() {
  // Cleanup if necessary
}
