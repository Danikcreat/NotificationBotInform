import logger from "../logger.js";
import { sendBroadcast } from "../broadcast.js";

function parseArgs(argv) {
  const args = { message: null, logins: [], help: false, parseMode: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--message" || arg === "-m") {
      const parts = [];
      let cursor = i + 1;
      while (cursor < argv.length) {
        const value = argv[cursor];
        if (typeof value === "string" && value.startsWith("--")) {
          break;
        }
        parts.push(value);
        cursor += 1;
      }
      args.message = parts.length ? parts.join(" ") : null;
      i = cursor - 1;
    } else if (arg === "--login" || arg === "-l") {
      const login = argv[i + 1];
      if (login) {
        args.logins.push(login);
        i += 1;
      }
    } else if (arg === "--format" || arg === "--parse-mode") {
      const value = argv[i + 1];
      if (value) {
        args.parseMode = value;
        i += 1;
      }
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printUsage() {
  console.log(
    "Usage: npm run notify -- --message \"text\" [--login user1 --login user2] [--format html|markdown|markdownV2]"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }
  if (!args.message) {
    printUsage();
    process.exit(1);
  }

  const result = await sendBroadcast({ message: args.message, logins: args.logins, parseMode: args.parseMode });
  if (!result.total) {
    logger.warn("Broadcast completed with zero recipients.");
  }
}

main().catch((error) => {
  logger.error({ err: error }, "Broadcast failed");
  process.exit(1);
});
