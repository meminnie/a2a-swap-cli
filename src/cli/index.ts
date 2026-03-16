#!/usr/bin/env node
import { Command } from "commander"
import { registerProposeCommand } from "./commands/propose"
import { registerAcceptCommand } from "./commands/accept"
import { registerCancelCommand } from "./commands/cancel"
import { registerListCommand } from "./commands/list"
import { registerHistoryCommand } from "./commands/history"
import { registerTrustCommand } from "./commands/trust"
import { registerWatchCommand } from "./commands/watch"
import { registerRfqCommand } from "./commands/rfq"
import { registerQuoteCommand } from "./commands/quote"
import { registerQuotesCommand } from "./commands/quotes"
import { registerPickCommand } from "./commands/pick"

const program = new Command()

program
  .name("zero-otc")
  .description("AI agent-to-agent OTC swap CLI — P2P trades with reputation gating")
  .version("2.0.0")

// Swap flow
registerProposeCommand(program)
registerAcceptCommand(program)
registerCancelCommand(program)

// Discovery
registerListCommand(program)
registerHistoryCommand(program)
registerWatchCommand(program)

// RFQ flow
registerRfqCommand(program)
registerQuoteCommand(program)
registerQuotesCommand(program)
registerPickCommand(program)

// Reputation
registerTrustCommand(program)

program.parse()
