import { listEvents } from "../../commands/events.ts";
import { optInt, optStr } from "../args.ts";
import { eventList } from "../output.ts";
import type { CommandLeaf } from "../types.ts";

const eventListLeaf: CommandLeaf = {
	path: "event list",
	spec: { epic: "value", entity: "value", limit: "value" },
	usage: "event list --epic <epicId> [--entity <entityId>] [--limit <n>]",
	summary: "List audit events for an epic",
	run: (ctx, parsed) =>
		listEvents(ctx, {
			epic: optStr(parsed, "epic") ?? "",
			entity: optStr(parsed, "entity"),
			limit: optInt(parsed, "limit"),
		}),
	human: (data) => eventList(data as ReturnType<typeof listEvents>),
};

export const leaves: CommandLeaf[] = [eventListLeaf];
