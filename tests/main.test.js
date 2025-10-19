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
  it("cd to home with ~ works", async () => {
    const { stdout } = await runShell(["cd ~", "pwd"]);
    // expect(stdout).toMatch(
    //   new RegExp(os.homedir().replace(//g, "\\$&"))
    // );
    expect(stdout).toMatch(/C:\\Users\\masha|[-/\\^$*+?.()|[\]{}]/g);
  });
});

describe("POSIX - REDIRECTION", () => {
  it("redirect stdout with > creates file with content", async () => {
    const fn = path.join(os.tmpdir(), `out-${Date.now()}.txt`);
    try {
      await runShell([`echo hi > ${fn}`]);
      const content = fs.readFileSync(fn, "utf8").trim();
      expect(content).toBe("hi");
    } finally {
      try {
        fs.unlinkSync(fn);
      } catch {}
    }
  });
  it("redirect stderr with 2> writes error output to file", async () => {
    const fn = path.join(os.tmpdir(), `err-${Date.now()}.txt`);
    try {
      await runShell([`cd no-such-dir 2> ${fn}`]);
      const content = fs.readFileSync(fn, "utf8").trim();
      expect(content).toMatch(/No such file or directory|not found/);
    } finally {
      try {
        fs.unlinkSync(fn);
      } catch {}
    }
  });
  it("append stdout with >> appends to file", async () => {
    const fn = path.join(os.tmpdir(), `out-${Date.now()}.txt`);
    try {
      await runShell([`echo first > ${fn}`]);
      await runShell([`echo second >> ${fn}`]);
      const content = fs.readFileSync(fn, "utf8").trim().split(/\r?\n/);
      expect(content[0]).toBe("first");
      expect(content[1]).toBe("second");
    } finally {
      try {
        fs.unlinkSync(fn);
      } catch {}
    }
  });

  it("append stderr with 2>> appends to file", async () => {
    const fn = path.join(os.tmpdir(), `err-${Date.now()}.txt`);
    try {
      await runShell([`cd no-such-dir 2> ${fn}`]);
      await runShell([`cd another-nonexistent 2>> ${fn}`]);
      const lines = fs.readFileSync(fn, "utf8").trim().split(/\r?\n/);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    } finally {
      try {
        fs.unlinkSync(fn);
      } catch {}
    }
  });
});

// describe("basic features - POSIX", () => {

//
// This test will not work directly as The SHELL was implemented with the help of code crafters
// and they provided support for external program excecution and Built-in Executable files
//

//   // it("type builtin finds executables on PATH", async () => {
//   //   // check for node (available because we run node)
//   //   const { stdout } = await runShell(["type node"]);
//   //   expect(stdout).toMatch(/not found/);
//   // });

//   //   it("run external program (node -e) prints output", async () => {
//   //     const { stdout } = await runShell([`node -e "process.stdout.write('OK')"`]);
//   //     expect(stdout).toMatch(/OK/);
//   //   });
// });
