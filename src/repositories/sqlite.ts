import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import type {
	AppEvent,
	DependencyRepository,
	Epic,
	EpicRepository,
	EventRepository,
	Project,
	ProjectRepository,
	Task,
	TaskRepository,
	TaskStatus,
} from "./types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS epics (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  epic_id        TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL CHECK (status IN ('todo','blocked','in_progress','in_review','done','cancelled')),
  assigned_agent TEXT,
  reviewer       TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks(epic_id);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id            TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON task_dependencies(depends_on_task_id);

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project','epic','task')),
  entity_id   TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  payload     TEXT NOT NULL,
  actor       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_id, created_at);
`;

export interface DatabaseOptions {
	/** Open in read-only mode (no migrations, no writes). */
	readonly?: boolean;
}

export function openDb(path: string, opts: DatabaseOptions = {}): Database {
	const options = opts.readonly ? { readonly: true } : undefined;
	if (!opts.readonly && path !== ":memory:") {
		mkdirSync(dirname(path), { recursive: true });
	}
	const db = new Database(path, options);
	if (!opts.readonly) {
		db.exec("PRAGMA journal_mode = WAL;");
		db.exec("PRAGMA foreign_keys = ON;");
		db.exec(SCHEMA);
		try {
			db.exec("ALTER TABLE tasks ADD COLUMN reviewer TEXT");
		} catch (err) {
			if (
				!(err instanceof Error) ||
				!err.message.includes("duplicate column name: reviewer")
			) {
				throw err;
			}
		}
	}
	return db;
}

function rowToProject(row: unknown): Project {
	const r = row as Record<string, unknown>;
	return {
		id: r.id as string,
		name: r.name as string,
		description: (r.description as string | null) ?? null,
		created_at: r.created_at as string,
	};
}

function rowToEpic(row: unknown): Epic {
	const r = row as Record<string, unknown>;
	return {
		id: r.id as string,
		project_id: r.project_id as string,
		name: r.name as string,
		description: (r.description as string | null) ?? null,
		created_at: r.created_at as string,
		updated_at: r.updated_at as string,
	};
}

function rowToTask(row: unknown): Task {
	const r = row as Record<string, unknown>;
	return {
		id: r.id as string,
		epic_id: r.epic_id as string,
		name: r.name as string,
		description: (r.description as string | null) ?? null,
		status: r.status as TaskStatus,
		assigned_agent: (r.assigned_agent as string | null) ?? null,
		reviewer: (r.reviewer as string | null) ?? null,
		created_at: r.created_at as string,
		updated_at: r.updated_at as string,
	};
}

function rowToEvent(row: unknown): AppEvent {
	const r = row as Record<string, unknown>;
	let payload: Record<string, unknown> = {};
	try {
		const parsed = JSON.parse(r.payload as string);
		if (parsed && typeof parsed === "object") payload = parsed;
	} catch {
		payload = {};
	}
	return {
		id: r.id as string,
		entity_type: r.entity_type as AppEvent["entity_type"],
		entity_id: r.entity_id as string,
		event_type: r.event_type as string,
		payload,
		actor: r.actor as string,
		created_at: r.created_at as string,
	};
}

export class SqliteProjectRepository implements ProjectRepository {
	constructor(private readonly db: Database) {}

	create(project: Project): Project {
		this.db
			.query(
				"INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)",
			)
			.run(project.id, project.name, project.description, project.created_at);
		return project;
	}

	findById(id: string): Project | null {
		const row = this.db.query("SELECT * FROM projects WHERE id = ?").get(id);
		return row ? rowToProject(row) : null;
	}

	findAll(): Project[] {
		const rows = this.db
			.query("SELECT * FROM projects ORDER BY created_at, rowid")
			.all();
		return rows.map(rowToProject);
	}

	findByName(name: string): Project | null {
		const row = this.db
			.query("SELECT * FROM projects WHERE name = ?")
			.get(name);
		return row ? rowToProject(row) : null;
	}
}

export class SqliteEpicRepository implements EpicRepository {
	constructor(private readonly db: Database) {}

	create(epic: Epic): Epic {
		this.db
			.query(
				"INSERT INTO epics (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				epic.id,
				epic.project_id,
				epic.name,
				epic.description,
				epic.created_at,
				epic.updated_at,
			);
		return epic;
	}

	findById(id: string): Epic | null {
		const row = this.db.query("SELECT * FROM epics WHERE id = ?").get(id);
		return row ? rowToEpic(row) : null;
	}

	findByProject(projectId: string): Epic[] {
		const rows = this.db
			.query(
				"SELECT * FROM epics WHERE project_id = ? ORDER BY created_at, rowid",
			)
			.all(projectId);
		return rows.map(rowToEpic);
	}

	touch(id: string, updatedAt: string): void {
		this.db
			.query("UPDATE epics SET updated_at = ? WHERE id = ?")
			.run(updatedAt, id);
	}
}

export class SqliteTaskRepository implements TaskRepository {
	constructor(private readonly db: Database) {}

	create(task: Task): Task {
		this.db
			.query(
				"INSERT INTO tasks (id, epic_id, name, description, status, assigned_agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				task.id,
				task.epic_id,
				task.name,
				task.description,
				task.status,
				task.assigned_agent,
				task.created_at,
				task.updated_at,
			);
		return task;
	}

	findById(id: string): Task | null {
		const row = this.db.query("SELECT * FROM tasks WHERE id = ?").get(id);
		return row ? rowToTask(row) : null;
	}

	findByEpic(
		epicId: string | undefined,
		opts: { status?: TaskStatus; agent?: string; unassigned?: boolean } = {},
	): Task[] {
		const clauses: string[] = [];
		const params: Array<string | number> = [];
		if (epicId !== undefined) {
			clauses.push("epic_id = ?");
			params.push(epicId);
		}
		if (opts.status) {
			clauses.push("status = ?");
			params.push(opts.status);
		}
		if (opts.agent) {
			clauses.push("assigned_agent = ?");
			params.push(opts.agent);
		}
		if (opts.unassigned) {
			clauses.push("assigned_agent IS NULL");
		}
		const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.query(`SELECT * FROM tasks${where} ORDER BY created_at, rowid`)
			.all(...params);
		return rows.map(rowToTask);
	}

	updateStatus(id: string, status: TaskStatus, updatedAt: string): void {
		this.db
			.query("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?")
			.run(status, updatedAt, id);
	}

	updateStatusAndAssignee(
		id: string,
		status: TaskStatus,
		assignedAgent: string | null,
		updatedAt: string,
	): void {
		this.db
			.query(
				"UPDATE tasks SET status = ?, assigned_agent = ?, reviewer = NULL, updated_at = ? WHERE id = ?",
			)
			.run(status, assignedAgent, updatedAt, id);
	}

	submitForReview(
		id: string,
		reviewer: string | null,
		updatedAt: string,
	): void {
		this.db
			.query(
				"UPDATE tasks SET status = 'in_review', reviewer = ?, updated_at = ? WHERE id = ?",
			)
			.run(reviewer, updatedAt, id);
	}

	takeBackFromReview(id: string, updatedAt: string): void {
		this.db
			.query(
				"UPDATE tasks SET status = 'in_progress', reviewer = NULL, updated_at = ? WHERE id = ?",
			)
			.run(updatedAt, id);
	}

	updateDetails(
		id: string,
		changes: { name?: string; description?: string | null },
		updatedAt: string,
	): void {
		const clauses: string[] = [];
		const params: Array<string | null> = [];
		if (changes.name !== undefined) {
			clauses.push("name = ?");
			params.push(changes.name);
		}
		if (changes.description !== undefined) {
			clauses.push("description = ?");
			params.push(changes.description);
		}
		clauses.push("updated_at = ?");
		params.push(updatedAt, id);
		this.db
			.query(`UPDATE tasks SET ${clauses.join(", ")} WHERE id = ?`)
			.run(...params);
	}

	claimIfAvailable(id: string, agent: string, updatedAt: string): boolean {
		const result = this.db
			.query(
				`UPDATE tasks
         SET status = 'in_progress', assigned_agent = ?, updated_at = ?
         WHERE id = ?
           AND status = 'todo'
           AND NOT EXISTS (
             SELECT 1 FROM task_dependencies td
             WHERE td.task_id = tasks.id
               AND EXISTS (
                 SELECT 1 FROM tasks dep
                 WHERE dep.id = td.depends_on_task_id AND dep.status <> 'done'
               )
           )`,
			)
			.run(agent, updatedAt, id);
		return result.changes > 0;
	}

	next(epicId: string, agent?: string): Task | null {
		const base = "SELECT * FROM tasks WHERE epic_id = ? AND status = 'todo'";
		const assignedClause =
			agent === undefined
				? " AND assigned_agent IS NULL"
				: " AND (assigned_agent IS NULL OR assigned_agent = ?)";
		const sql = `${base}${assignedClause} ORDER BY created_at ASC, rowid ASC LIMIT 1`;
		const row =
			agent === undefined
				? this.db.query(sql).get(epicId)
				: this.db.query(sql).get(epicId, agent);
		return row ? rowToTask(row) : null;
	}
}

export class SqliteDependencyRepository implements DependencyRepository {
	constructor(private readonly db: Database) {}

	add(taskId: string, dependsOnTaskId: string): void {
		this.db
			.query(
				"INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)",
			)
			.run(taskId, dependsOnTaskId);
	}

	remove(taskId: string, dependsOnTaskId: string): void {
		this.db
			.query(
				"DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?",
			)
			.run(taskId, dependsOnTaskId);
	}

	exists(taskId: string, dependsOnTaskId: string): boolean {
		const row = this.db
			.query(
				"SELECT 1 FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?",
			)
			.get(taskId, dependsOnTaskId);
		return row !== null;
	}

	dependencyIds(taskId: string): string[] {
		const rows = this.db
			.query(
				"SELECT depends_on_task_id AS id FROM task_dependencies WHERE task_id = ?",
			)
			.all(taskId);
		return rows.map((r) => (r as { id: string }).id);
	}

	dependentIds(taskId: string): string[] {
		const rows = this.db
			.query(
				"SELECT task_id AS id FROM task_dependencies WHERE depends_on_task_id = ?",
			)
			.all(taskId);
		return rows.map((r) => (r as { id: string }).id);
	}

	edgesForEpic(epicId: string): Map<string, string[]> {
		const rows = this.db
			.query(
				`SELECT d.task_id AS dependent, d.depends_on_task_id AS dependency
         FROM task_dependencies d
         JOIN tasks t ON t.id = d.task_id
         WHERE t.epic_id = ?`,
			)
			.all(epicId) as Array<{ dependent: string; dependency: string }>;
		const map = new Map<string, string[]>();
		for (const row of rows) {
			const list = map.get(row.dependent) ?? [];
			list.push(row.dependency);
			map.set(row.dependent, list);
		}
		return map;
	}
}

export class SqliteEventRepository implements EventRepository {
	constructor(private readonly db: Database) {}

	create(event: AppEvent): AppEvent {
		this.db
			.query(
				"INSERT INTO events (id, entity_type, entity_id, event_type, payload, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				event.id,
				event.entity_type,
				event.entity_id,
				event.event_type,
				JSON.stringify(event.payload),
				event.actor,
				event.created_at,
			);
		return event;
	}

	listByEpic(
		epicId: string,
		opts: { entityId?: string; limit?: number } = {},
	): AppEvent[] {
		let condition =
			"((e.entity_type = 'epic' AND e.entity_id = ?) OR (e.entity_type = 'task' AND e.entity_id IN (SELECT id FROM tasks WHERE epic_id = ?)))";
		const params: Array<string | number> = [epicId, epicId];
		if (opts.entityId) {
			condition += " AND e.entity_id = ?";
			params.push(opts.entityId);
		}
		let sql = `SELECT * FROM events e WHERE ${condition} ORDER BY rowid DESC`;
		if (opts.limit) {
			sql += " LIMIT ?";
			params.push(opts.limit);
		}
		const rows = this.db.query(sql).all(...params);
		return rows.map(rowToEvent);
	}

	listByEntity(entityId: string, opts: { limit?: number } = {}): AppEvent[] {
		let sql = "SELECT * FROM events WHERE entity_id = ? ORDER BY rowid ASC";
		if (opts.limit) sql += " LIMIT ?";
		const rows = opts.limit
			? this.db.query(sql).all(entityId, opts.limit)
			: this.db.query(sql).all(entityId);
		return rows.map(rowToEvent);
	}
}

export function makeTransaction(db: Database): <T>(fn: () => T) => T {
	let depth = 0;
	return <T>(fn: () => T): T => {
		if (depth === 0) db.exec("BEGIN");
		depth++;
		try {
			const result = fn();
			depth--;
			if (depth === 0) db.exec("COMMIT");
			return result;
		} catch (err) {
			depth--;
			if (depth === 0) db.exec("ROLLBACK");
			throw err;
		}
	};
}
