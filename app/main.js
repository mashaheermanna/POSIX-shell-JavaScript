const { exit } = require("process");
const os = require("os");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Built-in commands
const builtins = new Set(["echo", "cd", "exit", "type", "pwd"]);

// Readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Redirection state for each loop
let stdoutRedirect = null;
let stderrRedirect = null;

// Parse redirection operators and set stdoutRedirect and stderrRedirect
function parseRedirection(line) {
  stdoutRedirect = null;
  stderrRedirect = null;
  const redirRegex = /(?:^|\s)([12]?)(>>?|>)(\s*)(\S+)/g;
  let match;
  let cmd = line;

  while ((match = redirRegex.exec(line)) !== null) {
    const fd = match[1] === "2" ? 2 : 1;
    const op = match[2];
    const file = match[4];
    const append = op === ">>";

    if (fd === 1) {
      stdoutRedirect = { path: file, flags: append ? "a" : "w" };
    } else {
      stderrRedirect = { path: file, flags: append ? "a" : "w" };
    }
  }

  // Remove redirection parts from the command line
  return cmd.replace(redirRegex, "").trim();
}

// Helper to write output to stdout or stderr, or to a file via redirect
function writeOutput(streamFunc, redirect, data) {
  if (redirect) {
    fs.writeFileSync(redirect.path, data + "\n", { flag: redirect.flags });
  } else {
    streamFunc(data);
  }
}

// Main REPL loop
function recur() {
  rl.question("$ ", (answer) => {
    if (!answer.trim()) return recur();

    // Parse redirection and strip operators
    const raw = parseRedirection(answer);

    // Pre-open/truncate or create redirection files
    if (stdoutRedirect) {
      fs.writeFileSync(stdoutRedirect.path, "", { flag: stdoutRedirect.flags });
    }
    if (stderrRedirect) {
      fs.writeFileSync(stderrRedirect.path, "", { flag: stderrRedirect.flags });
    }

    const parts = raw.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
      case "exit":
        return exit(parseInt(args[0], 10) || 0);

      case "pwd": {
        const cwd = process.cwd();
        writeOutput(console.log, stdoutRedirect, cwd);
        return recur();
      }

      case "cd": {
        let target = args[0] || os.homedir();
        if (target === "~") target = os.homedir();
        if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
          writeOutput(
            console.error,
            stderrRedirect,
            `cd: ${target}: No such file or directory`
          );
        } else {
          process.chdir(target);
        }
        return recur();
      }

      case "echo": {
        let text = args.join(" ");
        if (
          (text.startsWith('"') && text.endsWith('"')) ||
          (text.startsWith("'") && text.endsWith("'"))
        ) {
          text = text.slice(1, -1);
        }
        writeOutput(console.log, stdoutRedirect, text);
        return recur();
      }

      case "type": {
        const target = args[0];
        if (builtins.has(target)) {
          writeOutput(
            console.log,
            stdoutRedirect,
            `${target} is a shell builtin`
          );
        } else {
          const dirs = process.env.PATH.split(":");
          let found = null;
          for (const d of dirs) {
            const fp = path.join(d, target);
            if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
              found = fp;
              break;
            }
          }
          if (found) {
            writeOutput(console.log, stdoutRedirect, `${target} is ${found}`);
          } else {
            writeOutput(console.error, stderrRedirect, `${target}: not found`);
          }
        }
        return recur();
      }

      default: {
        // External commands
        const dirs = process.env.PATH.split(":");
        let cmdPath = null;
        for (const d of dirs) {
          const fp = path.join(d, cmd);
          if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            try {
              fs.accessSync(fp, fs.constants.X_OK);
              cmdPath = fp;
              break;
            } catch {}
          }
        }
        if (!cmdPath) {
          writeOutput(
            console.error,
            stderrRedirect,
            `${cmd}: command not found`
          );
          return recur();
        }

        const stdio = [
          "inherit",
          stdoutRedirect ? "pipe" : "inherit",
          stderrRedirect ? "pipe" : "inherit",
        ];
        const child = spawn(cmdPath, args, {
          stdio,
          argv0: path.basename(cmdPath),
        });

        if (stdoutRedirect) {
          const outStream = fs.createWriteStream(stdoutRedirect.path, {
            flags: stdoutRedirect.flags,
          });
          child.stdout.pipe(outStream);
        }
        if (stderrRedirect) {
          const errStream = fs.createWriteStream(stderrRedirect.path, {
            flags: stderrRedirect.flags,
          });
          child.stderr.pipe(errStream);
        }

        child.on("close", recur);
      }
    }
  });
}

