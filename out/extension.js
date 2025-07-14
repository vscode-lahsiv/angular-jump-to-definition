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
// Utility regex patterns
const COMPONENT_DECORATOR = /@Component\s*\(([\s\S]*?)\)/m;
const DIRECTIVE_DECORATOR = /@Directive\s*\(([\s\S]*?)\)/m;
const PIPE_DECORATOR = /@Pipe\s*\(([\s\S]*?)\)/m;
const SELECTOR_PROP = /selector\s*:\s*['"`]([^'"`]+)['"`]/m;
const NAME_PROP = /name\s*:\s*['"`]([^'"`]+)['"`]/m;
class AngularIndex {
    _map = new Map();
    _ready;
    _watcher;
    constructor() {
        this._ready = this.buildIndex();
    }
    async getArtifact(name) {
        await this._ready;
        return this._map.get(name);
    }
    async rebuild() {
        this._map.clear();
        this._ready = this.buildIndex();
        await this._ready;
    }
    async buildIndex() {
        const files = await vscode.workspace.findFiles("**/*.ts", "**/node_modules/**");
        await Promise.all(files.map(async (file) => {
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                const text = doc.getText();
                // Component or Directive
                if (COMPONENT_DECORATOR.test(text) ||
                    DIRECTIVE_DECORATOR.test(text)) {
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
            }
            catch (err) {
                console.error("Error processing file:", file.fsPath, err);
            }
        }));
        // Watcher: updates on .ts file changes
        this._watcher?.dispose();
        this._watcher = vscode.workspace.createFileSystemWatcher("**/*.ts");
        this._watcher.onDidCreate((uri) => this.addFile(uri));
        this._watcher.onDidChange((uri) => this.addFile(uri));
        this._watcher.onDidDelete((uri) => this.removeFile(uri));
        console.log(`[AngularIndex] Indexed selectors: ${Array.from(this._map.keys()).join(", ")}`);
    }
    async addFile(uri) {
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
        }
        catch { }
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
let index;
function activate(context) {
    vscode.window.showInformationMessage("Angular Goto Component Extension ACTIVATED!");
    index = new AngularIndex();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider([
        { scheme: "file", language: "html" },
        { scheme: "file", language: "angular" },
    ], new AngularDefinitionProvider(index)));
    context.subscriptions.push(vscode.commands.registerCommand("angularGotoComponent.refreshIndex", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Rebuilding Angular index...",
        }, () => index.rebuild());
        vscode.window.showInformationMessage("Angular index refreshed.");
    }));
}
function deactivate() {
    // Cleanup if necessary
}
//# sourceMappingURL=extension.js.map