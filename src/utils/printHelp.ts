import chalk from "chalk";
import { normalizeStrLen } from "./normalizeStrLen";

interface IHelpItem {
  command: string;
  description: string;
}

const helpItems: IHelpItem[] = [
  {
    command: "/channel ls",
    description: "List channels on the server.",
  },
  // {
  //   command: '/channel new <channel_name> --arg',
  //   description:
  //     'Creates a new channel. Use ' +
  //     chalk.bold('--private') +
  //     ' for a private channel.',
  // },
  {
    command: "/close",
    description: "Close the server connection.",
  },
  {
    command: "/connect <hostname>",
    description: "Connect to a server.",
  },
  {
    command: "/exit",
    description: "Exit the client.",
  },
  {
    command: "/help",
    description: "Show this menu.",
  },
  {
    command: "/join <identifier>",
    description: "Join the channel <identifier>",
  },
  {
    command: "/nick <nickname>",
    description: "Change your nickname",
  },
];

export function printHelpItem(item: IHelpItem) {
  console.log(normalizeStrLen(chalk.bold(item.command), 40), item.description);
}

export function printHelp() {
  for (const item of helpItems) {
    printHelpItem(item);
  }
  console.log();
}