recur();

//
// code that did'nt work for redirecting
//
// const { exit } = require("process");
// const os = require("os");
// const readline = require("readline");
// const fs = require("fs");
// const path = require("path");
// const { execFile } = require("child_process");

// // Define built-in commands
// const builtins = new Set(["echo", "cd", "exit", "type", "pwd"]);
// let s1; // original input line
// let print_to_file_flag = false;
// let print_s_path;
// const rl = readline.createInterface({
//   input: process.stdin,
//   output: process.stdout,
// });

// // Uncomment this block to pass the first stage
// function recur() {
//   rl.question("$ ", async (answer) => {
//     // To handel echo and type function
//     // let command = answer.split(" ")[0];
//     // if (command == "echo" || "type") {
//     //   // s1 = answer
//     //   // answer = command
//     //   if (command != "exit") {
//     //     s1 = answer;
//     //     answer = command;
//     //   }
//     if (!answer.trim()) return recur();
//     //   print_to_file_flag = false;
//     //   // console.log(print_to_file_flag);
//     //   print_to_file_flag = await handel_print_flag();
//     // }
//     // capture full line for parsing redirection on echo, type, pwd
//     const cmd = answer.split(" ")[0];
//     s1 = answer;
//     print_to_file_flag = /(1?>)\s*\S+/.test(s1);
//     if (print_to_file_flag) {
//       const m = s1.match(/(1?>)\s*(\S+)/);
//       print_s_path = m[2];
//       // remove redirection from s1
//       s1 = s1.replace(m[0], "").trim();
//     switch (cmd) {
//       // case "exit 0": {
//       //   exit();
//       // }
//       // case "echo": {
//       //   handel_echo();
//       //   break;
//       // }
//       // case "type": {
//       //   handel_type();
//       //   break;
//       // }
//   case "exit":{
//     return exit(0);}
//       case "pwd": {
//         // console.log(process.cwd());
//         // break;
//         const cwd = process.cwd();
//         if (print_to_file_flag) fs.writeFileSync(print_s_path, cwd + "\n", "utf8");
//         else console.log(cwd);
//         return recur();
//       }
//       case "cd": {
//         // handel_cd();
//         // break;
//         let target = s1.split(" ")[1] || os.homedir();
//         if (target === "~") target = os.homedir();
//         if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
//           console.log(cd: ${target}: No such file or directory);
//         } else {
//           process.chdir(target);
//         }
//         return recur();
//       }
//       case "echo": {
//         const text = s1.split(/\s+/).slice(1).join(" ");
//         if (print_to_file_flag) fs.writeFileSync(print_s_path, text + "\n", "utf8");
//         else console.log(text);
//         return recur();
//       }
//       case "type": {
//         const targetCmd = s1.split(/\s+/)[1];
//         let out;
//         if (builtins.has(targetCmd)) out = ${targetCmd} is a shell builtin;
//         else {
//           const dirs = process.env.PATH.split(":");
//           let found = null;
//           for (const d of dirs) {
//             const full = path.join(d, targetCmd);
//             if (fs.existsSync(full) && fs.statSync(full).isFile()) {
//               found = full;
//               break;
//             }
//           }
//           out = found ? ${targetCmd} is ${found} : ${targetCmd}: not found;
//         }
//         if (print_to_file_flag) fs.writeFileSync(print_s_path, out + "\n", "utf8");
//         else console.log(out);
//         return recur();
//       }
// //       default: {
// //          // external command
// //          const args = s1.split(/\s+/).slice(1);
// //         const pathDirs = ["/tmp/foo", ...process.env.PATH.split(":")];
// //         // let found = false;
// //         // for (const dir of pathDirs) {
// //         //   const fullPath = path.join(dir, answer);
// //         //   if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
// //         //     try {
// //         //       fs.accessSync(fullPath, fs.constants.X_OK);
// //         //       handel_program_exe(sec_slice(), answer, fullPath);
// //         //       found = true;
// //         //       return; // Stop searching once executed
// //         //     } catch (err) {
// //         //       console.error(${answer}: Permission denied);
// //         //     }
// //         let cmdPath = null;
// //         for (const d of pathDirs) {
// //           const full = path.join(d, cmd);
// //           if (fs.existsSync(full) && fs.statSync(full).isFile()) {
// //             try { fs.accessSync(full, fs.constants.X_OK); cmdPath = full; break; } catch {}
// //           }
// //         }
// //         console.log(${answer}: command not found);
// //       }
// //     }
// //     recur();
// //     // rl.close();
// //   });
// // }
// // // to slice the cmd after the builtin cmd
// // function sec_slice() {
// //   if (!s1.includes(" ")) return "";
// //   return s1.substring(s1.indexOf(" ") + 1);
// // }

