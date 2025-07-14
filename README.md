# Angular Template Navigator

**Navigate instantly from your Angular templates to any component, directive, pipe, or CSS/SCSS class with just Ctrl+Click or F12. Hover over class names to preview SCSS.**

---

## Features

- **Go to Component/Directive**  
  Ctrl+Click or F12 on any Angular component (`<my-component>`) or directive selector (`*myDirective`) in your template to open the corresponding TypeScript file.

- **Go to Pipe**  
  Ctrl+Click or F12 on any Angular pipe (`| myPipe`) to jump straight to its implementation.

- **Go to CSS/SCSS Class**  
  Ctrl+Click or F12 on any class name inside a `class="..."` attribute to jump directly to its definition in the related SCSS file (must be named the same as the template).

- **Class Hover Preview**  
  Hover over any class name in your template to instantly view the SCSS code block for that class—no click needed!

- **Fast & Workspace-wide**  
  Indexes all components, directives, and pipes in your entire workspace, including monorepos and libraries.

- **Auto-indexing**  
  Keeps navigation up-to-date as you add, remove, or change `.ts` files—no configuration needed.

---

## Demo

![Demo](https://github.com/vscode-lahsiv/angular-jump-to-definition/raw/main/assets/demo.gif)

---

## How to Use

1. **Install** Angular Template Navigator from the VS Code Marketplace.
2. **Open any Angular template file** (`*.html`).
3. **Ctrl+Click** (Cmd+Click on Mac) or **press F12** on:
   - A component or directive tag (`<my-selector>`, `</my-selector>`, `*myDirective`)
   - An Angular pipe in an expression (`| myPipe`)
   - A CSS class name inside a `class="..."` attribute
4. Instantly jump to the TypeScript or SCSS file where it’s defined.
5. **Hover** over a class name to preview the corresponding SCSS block.

---

## Example

```html
<!-- Component navigation -->
<app-user-profile></app-user-profile>

<!-- Directive navigation -->
<button *myHighlight>Highlight Me</button>

<!-- Pipe navigation -->
{{ user.name | capitalize }}

<!-- CSS class navigation and hover -->
<div class="user-card selected"></div>
```

## Keyboard Shortcut

- Refresh Index:

```
Shift+Alt+I
```

(Can also be accessed from the Command Palette)

## Extension Commands

- Angular Template Navigator: Refresh Index
  Available from the Command Palette.
  Use to manually rebuild the navigation index if you’ve made large structural changes.

## Extension Commands

1. No setup required — works in any Angular project, no configuration needed.

2. Blazing fast — uses smart indexing for instant navigation.

3. Works everywhere — supports monorepos, feature folders, shared libraries, and custom structures.

4. Full-featured — supports both opening and closing tags, multiple selectors, pipes, directives, and SCSS classes.

5. Developer-focused — made by Angular UI devs, for Angular UI devs.

## Notes & Limitations

1. CSS/SCSS navigation works when the template’s related SCSS file has the same name and location (e.g., user.component.html ↔ user.component.scss).

2. Only classes found in the corresponding SCSS file are detected—global stylesheets are not scanned (yet).

3. Multiple classes in a single class="..." attribute are all supported.

## License

MIT

Angular Template Navigator is not affiliated with Google or the Angular team.
Made with ❤️ for Angular developers.
