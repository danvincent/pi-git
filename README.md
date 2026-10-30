# pi-git

Run Git from Pi's prompt, directly. No model request; commands and output never enter model context.

## Install

Install directly from [GitHub](https://github.com/danvincent/pi-git); no manual clone or build needed:

```sh
pi install git:github.com/danvincent/pi-git
```

Or install from a local checkout:

```sh
pi install /absolute/path/to/pi-git
```

Restart Pi, or use `/reload`. Try without installing:

```sh
pi -e /absolute/path/to/pi-git/index.ts
```

## Use

```text
/git checkout my-branch
/git pull
/git add @path/to/file
/git add @"path with spaces/file.ts"
/git diff -- @src/main.ts
/git commit -m "Fix parser"
```

- Runs in Pi's working project folder (`ctx.cwd`), not this extension's folder.
- An argument beginning with `@` becomes an absolute file path relative to that folder. Plain paths also work. Git's HEAD shorthand (`@`, `@{…}`, `@~1`, `@^`, `@:file`) remains unchanged. For a liter>
- Single/double quotes and backslash escapes group arguments. Empty quoted arguments work.
- No shell expansion: pipes, redirects, `&&`, variables, command substitution, and globs are passed literally to Git. Use Git's own pathspecs when needed.
- Shows stdout, stderr, and failures as Pi UI notifications, not conversation messages.
- Git runs without a pager or terminal input. Use an external terminal for interactive operations such as `add -p`, editors, or credential prompts. Configure credentials beforehand; use `commit -m`.
- Git must be installed. No runtime dependencies or build step.

**Commands execute immediately with your permissions, without confirmation. Destructive commands can delete work. Git aliases, hooks, helpers, and configuration can execute other programs. Commands a>

## Tests

Requires Node.js 22.19+ and Git:

```sh
npm test
```