// // // echo function
// // function handel_echo() {
// //   s3 = sec_slice();
// //   // if (!print_to_file_flag) {
// //   //   console.log(s3);
// //   //   return;
// //   // } else {
// //   //   handel_program_exe();
// //   // }
// //   if (print_to_file_flag) {
// //     fs.writeFileSync(print_s_path, s3 + "\n", "utf8");
// //   } else {
// //     console.log(s3);
// //   }
// // }
// // // type function
// // function handel_type() {
// //   search_cmd = sec_slice();
// //   // if( search_cmd == "echo" || search_cmd == "exit" || search_cmd == "type"){
// //   //   console.log(${search_cmd} is a shell builtin)
// //   // }
// //   //  OR
// //   //  OR
// //   if (builtins.has(search_cmd)) {
// //     console.log(${search_cmd} is a shell builtin);
// //     return;
// //   } else {
// //     // Get PATH environment variable
// //     const pathDirs = process.env.PATH.split(":");
// //     // console.log(pathDirs)
// //     // Search in each directory listed in PATH
// //     for (const dir of pathDirs) {
// //       const fullPath = path.join(dir, search_cmd);
// //       if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
// //         console.log(${search_cmd} is ${fullPath});
// //         return;
// //       }
// //     }
// //     console.log(${search_cmd}: not found);
// //   }
// // }
// // function handel_program_exe(attribute, filename, filepath) {
// //   if (!print_to_file_flag) {
// //     const args = attribute.split(" ");
// //     // Extract only the command name from the full path
// //     const commandName = path.basename(filepath);
// //     execFile(filepath, args, (error, stdout, stderr) => {
// //       if (error) {
// //         console.error(Error executing ${commandName}:, error.message);
// //         return;
// //       }
// //       if (stderr) {
// //         console.error(Error Output:, stderr);
// //         return;
// //       }
// //       // Ensure the output matches expected format
// //       const fixedOutput = stdout
// //         .replace(new RegExp(filepath, "g"), commandName)
// //         .trim();
// //       console.log(fixedOutput);
// //       recur(); //  Print prompt again after execution
// //     });
// //     return;
// //   } else {
// //     const args = split_path_for_redirecting();
// //     // Extract only the command name from the full path
// //     const commandName = path.basename(filepath);
// //     execFile(filepath, args, (error, stdout, stderr) => {
// //       if (error) {
// //         console.error(Error executing ${commandName}:, error.message);
// //         return;
// //       }
// //       if (stderr) {
// //         console.error(stderr.trim());
// //       }
// //       const fixedOutput = stdout
// //         .replace(new RegExp(filepath, "g"), commandName)
// //         .trim();
// //       if (print_to_file_flag) {
// //         const redirectMatch = s1.match(/(1?>)\s*(\S+)/);
// //         const shouldRedirect = !!redirectMatch;
// //         const redirectFilePath = redirectMatch ? redirectMatch[2] : null;
// //         // try {
// //         //   fs.writeFileSync(redirectFilePath, fixedOutput + "\n", "utf8");
// //         // } catch (err) {
// //         //   console.error(Error writing to file: ${err.message});
// //         // }
// //         try {
// //           const mode = s1.includes(">>") ? "a" : "w";
// //           fs.writeFileSync(redirectFilePath, fixedOutput + "\n", {
// //             encoding: "utf8",
// //             flag: mode,
// //           });
// //         } catch (err) {
// //           console.error(Error writing to file: ${err.message});
// //         }
// //       } else {
// //         // console.log(fixedOutput);
// //       }
// //       recur();
// //     });
// //   }
// // }

