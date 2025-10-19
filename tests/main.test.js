import { describe, test, it, expect } from "vitest";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SHELL = process.execPath; // node
const SHELL_SCRIPT = path.join(__dirname, "..", "app", "main.js");

function runShell(commands, opts = {}) {
  const timeout = opts.timeout || 5000;
  return new Promise((resolve, reject) => {
    const child = spawn(SHELL, [SHELL_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", reject);

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    // write each command and flush with newline; ensure exit at end
    for (const c of commands) child.stdin.write(c + "\n");
    child.stdin.write("exit 0\n");

    // safety timeout
    setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
        reject(new Error("shell timed out"));
      }
    }, timeout);
  });
}

describe("basic features - POsix", () => {
  it("handleing invalid cmd", async () => {
    const { stderr } = await runShell(["jnksdc"]);
    expect(stderr).toMatch(/command not found|not found/);
  });
  it("should handel exit", async () => {
    const { code } = await runShell(["exit 0"]);
    expect(code).toBe(0);
  });
  it("Echoing a string", async () => {
    const { stdout } = await runShell(["echo hello"]);
    expect(stdout).toMatch(/hello/);
  });
  it("Checking for Built-in", async () => {
    const { stdout } = await runShell(["type echo"]);
    expect(stdout).toMatch(/is a shell builtin/);
  });
});

describe("POSIX - Navigation", () => {
  it("pwd builtin prints cwd", async () => {
    const { stdout } = await runShell(["pwd"]);
    // shell may print prompt before output, so check that cwd appears
    expect(stdout).toMatch(
      new RegExp(process.cwd().replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    );
  });
  it("cd absolute path works", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shell-test-"));
    const { stdout } = await runShell([`echo ${tmp}`, `cd ${tmp}`, "pwd"]);
    expect(stdout).toMatch(
      new RegExp(tmp.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    );
  });
  it("cd relative path works", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "shell-test-"));
    const sub = path.join(base, "subdir");
    fs.mkdirSync(sub);
    // start shell from base, then cd into subdir
    const { stdout } = await runShell([`cd ${base}`, `cd subdir`, "pwd"]);
    expect(stdout).toMatch(
      new RegExp(sub.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    );
  });
  test("cd to home with ~ works", async () => {
    const { stdout } = await runShell(["cd ~", "pwd"]);
    expect(stdout).toMatch(
      new RegExp(os.homedir().replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    );
  });
});
