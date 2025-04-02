import {
  exec as nodeExec,
  execFile as nodeExecFile,
  ExecFileOptions,
  ExecOptions,
} from 'node:child_process';

type ChildProcessOutput = {
  stdout: string | Buffer;
  stderr: string | Buffer;
};

export function exec(
  command: string,
  options?: ExecOptions,
): Promise<ChildProcessOutput> {
  return new Promise((resolve, reject) => {
    nodeExec(command, options, (err, stdout, stderr) => {
      if (err) {
        reject({ ...err, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export function execFile(
  command: string,
  args?: string[],
  options?: ExecFileOptions,
): Promise<ChildProcessOutput> {
  return new Promise((resolve, reject) => {
    nodeExecFile(command, args, options, (err, stdout, stderr) => {
      if (err) {
        reject({ ...err, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
