"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
// Utility regex patterns
const COMPONENT_DECORATOR = /@Component\s*\(([\s\S]*?)\)/m;
const DIRECTIVE_DECORATOR = /@Directive\s*\(([\s\S]*?)\)/m;
const PIPE_DECORATOR = /@Pipe\s*\(([\s\S]*?)\)/m;
const SELECTOR_PROP = /selector\s*:\s*['"`]([^'"`]+)['"`]/m;
const NAME_PROP = /name\s*:\s*['"`]([^'"`]+)['"`]/m;
class AngularIndex {
    _map = new Map();
    _ready = Promise.resolve();
    _watcher;
    _isIndexing = false;
    get isIndexing() {
        return this._isIndexing;
    }
    async getArtifact(name) {
        await this._ready;
        return this._map.get(name);
    }
    async rebuild() {
        this._isIndexing = true;
        this._map.clear();
        try {
            const files = await vscode.workspace.findFiles("**/*.ts", "**/node_modules/**");
            await Promise.all(files.map(async (file) => {
                try {
                    const doc = await vscode.workspace.openTextDocument(file);
                    const text = doc.getText();
                    if (COMPONENT_DECORATOR.test(text) ||
                        DIRECTIVE_DECORATOR.test(text)) {
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
                }
                catch {
                    // Ignore file parse errors
                }
            }));
        }
        finally {
            this._isIndexing = false;
        }
        // Watch for .ts file changes (for all adds/changes/deletes)
        this._watcher?.dispose();
        this._watcher = vscode.workspace.createFileSystemWatcher("**/*.ts");
        this._watcher.onDidCreate((uri) => this.handleFileChange());
        this._watcher.onDidChange((uri) => this.handleFileChange());
        this._watcher.onDidDelete((uri) => this.removeFile(uri));
    }
    async handleFileChange() {
        if (this.isIndexing)
            return;
        await indexWithProgress("Angular Template Navigator: Updating index after file change...", () => this.rebuild());
    }
    removeFile(uri) {
        for (const [key, artifact] of this._map.entries()) {
            if (artifact.uri.toString() === uri.toString()) {
                this._map.delete(key);
            }
        }
    }
}
class AngularDefinitionProvider {
    index;
    constructor(index) {
        this.index = index;
    }
    async provideDefinition(document, position, _token) {
        const range = document.getWordRangeAtPosition(position, /[\w-]+/);
        if (!range)
            return;
        const word = document.getText(range);
        const line = document.lineAt(position.line).text;
        // Match opening/closing/self-closing component/directive tag
        const tagPattern = new RegExp(`</?\\s*${word}(\\s|>|\\/|$)`);
        if (tagPattern.test(line)) {
            const artifact = await this.index.getArtifact(word);
            if (artifact &&
                (artifact.type === "component" || artifact.type === "directive")) {
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
        if (document.uri.fsPath.endsWith(".component.html")) {
            // Try to find .component.scss in same folder
            const scssPath = document.uri.fsPath.replace(".html", ".scss");
            if (fs.existsSync(scssPath)) {
                const scssDoc = await vscode.workspace.openTextDocument(scssPath);
                const lines = scssDoc.getText().split(/\r?\n/);
                // Get the class name under the cursor (from class="..." or ngClass)
                // For simplicity, get word under cursor
                const word = document.getText(document.getWordRangeAtPosition(position, /[\w-]+/));
                const matchLine = lines.findIndex((line) => line.includes("." + word));
                if (matchLine !== -1) {
                    return new vscode.Location(scssDoc.uri, new vscode.Position(matchLine, 0));
                }
            }
        }
        return;
    }
}
class CssClassDefinitionProvider {
    async provideDefinition(document, position, _token) {
        // Only for .component.html
        if (!document.uri.fsPath.endsWith(".html"))
            return;
        const range = document.getWordRangeAtPosition(position, /[\w-]+/);
        if (!range)
            return;
        const word = document.getText(range);
        // Only act if cursor is inside a class="..." attribute
        const line = document.lineAt(position.line).text;
        // Find if the line contains class="..."
        const classAttrMatch = line.match(/class\s*=\s*["']([^"']+)["']/);
        if (!classAttrMatch)
            return;
        // Parse all classes in class="..." and make sure cursor is on one
        const classes = classAttrMatch[1].split(/\s+/);
        if (!classes.includes(word))
            return;
        // Find .component.scss in same folder
        const scssPath = document.uri.fsPath.replace(".html", ".scss");
        if (!fs.existsSync(scssPath))
            return;
        // Read lines and look for a loose match with .<class>
        const scssDoc = await vscode.workspace.openTextDocument(scssPath);
        const lines = scssDoc.getText().split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`.${word}`)) {
                return new vscode.Location(scssDoc.uri, new vscode.Position(i, 0));
            }
        }
        // Not found: do nothing
        return;
    }
}
class CssClassHoverProvider {
    async provideHover(document, position, token) {
        if (!document.uri.fsPath.endsWith(".html"))
            return;
        const range = document.getWordRangeAtPosition(position, /[\w-]+/);
        if (!range)
            return;
        const word = document.getText(range);
        const line = document.lineAt(position.line).text;
        const classAttrMatch = line.match(/class\s*=\s*["']([^"']+)["']/);
        if (!classAttrMatch)
            return;
        const classes = classAttrMatch[1].split(/\s+/);
        if (!classes.includes(word))
            return;
        const scssPath = document.uri.fsPath.replace(".html", ".scss");
        if (!fs.existsSync(scssPath))
            return;
        const scssDoc = await vscode.workspace.openTextDocument(scssPath);
        const lines = scssDoc.getText().split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`.${word}`)) {
                // Show the whole CSS block (from { to matching })
                let block = [lines[i]];
                let braceCount = (lines[i].match(/{/g) || []).length -
                    (lines[i].match(/}/g) || []).length;
                let j = i + 1;
                while (braceCount > 0 && j < lines.length) {
                    block.push(lines[j]);
                    braceCount += (lines[j].match(/{/g) || []).length;
                    braceCount -= (lines[j].match(/}/g) || []).length;
                    j++;
                }
                // VS Code hovers are limited in height, but this shows the full block up to the max.
                const hoverText = [{ language: "scss", value: block.join("\n") }];
                return new vscode.Hover(hoverText, range);
            }
        }
        return;
    }
}
let angularIndex;
let isManualRefresh = false;
async function indexWithProgress(title, doIndex, doneInfo // Optional message shown after manual refresh only
) {
    // Prevent concurrent runs
    if (angularIndex && angularIndex.isIndexing)
        return;
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: false,
        }, async () => {
            await doIndex();
        });
        if (doneInfo && isManualRefresh) {
            vscode.window.showInformationMessage(doneInfo);
        }
    }
    catch (err) {
        vscode.window.showErrorMessage("Angular Template Navigator: Indexing failed.");
        throw err;
    }
    finally {
        isManualRefresh = false;
    }
}
function activate(context) {
    angularIndex = new AngularIndex();
    // Initial index on activate
    indexWithProgress("Angular Template Navigator: Indexing Angular templates...", () => angularIndex.rebuild());
    context.subscriptions.push(vscode.languages.registerDefinitionProvider([
        { scheme: "file", language: "html" },
        { scheme: "file", language: "angular" },
    ], new AngularDefinitionProvider(angularIndex)), vscode.languages.registerDefinitionProvider([
        { scheme: "file", language: "html" },
        { scheme: "file", language: "angular" },
    ], new CssClassDefinitionProvider()), vscode.languages.registerHoverProvider([
        { scheme: "file", language: "html" },
        { scheme: "file", language: "angular" },
    ], new CssClassHoverProvider()));
    context.subscriptions.push(vscode.commands.registerCommand("angularTemplateNavigator.refreshIndex", async () => {
        if (angularIndex.isIndexing)
            return;
        isManualRefresh = true;
        await indexWithProgress("Angular Template Navigator: Rebuilding index...", () => angularIndex.rebuild(), "Angular Template Navigator: Indexing complete.");
    }));
}
function deactivate() {
    // Cleanup if necessary
}
//# sourceMappingURL=extension.js.map