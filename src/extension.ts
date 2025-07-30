import * as vscode from "vscode";
import * as fs from "fs";

// ---------------- Signal Detection and Decoration ------------------

const KIND_EMOJI: Record<string, string> = {
  signal: "signal",
  input: "input",
  output: "output",
  model: "model",
  computed: "computed",
  linkedSignal: "linkedSignal",
};

// Define distinct colors for each kind
const KIND_COLORS: Record<string, string> = {
  signal: "#569CD6", // Blue for signals
  input: "#4EC9B0", // Teal for inputs
  output: "#D16969", // Red for outputs
  model: "#C586C0", // Purple for models
  computed: "#4FC1FF", // Light blue for computed
  linkedSignal: "#B8A1FF", // Light purple for linkedSignal
};

const KIND_STYLE: Record<string, vscode.TextEditorDecorationType> = {};

function extractSignalsFromTs(tsText: string) {
  const results: Record<string, { kind: string; type: string }> = {};
  // Regex patterns for each kind (type is optional)
  const patterns = [
    { kind: "signal", regex: /(\w+)\s*=\s*signal\s*\(/g },
    { kind: "input", regex: /(\w+)\s*=\s*input\s*\(/g },
    { kind: "output", regex: /(\w+)\s*=\s*output(?:\s*<([^>]*)>)?\s*\(/g },
    { kind: "model", regex: /(\w+)\s*=\s*model(?:\s*<([^>]*)>)?\s*\(/g },
    { kind: "computed", regex: /(\w+)\s*=\s*computed\s*\(/g },
    { kind: "linkedSignal", regex: /(\w+)\s*=\s*linkedSignal\s*\(/g },
  ];
  for (const { kind, regex } of patterns) {
    let match;
    while ((match = regex.exec(tsText))) {
      const name = match[1];
      const type = match[2]?.trim() || "unknown";
      results[name] = { kind, type };
    }
  }
  return results;
}

function decorateSignalsInTemplate(
  templateDoc: vscode.TextDocument,
  signals: Record<string, { kind: string; type: string }>
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== templateDoc) {
    console.log("No active editor or editor document mismatch");
    return;
  }

  // Find all foo() in template
  const regex = /(\w+)\s*\(\s*\)/g; // Matches mySignal()
  const text = templateDoc.getText();
  let match;
  const decoOptions: Record<string, vscode.DecorationOptions[]> = {};

  for (const kind of Object.keys(KIND_EMOJI)) decoOptions[kind] = [];

  while ((match = regex.exec(text))) {
    const name = match[1];
    if (signals[name]) {
      console.log(`Applying ${signals[name]}`);
      const kind = signals[name].kind;
      console.log(`Applying ${kind}`);
      const startPos = templateDoc.positionAt(match.index);
      // Include parentheses in the range for full mySignal()
      const endPos = templateDoc.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);

      // Decoration with gutter emoji and hover message
      decoOptions[kind].push({
        range,
        hoverMessage: `Signal: ${name}`,
        renderOptions: {
          before: {
            contentText: KIND_EMOJI[kind] + "-->",
            color: "#888",
            fontWeight: "bold",
            margin: "0 4px 0 0",
          },
          // Apply color to the signal text
          after: {
            contentText: "", // No content needed after
          },
        },
      });
    }
  }

  // Create and set decorations per kind
  for (const kind of Object.keys(KIND_EMOJI)) {
    if (!KIND_STYLE[kind]) {
      KIND_STYLE[kind] = vscode.window.createTextEditorDecorationType({
        isWholeLine: false,
        overviewRulerColor: KIND_COLORS[kind],
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        fontStyle: "italic",
        fontWeight: "bold",
        textDecoration: `none; color: ${KIND_COLORS[kind]} !important;`, // Override theme defaults
      });
    }
    editor.setDecorations(KIND_STYLE[kind], decoOptions[kind]);
  }
}

// ----------- Angular Navigation & CSS Indexing ---------------------

const COMPONENT_DECORATOR = /@Component\s*\(([\s\S]*?)\)/m;
const DIRECTIVE_DECORATOR = /@Directive\s*\(([\s\S]*?)\)/m;
const PIPE_DECORATOR = /@Pipe\s*\(([\s\S]*?)\)/m;
const SELECTOR_PROP = /selector\s*:\s*['"`]([^'"`]+)['"`]/m;
const NAME_PROP = /name\s*:\s*['"`]([^'"`]+)['"`]/m;

const MAX_FILES = 2000;

type ArtifactType = "component" | "directive" | "pipe";
interface AngularArtifact {
  type: ArtifactType;
  selectorOrName: string;
  uri: vscode.Uri;
}

class AngularIndex {
  private _map: Map<string, AngularArtifact> = new Map();
  private _isIndexing = false;

  get isIndexing() {
    return this._isIndexing;
  }

  async getArtifact(name: string): Promise<AngularArtifact | undefined> {
    return this._map.get(name);
  }

  async rebuild(
    progress?: vscode.Progress<{ increment: number; message?: string }>
  ): Promise<void> {
    this._isIndexing = true;
    this._map.clear();
    const files = await vscode.workspace.findFiles(
      "**/*.ts",
      "**/node_modules/**"
    );
    // Cap for large projects
    if (files.length > MAX_FILES) {
      vscode.window.showWarningMessage(
        `Angular Template Navigator: Workspace too large (${files.length} files). Extension Disabled.`
      );
      this._isIndexing = false;
      return;
    }
    let i = 0;
    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const text = doc.getText();
        if (COMPONENT_DECORATOR.test(text) || DIRECTIVE_DECORATOR.test(text)) {
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
      } catch {}
      i++;
      if (progress) {
        progress.report({
          increment: 100 / files.length,
          message: `Indexed ${i} of ${files.length} files.`,
        });
      }
    }
    this._isIndexing = false;
  }
}

function findScssPath(htmlPath: string) {
  const scss = htmlPath.replace(/\.html$/, ".scss");
  return fs.existsSync(scss) ? scss : undefined;
}

function extractClassNameFromNgClass(
  line: string,
  cursorIndex: number
): string | undefined {
  // [ngClass]="'foo bar'" or [ngClass]="['foo', ...]"
  // We try to get the class under cursor (in a string literal or array)
  const singleQuote = line.match(/\[ngClass\]\s*=\s*'([^']+)'/);
  const doubleQuote = line.match(/\[ngClass\]\s*=\s*"([^"]+)"/);
  const arrayQuote = line.match(/\[ngClass\]\s*=\s*\[([^\]]+)\]/);

  let candidates: string[] = [];
  if (singleQuote) candidates = singleQuote[1].split(/\s+/);
  else if (doubleQuote) candidates = doubleQuote[1].split(/\s+/);
  else if (arrayQuote)
    candidates = arrayQuote[1]
      .split(/,\s*/)
      .map((s) => s.replace(/['"`]/g, "").trim());

  for (const cname of candidates) {
    const idx = line.indexOf(cname);
    if (idx !== -1 && cursorIndex >= idx && cursorIndex <= idx + cname.length)
      return cname;
  }
  return undefined;
}

function extractClassNameFromClassBinding(
  line: string,
  position: vscode.Position
): string | undefined {
  // [class.foo]="..."
  const m = line.match(/\[class\.([\w-]+)\]/);
  if (m) return m[1];
  return undefined;
}

function extractClassNameFromClassAttr(
  line: string,
  position: vscode.Position
): string | undefined {
  const classAttrMatch = line.match(/class\s*=\s*["']([^"']+)["']/);
  if (!classAttrMatch) return;
  const classes = classAttrMatch[1].split(/\s+/);
  // Find which class is under the cursor
  let offset = line.indexOf(classAttrMatch[1]);
  for (const cname of classes) {
    const start = offset;
    const end = start + cname.length;
    if (position.character >= start && position.character <= end) return cname;
    offset = end + 1;
  }
  return undefined;
}

async function findCssDefinition(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Location | undefined> {
  const scssPath = findScssPath(document.uri.fsPath);
  if (!scssPath) return;
  const scssDoc = await vscode.workspace.openTextDocument(scssPath);
  const lines = scssDoc.getText().split(/\r?\n/);

  const line = document.lineAt(position.line).text;
  let className: string | undefined;

  // Check for class="..."
  className = extractClassNameFromClassAttr(line, position);
  // Check for [class.foo]
  if (!className) className = extractClassNameFromClassBinding(line, position);
  // Check for [ngClass]
  if (!className && line.includes("[ngClass]")) {
    className = extractClassNameFromNgClass(line, position.character);
  }
  if (!className) return;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`.${className}`)) {
      return new vscode.Location(scssDoc.uri, new vscode.Position(i, 0));
    }
  }
  return undefined;
}

async function findCssHover(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover | undefined> {
  const scssPath = findScssPath(document.uri.fsPath);
  if (!scssPath) return;
  const scssDoc = await vscode.workspace.openTextDocument(scssPath);
  const lines = scssDoc.getText().split(/\r?\n/);

  const line = document.lineAt(position.line).text;
  let className: string | undefined;

  className = extractClassNameFromClassAttr(line, position);
  if (!className) className = extractClassNameFromClassBinding(line, position);
  if (!className && line.includes("[ngClass]")) {
    className = extractClassNameFromNgClass(line, position.character);
  }
  if (!className) return;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`.${className}`)) {
      // Show the whole CSS block (from { to matching })
      let block = [lines[i]];
      let braceCount =
        (lines[i].match(/{/g) || []).length -
        (lines[i].match(/}/g) || []).length;
      let j = i + 1;
      while (braceCount > 0 && j < lines.length) {
        block.push(lines[j]);
        braceCount += (lines[j].match(/{/g) || []).length;
        braceCount -= (lines[j].match(/}/g) || []).length;
        j++;
      }
      const hoverText = [{ language: "scss", value: block.join("\n") }];
      const range = new vscode.Range(
        position.line,
        line.indexOf(className),
        position.line,
        line.indexOf(className) + className.length
      );
      return new vscode.Hover(hoverText, range);
    }
  }
  return;
}

// ------------------ Providers ----------------------

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

    // CSS logic (for class, [class.foo], [ngClass])
    const cssLoc = await findCssDefinition(document, position);
    if (cssLoc) return cssLoc;

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

class CssClassHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    return findCssHover(document, position);
  }
}

