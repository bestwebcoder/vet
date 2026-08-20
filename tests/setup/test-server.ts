import { spawn, type ChildProcess } from "node:child_process";

/**
 * Boots the application for route-level tests.
 *
 * Route protection cannot be proven by unit-testing the guard function: the
 * thing worth testing is whether the layout actually runs it. That needs the
 * app really serving.
 *
 * A production build rather than the dev server, for two reasons: it is the
 * behaviour that actually ships, and `next dev` rewrites tsconfig.json on
 * boot, which would leave the working tree dirty after every test run.
 */

export const TEST_PORT = 3100;
export const TEST_BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let server: ChildProcess | undefined;

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", env: process.env });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`)),
    );
    child.on("error", reject);
  });
}

export async function setup() {
  await run("npx", ["next", "build"]);

  server = spawn("npx", ["next", "start", "-p", String(TEST_PORT)], {
    stdio: "ignore",
    env: process.env,
    // Own process group, so teardown can take the whole tree down with it.
    detached: true,
  });

  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${TEST_BASE_URL}/login`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Test server did not become ready on ${TEST_BASE_URL}`);
}

export async function teardown() {
  if (!server?.pid) return;

  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}