// // function handel_cd() {
// //   search_path = sec_slice();
// //   // does_exist = handel_search_dir(search_path);
// //   if (search_path == "~") {
// //     search_path = os.homedir();
// //   }
// //   if (!fs.existsSync(search_path) || !fs.statSync(search_path).isDirectory()) {
// //     console.log(cd: ${search_path}: No such file or directory);
// //     return;
// //   }
// //   // if (does_exist == false) {
// //   //   console.log(cd: ${search_path} : No such file or directory);
// //   //   return;
// //   // }
// //   else {
// //     try {
// //       // Updating with the New directory
// //       process.chdir(search_path);
// //       // console.log("Updated working directory is: " + process.cwd());
// //     } catch (err) {
// //       // Printing error if any occurs
// //       console.error("error occured while " + "changing directory: " + err);
// //     }
// //   }
// //   return;
// // }
// // async function handel_print_flag() {
// //   // if (!s1.includes("1>") && !s1.includes(">")) {
// //   //   // console.log("inside handel_print_flag fun else part");
// //   //   return false;
// //   // }
// //   if (!/(1?>)\s*\S+/.test(s1)) {
// //     return false;
// //   } else {
// //     split_path_for_redirecting();
// //     return true;
// //   }
// //   // let command = answer.split(" ")[0];
// //   // if (command == "echo" || "type") {
// //   //   // s1 = answer
// //   //   // answer = command
// //   //   if (command != "exit") {
// //   //     s1 = answer;
// //   //     answer = command;
// //   //   }
// //   // function sec_slice() {
// //   //   if (!s1.includes(" ")) return "";
// //   //   return s1.substring(s1.indexOf(" ") + 1);
// //   // }
// // }
// // function split_path_for_redirecting() {
// //   // console.log("inside handel_print_flag fun else part");
// //   // print_flag_path = sec_slice();
// //   // // console.log(print_flag_path);
// //   // if (print_flag_path.includes("1>")) {
// //   //   print_f_path = print_flag_path.split("1>")[0];
// //   //   // console.log("1", print_f_path);
// //   // } else {
// //   //   print_f_path = print_flag_path.split(">")[0];
// //   //   // console.log("2", print_f_path);
// //   // }
// //   // print_s_path = print_flag_path
// //   //   .substring(print_flag_path.indexOf(">") + 1)
// //   //   .trim();
// //   const redirectMatch = s1.match(/(1?>)\s*(\S+)/);
// //   print_f_path = s1.split(redirectMatch[0])[0].trim();
// //   print_s_path = redirectMatch[2];
// //   // console.log(print_s_path);
// //   // print_s_path = print_flag_path.split();
// //   // console.log(print_s_path);
// //   return { print_f_path, print_s_path };
// // }
// // recur();
// default: {
//   // external command
//   const args = s1.split(/\s+/).slice(1);
//   const pathDirs = ["/tmp/foo", ...process.env.PATH.split(":")];
//   let cmdPath = null;
//   for (const d of pathDirs) {
//     const full = path.join(d, cmd);
//     if (fs.existsSync(full) && fs.statSync(full).isFile()) {
//       try { fs.accessSync(full, fs.constants.X_OK); cmdPath = full; break; } catch {}
//     }
//   }
//   if (!cmdPath) {
//     console.log(${cmd}: command not found);
//     return recur();
//   }
//   if (!print_to_file_flag) {
//     execFile(cmdPath, args, (err, stdout, stderr) => {
//       if (err) console.error(err.message);
//       if (stderr) console.error(stderr.trim());
//       if (stdout) process.stdout.write(stdout);
//       return recur();
//     });
//   } else {
//     execFile(cmdPath, args, (err, stdout, stderr) => {
//       if (stderr) console.error(stderr.trim());
//       if (stdout) fs.writeFileSync(print_s_path, stdout, "utf8");
//       return recur();
//     });
//   }
// }
// }
// }});
// }
// recur();