// ----------- Signals Hover Provider -----------------

class SignalHoverProvider implements vscode.HoverProvider {
  constructor(
    private getSignals: (
      doc: vscode.TextDocument
    ) => Record<string, { kind: string; type: string }>
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    if (!document.fileName.endsWith(".component.html")) return;
    const range = document.getWordRangeAtPosition(position, /\w+/);
    if (!range) return;
    const word = document.getText(range);
    const after = document.getText(
      new vscode.Range(range.end, range.end.translate(0, 2))
    );
    const signals = this.getSignals(document);
    if (after.trim().startsWith("()") && signals[word]) {
      const sig = signals[word];
      return new vscode.Hover(
        [
          `**${sig.kind.charAt(0).toUpperCase() + sig.kind.slice(1)}**`,
          sig.type && sig.type !== "unknown" ? `\`type: ${sig.type}\`` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        range
      );
    }
  }
}

// ---------------- Main Extension Activation ------------------

let angularIndex: AngularIndex;
let isManualRefresh = false;

// Map of html doc uri -> last signals parsed
const signalCache: Map<
  string,
  Record<string, { kind: string; type: string }>
> = new Map();

async function indexWithProgress(
  title: string,
  doIndex: (
    progress: vscode.Progress<{ increment: number; message?: string }>
  ) => Promise<void>,
  doneInfo?: string
) {
  if (angularIndex && angularIndex.isIndexing) return;
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      async (progress) => {
        await doIndex(progress);
      }
    );
    if (doneInfo && isManualRefresh) {
      vscode.window.showInformationMessage(doneInfo);
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      "Angular Template Navigator: Indexing failed."
    );
    throw err;
  } finally {
    isManualRefresh = false;
  }
}

