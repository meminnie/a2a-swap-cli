#!/usr/bin/env node
import { Command } from "commander"
import { registerProposeCommand } from "./commands/propose"
import { registerAcceptCommand } from "./commands/accept"
import { registerListCommand } from "./commands/list"
import { registerHistoryCommand } from "./commands/history"
import { registerTrustCommand } from "./commands/trust"

const program = new Command()

program
  .name("zero-otc")
  .description("AI agent-to-agent OTC swap CLI — P2P trades with ERC-8004 trust gating")
  .version("0.1.0")

registerProposeCommand(program)
registerAcceptCommand(program)
registerListCommand(program)
registerHistoryCommand(program)
registerTrustCommand(program)

program.parse()
