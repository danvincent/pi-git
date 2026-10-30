import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import gitExtension from "../index.ts";

type Handler = Parameters<ExtensionAPI["registerCommand"]>[1]["handler"];
type Exec = ExtensionAPI["exec"];
const ok = { stdout: "", stderr: "", code: 0, killed: false };

function setup(cwd = "/project", exec: Exec = async () => ok) {
        let handler: Handler;
        const calls: { command: string; args: string[]; cwd?: string }[] = [];
        const notifications: { message: string; type?: string }[] = [];
        const api = new Proxy({
                registerCommand(name: string, command: { handler: Handler }) {
                        assert.equal(name, "git");
                        handler = command.handler;
                },
                exec: async (command: string, args: string[], options: Parameters<Exec>[2]) => {
                        calls.push({ command, args, cwd: options?.cwd });
                        return exec(command, args, options);
                },
        }, {
                get(target, property) {
                        assert.ok(property in target, `Unexpected API call: ${String(property)} (no model/session API allowed)`);
                        return Reflect.get(target, property);
                },
        });
        gitExtension(api as unknown as ExtensionAPI);
        const ctx = { cwd, ui: { notify: (message: string, type?: string) => notifications.push({ message, type }) } };
        return {
                run: (input: string) => handler(input, ctx as unknown as Parameters<Handler>[1]),
                calls,
                notifications,
        };
}

test("dispatches checkout and pull directly in project cwd", async () => {
        const h = setup();
        await h.run("checkout my-branch");
        await h.run("pull");
        assert.deepEqual(h.calls, [
                { command: "git", args: ["--no-pager", "checkout", "my-branch"], cwd: "/project" },
                { command: "git", args: ["--no-pager", "pull"], cwd: "/project" },
        ]);
        assert.equal(h.notifications[0].message, "Git completed.");
});

test("resolves @files, quoted paths, multiple files, and leading-dash filenames", async () => {
        const h = setup();
        await h.run('add @src/main.ts @"file with spaces.ts" @-danger.ts plain.ts');
        assert.deepEqual(h.calls[0].args, ["--no-pager", "add", resolve("/project/src/main.ts"),
                resolve("/project/file with spaces.ts"), resolve("/project/-danger.ts"), "plain.ts"]);
});
test("preserves Git HEAD/reflog syntax and literal @ filenames", async () => {
        const h = setup();
        await h.run("diff @ '@{1}' @~1 @^ @:file ./@name");
        assert.deepEqual(h.calls[0].args, ["--no-pager", "diff", "@", "@{1}", "@~1", "@^", "@:file", "./@name"]);
});

test("parses quotes, escapes, concatenation, empty arguments, and Unicode", async () => {
        const h = setup();
        await h.run(String.raw`commit -m 'Fix "parser"' --author="Name <a@b>" "" path\ with\ spaces '文 件' "a\qb" "a\"b"`);
        assert.deepEqual(h.calls[0].args, ["--no-pager", "commit", "-m", 'Fix "parser"',
                "--author=Name <a@b>", "", "path with spaces", "文 件", "a\\qb", 'a"b']);
});

test("backslash-newline continues arguments without adding empty words", async () => {
        const h = setup();
        await h.run("status \\\n");
        await h.run("check\\\nout my-branch");
        assert.deepEqual(h.calls.map((call) => call.args), [
                ["--no-pager", "status"], ["--no-pager", "checkout", "my-branch"],
        ]);
});

test("passes shell metacharacters literally, never starts a shell", async () => {
        const h = setup();
        await h.run("status ; touch /tmp/sentinel && echo $HOME | cat > output *.ts $(whoami)");
        assert.equal(h.calls[0].command, "git");
        assert.deepEqual(h.calls[0].args, ["--no-pager", "status", ";", "touch", "/tmp/sentinel", "&&",
                "echo", "$HOME", "|", "cat", ">", "output", "*.ts", "$(whoami)"]);
});

test("empty input and malformed quotes/escapes never execute Git", async () => {
        for (const input of ["", "  \t", "add 'unfinished", 'add "unfinished', "add path\\"]) {
                const h = setup();
                await h.run(input);
                assert.equal(h.calls.length, 0);
                assert.equal(h.notifications.length, 1);
                assert.equal(h.notifications[0].type, input.trim() ? "error" : "info");
        }
});

test("reports stdout, stderr, nonzero exits, killed processes, and spawn errors locally", async () => {
        for (const result of [
                { ...ok, stdout: "output\n", stderr: "warning\n" },
                { ...ok, stderr: "fatal: not a git repository\n", code: 128 },
                { ...ok, killed: true },
        ]) {
                const h = setup("/project", async () => result);
                await h.run("status");
                const notification = h.notifications[0];
                assert.equal(notification.type, result.code || result.killed ? "error" : "info");
                if (result.stdout) assert.ok(notification.message.includes(result.stdout.trim()));
                if (result.stderr) assert.ok(notification.message.includes(result.stderr.trim()));
                if (result.code) assert.ok(notification.message.includes("128"));
                if (result.killed) assert.ok(notification.message.includes("stopped"));
        }
        const h = setup("/project", async () => { throw new Error("spawn git ENOENT"); });
        await h.run("status");
        assert.deepEqual(h.notifications, [{ message: "spawn git ENOENT", type: "error" }]);
});

const exec = promisify(execFile);
const env = { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