export function activate(context: vscode.ExtensionContext) {
  angularIndex = new AngularIndex();

  // Initial index on activate (progress bar)
  indexWithProgress("Angular Template Navigator: Templates", (progress) =>
    angularIndex.rebuild(progress)
  );

  // Index only on SAVE of .ts/.html files
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (
        !angularIndex.isIndexing &&
        (doc.fileName.endsWith(".ts") || doc.fileName.endsWith(".html"))
      ) {
        await indexWithProgress(
          "Angular Template Navigator: Indexing Update",
          (progress) => angularIndex.rebuild(progress)
        );
      }
    })
  );

  // SIGNAL DECORATION: On open or edit .component.html
  function updateSignalDecorations(templateDoc: vscode.TextDocument) {
    const editor = vscode.window.activeTextEditor;

    const tsPath = templateDoc.fileName.replace(/\.html$/, ".ts");
    if (!fs.existsSync(tsPath)) return;
    try {
      const tsText = fs.readFileSync(tsPath, "utf-8");
      const signals = extractSignalsFromTs(tsText);
      signalCache.set(templateDoc.uri.toString(), signals);
      decorateSignalsInTemplate(templateDoc, signals);
    } catch {}
  }

  // Update on open
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (
        editor &&
        editor.document &&
        editor.document.fileName.endsWith(".html")
      ) {
        updateSignalDecorations(editor.document);
      }
    })
  );
  // Update on change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const doc = event.document;
      if (!doc.fileName.endsWith(".html")) return;
      updateSignalDecorations(doc);
    })
  );

  // Angular navigation and css
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [
        { scheme: "file", language: "html" },
        { scheme: "file", language: "angular" },
      ],
      new AngularDefinitionProvider(angularIndex)
    ),
    vscode.languages.registerHoverProvider(
      [
        { scheme: "file", language: "html" },
        { scheme: "file", language: "angular" },
      ],
      new CssClassHoverProvider()
    ),
    vscode.languages.registerHoverProvider(
      [
        { scheme: "file", language: "html" },
        { scheme: "file", language: "angular" },
      ],
      new SignalHoverProvider(
        (doc) => signalCache.get(doc.uri.toString()) ?? {}
      )
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "angularTemplateNavigator.refreshIndex",
      async () => {
        if (angularIndex.isIndexing) return;
        isManualRefresh = true;
        await indexWithProgress(
          "Angular Template Navigator: Rebuilding index.",
          (progress) => angularIndex.rebuild(progress),
          "Angular Template Navigator: Indexing complete."
        );
      }
    )
  );
}

export function deactivate() {}
