import { EventEmitter } from "events";
import { startDiscordAgent } from "./discord";
import { startWAAgent } from "./wa";

const events = new EventEmitter();

startDiscordAgent(events);
startWAAgent(events);
