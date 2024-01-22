import { Boom } from "@hapi/boom";
import makeWASocket, {
	DisconnectReason,
	WAMessageContent,
	WAMessageKey,
	makeInMemoryStore,
	proto,
	useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { exec } from "child_process";
import * as EventEmitter from "events";
import { readFile, rm, writeFile } from "fs/promises";
import { Readable } from "stream";

const store = makeInMemoryStore({});
store?.readFromFile("./.WAStore.json");
setInterval(() => {
	store?.writeToFile("./.WAStore.json");
}, 10_000);

function getRandomInt(max: number): number {
	return Math.floor(Math.random() * max);
}

function execute(cmd: string) {
	return new Promise((resolve, reject) =>
		exec(cmd, (error, stdout, stderr) => {
			if (error) reject(error);

			resolve([]);
		}),
	);
}

export async function startWAAgent(events: EventEmitter) {
	const { state, saveCreds } = await useMultiFileAuthState(".WAAuthData");
	let jid = "";

	const conn = makeWASocket({
		auth: state,
		printQRInTerminal: true,
		getMessage,
	});

	conn.ev.on("creds.update", saveCreds);
	conn.ev.on("connection.update", (update) => {
		const { connection, lastDisconnect } = update;

		if (!lastDisconnect) return;

		if (connection === "close") {
			const shouldReconnect =
				(lastDisconnect.error as Boom)?.output?.statusCode !==
				DisconnectReason.loggedOut;
			console.log(
				"connection closed due to ",
				lastDisconnect.error,
				", reconnecting ",
				shouldReconnect,
			);

			if (shouldReconnect) startWAAgent(events);
		} else if (connection === "open") {
			console.log("opened connection");
		}
	});

	store?.bind(conn.ev);

	conn.ev.on("messages.upsert", async (upsert) => {
		if (upsert.type === "notify") {
			for (const msg of upsert.messages) {
				if (msg.key.fromMe) {
					await conn.readMessages([msg.key]);
					const theMessage = await getMessage(msg.key);
					const message = theMessage?.conversation;

					if (!message || !msg.key.remoteJid) return;

					if (message.includes(":setMessageJid")) {
						jid = msg.key.remoteJid;
						conn.sendMessage(jid, { text: "Setado!" });
					}
				}
			}
		}
	});

	events.on("wa.sendSticker", async ({ url, isAnimated }) => {
		if (!jid.length) {
			return;
		}

		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		let sticker: any = undefined;

		const sourceId = getRandomInt(9999999).toString();
		const id = getRandomInt(9999999).toString();

		console.log(url);

		if (isAnimated) {
			const response = await fetch(url);
			const buffer = await response.arrayBuffer();

			await writeFile(`/tmp/${sourceId}.gif`, Buffer.from(buffer));
			await execute(`ffmpeg -i /tmp/${sourceId}.gif /tmp/${id}.webp`);

			sticker = {
				stream: Readable.from(await readFile(`/tmp/${id}.webp`)),
			};
		} else {
			sticker = {
				url,
			};
		}

		conn.sendMessage(jid, {
			sticker,
			isAnimated,
		});

		if (isAnimated) {
			await rm(`/tmp/${id}.webp`);
			await rm(`/tmp/${sourceId}.gif`);
		}
	});
}

async function getMessage(
	key: WAMessageKey,
): Promise<WAMessageContent | undefined> {
	if (store) {
		if (!key.remoteJid || !key.id) return;
		const msg = await store.loadMessage(key.remoteJid, key.id);
		return msg?.message || undefined;
	}

	// only if store is present
	return proto.Message.fromObject({});
}
