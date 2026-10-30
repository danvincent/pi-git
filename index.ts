import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function parseArgs(input: string): string[] {
        const args: string[] = [];
        let word = "";
        let quote = "";
        let started = false;

        for (let i = 0; i < input.length; i++) {
                const char = input[i];
                if (char === "\\" && quote !== "'") {
                        const next = input[++i];
                        if (next === undefined) throw new Error("Trailing backslash in Git arguments.");
                        if (next === "\n") continue;
                        if (quote === '"' && !['"', "\\", "$", "`"].includes(next)) word += "\\";
                        word += next;
                        started = true;
                } else if (quote) {
                        if (char === quote) quote = "";
                        else word += char;
                } else if (char === "'" || char === '"') {
                        quote = char;
                        started = true;
                } else if (/\s/.test(char)) {
                        if (started) args.push(word);
                        word = "";
                        started = false;
                } else {
                        word += char;
                        started = true;
                }
        }
        if (quote) throw new Error("Unclosed quote in Git arguments.");
        if (started) args.push(word);
        return args;
}

export default function gitExtension(pi: ExtensionAPI) {
        pi.registerCommand("git", {
                description: "Run Git directly (no model). Use @path for project-relative files.",
                handler: async (input, ctx) => {
                        try {
                                const args = parseArgs(input);
                                if (!args.length) {
                                        ctx.ui.notify("Usage: /git <arguments> — e.g. /git status or /git add @src/file.ts", "info");
                                        return;
                                }

                                // Keep Git's HEAD shorthand and revision suffixes; other @arguments are files.
                                const gitArgs = args.map((arg) =>
                                        arg.startsWith("@") && !/^@($|[{:~^])/.test(arg)
                                                ? resolve(ctx.cwd, arg.slice(1))
                                                : arg,
                                );
                                // shortcut: no terminal input; use external terminal for interactive Git commands.
                                const result = await pi.exec("git", ["--no-pager", ...gitArgs], { cwd: ctx.cwd });
                                const output = [result.stdout.trimEnd(), result.stderr.trimEnd()].filter(Boolean).join("\n");
                                const failed = result.code !== 0 || result.killed;
                                const status = result.killed ? "Git command stopped." : `Git exited with code ${result.code}.`;
                                ctx.ui.notify(
                                        [output, failed ? status : output ? "" : "Git completed."].filter(Boolean).join("\n"),
                                        failed ? "error" : "info",
                                );
                        } catch (error) {
                                ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
                        }
                },
        });
}
                          
