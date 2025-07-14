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
  private _ready: Promise<void> = Promise.resolve();
  private _watcher?: vscode.FileSystemWatcher;
  private _isIndexing = false;

  get isIndexing() {
    return this._isIndexing;
  }

  async getArtifact(name: string): Promise<AngularArtifact | undefined> {
    await this._ready;
    return this._map.get(name);
  }

  async rebuild(): Promise<void> {
    this._isIndexing = true;
    this._map.clear();
    try {
      const files = await vscode.workspace.findFiles(
        "**/*.ts",
        "**/node_modules/**"
      );

      await Promise.all(
        files.map(async (file) => {
          try {
            const doc = await vscode.workspace.openTextDocument(file);
            const text = doc.getText();

            if (
              COMPONENT_DECORATOR.test(text) ||
              DIRECTIVE_DECORATOR.test(text)
            ) {
              const match = SELECTOR_PROP.exec(text);
              if (match) {
                const selector = match[1];
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
          } catch {
            // Ignore file parse errors
          }
        })
      );
    } finally {
      this._isIndexing = false;
    }

    // Watch for .ts file changes (for all adds/changes/deletes)
    this._watcher?.dispose();
    this._watcher = vscode.workspace.createFileSystemWatcher("**/*.ts");
    this._watcher.onDidCreate((uri) => this.handleFileChange());
    this._watcher.onDidChange((uri) => this.handleFileChange());
    this._watcher.onDidDelete((uri) => this.removeFile(uri));
  }

  private async handleFileChange() {
    if (this.isIndexing) return;
    await indexWithProgress(
      "Angular Template Navigator: Updating index after file change...",
      () => this.rebuild()
    );
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

let angularIndex: AngularIndex;

async function indexWithProgress(
  title: string,
  doIndex: () => Promise<void>,
  doneInfo?: string // Optional message shown after manual refresh only
) {
  // Prevent concurrent runs
  if (angularIndex && angularIndex.isIndexing) return;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      async () => {
        await doIndex();
      }
    );
    if (doneInfo) {
      vscode.window.showInformationMessage(doneInfo);
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      "Angular Template Navigator: Indexing failed."
    );
    throw err;
  }
}

export function activate(context: vscode.ExtensionContext) {
  angularIndex = new AngularIndex();

  // Initial index on activate
  indexWithProgress(
    "Angular Template Navigator: Indexing Angular templates...",
    () => angularIndex.rebuild()
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [
        { scheme: "file", language: "html" },
        { scheme: "file", language: "angular" },
      ],
      new AngularDefinitionProvider(angularIndex)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "angularTemplateNavigator.refreshIndex",
      async () => {
        if (angularIndex.isIndexing) return;
        await indexWithProgress(
          "Angular Template Navigator: Rebuilding index...",
          () => angularIndex.rebuild(),
          "Angular Template Navigator: Indexing complete."
        );
      }
    )
  );
}

export function deactivate() {
  // Cleanup if necessary
}
