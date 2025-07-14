# Angular Template Navigator

**Navigate instantly from your Angular templates to any component, directive, pipe, or CSS with just Ctrl+Click or F12.**

---

## Features

- **Go to Component/Directive**  
  Ctrl+Click or F12 on any Angular component (`<my-component>`) or directive selector (`*myDirective`) in your template to open the corresponding TypeScript file.

- **Go to Pipe**  
  Ctrl+Click or F12 on any Angular pipe (`| myPipe`) to jump straight to its implementation.

- **Fast & Workspace-wide**  
  Indexes all components, directives, and pipes in your entire workspace, including monorepos and libraries.

- **Auto-indexing**  
  Keeps navigation up-to-date as you add, remove, or change `.ts` files—no configuration needed.

- **Coming Soon**  
  CSS/SCSS class navigation from your templates.

---

## How to Use

1. **Install** Angular Template Navigator from the VS Code Marketplace.
2. **Open any Angular template file** (usually `*.html`).
3. **Ctrl+Click** (Cmd+Click on Mac) or **press F12** on:
   - A component or directive tag (`<my-selector>`, `</my-selector>`, `*myDirective`)
   - An Angular pipe in an expression (`| myPipe`)
4. Instantly jump to the TypeScript file where it's defined.

---

## Example

```html
<!-- Component navigation -->
<app-user-profile></app-user-profile>

<!-- Directive navigation -->
<button *myHighlight>Highlight Me</button>

<!-- Pipe navigation -->
{{ user.name | capitalize }}
```

## Extension Commands

- Angular Template Navigator: Refresh Index
  Available from the Command Palette.
  Use to manually rebuild the navigation index if you’ve made large structural changes.

## Extension Commands

1. No setup required — works in any Angular project, no configuration needed.

2. Blazing fast — uses smart indexing for instant navigation.

3. Works everywhere — supports monorepos, feature folders, shared libraries, and custom structures.

4. Supports both opening and closing tags, multiple selectors, pipes, and directives.

5. Future-proof — new features like CSS navigation coming soon.

## License

MIT

Angular Template Navigator is not affiliated with Google or the Angular team.
Made with ❤️ for Angular developers.
