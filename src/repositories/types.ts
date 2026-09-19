import type {
	AppEvent,
	Epic,
	Project,
	Task,
	TaskDependency,
	TaskStatus,
} from "../domain/types.ts";

export type { AppEvent, Epic, Project, Task, TaskDependency, TaskStatus };

export interface ProjectRepository {
	create(project: Project): Project;
	findById(id: string): Project | null;
	findAll(): Project[];
	findByName(name: string): Project | null;
}

export interface EpicRepository {
	create(epic: Epic): Epic;
	findById(id: string): Epic | null;
	findByProject(projectId: string): Epic[];
	touch(id: string, updatedAt: string): void;
}

export interface TaskRepository {
	create(task: Task): Task;
	findById(id: string): Task | null;
	/** `undefined` epicId means no epic filter (query across all epics). */
	findByEpic(
		epicId: string | undefined,
		opts?: { status?: TaskStatus; agent?: string; unassigned?: boolean },
	): Task[];
	updateStatus(id: string, status: TaskStatus, updatedAt: string): void;
	updateStatusAndAssignee(
		id: string,
		status: TaskStatus,
		assignedAgent: string | null,
		updatedAt: string,
	): void;
	/** Send a task to `in_review`, recording a reviewer but keeping the assignee. */
	submitForReview(id: string, reviewer: string | null, updatedAt: string): void;
	/** Return a rejected task to `in_progress`, keeping its assignee. */
	takeBackFromReview(id: string, updatedAt: string): void;
	updateDetails(
		id: string,
		changes: { name?: string; description?: string | null },
		updatedAt: string,
	): void;
	/**
	 * Atomically claim an unstarted, unblocked task in a single statement:
	 * status must be `todo` AND every dependency must be `done`.
	 * Returns true if the claim succeeded.
	 */
	claimIfAvailable(id: string, agent: string, updatedAt: string): boolean;
	/** Best candidate for `task next`: todo, not assigned to another agent, oldest first. */
	next(epicId: string, agent?: string): Task | null;
}

export interface DependencyRepository {
	add(taskId: string, dependsOnTaskId: string): void;
	remove(taskId: string, dependsOnTaskId: string): void;
	exists(taskId: string, dependsOnTaskId: string): boolean;
	/** The task ids that `taskId` depends on. */
	dependencyIds(taskId: string): string[];
	/** The task ids that depend on `taskId`. */
	dependentIds(taskId: string): string[];
	/** All edges in an epic, indexed by dependent task id → its dependency ids. */
	edgesForEpic(epicId: string): Map<string, string[]>;
}

export interface EventRepository {
	create(event: AppEvent): AppEvent;
	/** Events for an epic and the tasks within it. */
	listByEpic(
		epicId: string,
		opts?: { entityId?: string; limit?: number },
	): AppEvent[];
	/** The event history of a single entity, oldest first. */
	listByEntity(entityId: string, opts?: { limit?: number }): AppEvent[];
}

export interface TaskDependencyInfo {
	edge: TaskDependency;
	status: TaskStatus;
}
