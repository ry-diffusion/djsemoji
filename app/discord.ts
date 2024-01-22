import { Client, GatewayIntentBits } from "discord.js";
import { EventEmitter } from "events";
import { Duplex } from "stream";
import config from "./config";

import assert = require("assert");

function bufferToStream(arrayBuffer: ArrayBuffer) {
	const stream = new Duplex();
	stream.push(Buffer.from(arrayBuffer));
	stream.push(null);
	return stream;
}

export async function startDiscordAgent(events: EventEmitter) {
	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
		],
	});

	client.on("messageCreate", async (message) => {
		let url = message.content;

		for (let i = 0; i < 512; ++i) {
			url = url.replace(`size=${i}&`, "size=512&");
		}

		if (message.content.startsWith("https")) {
			events.emit("wa.sendSticker", {
				url,
				isAnimated: message.content.includes(".gif"),
			});
		}
	});

	client.login(config.token);
}
