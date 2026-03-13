#!/usr/bin/env node
import { Command } from "commander"
import { registerProposeCommand } from "./commands/propose"
import { registerAcceptCommand } from "./commands/accept"
import { registerDepositCommand } from "./commands/deposit"
import { registerListCommand } from "./commands/list"
import { registerHistoryCommand } from "./commands/history"
import { registerTrustCommand } from "./commands/trust"
import { registerWatchCommand } from "./commands/watch"

const program = new Command()

program
  .name("zero-otc")
  .description("AI agent-to-agent OTC swap CLI — P2P trades with ERC-8004 trust gating")
  .version("0.1.0")

registerProposeCommand(program)
registerAcceptCommand(program)
registerDepositCommand(program)
registerListCommand(program)
registerHistoryCommand(program)
registerTrustCommand(program)
registerWatchCommand(program)

program.parse()
