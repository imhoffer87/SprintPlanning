import { spawn } from "child_process";

const server = spawn("npm", ["start"], {
  cwd: "./server",
  stdio: "inherit",
});

const web = spawn("npm", ["run", "dev"], {
  cwd: "./web",
  stdio: "inherit",
});

process.on("SIGINT", () => {
  server.kill();
  web.kill();
  process.exit(0);
});
