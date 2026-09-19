# tempo setup

Tempo is a task tracker for agents. Use one project per repo.
Track work through one epic at a time.

## Check installation

Run this command.

```sh
tempo --help
```

If tempo does not run:

```sh
bun install
bun link
```

Run without link:

```sh
bun run tempo -- <args>
```

## Database

Tempo uses one database for the machine.

Default location:

- Linux: `~/.local/share/tempo/tempo.db`
- macOS: `~/Library/Application Support/tempo/tempo.db`
- Windows: `%APPDATA%\tempo\tempo.db`

Tempo creates the database automatically on first write.

Override the location:

```sh
tempo <command> --db <path>
```

or set the environment variable `TEMPO_DB`.

Use the default database. Use one project per repo.

## Setup order

1. Create the project.
   ```sh
   tempo project create --name <repoName> [--description <text>]
   ```
   Read the projectId from the output.
2. Create the epic.
   ```sh
   tempo epic create --project <projectId> --name <epicName> [--description <text>]
   ```
   Read the epicId from the output.
3. Add tasks. One task at a time, or a batch.
   ```sh
   tempo task create --epic <epicId> --name <taskName> [--description <text>]
   tempo task create batch --epic <epicId> --file <jsonFile>
   ```
4. Verify the setup.
   ```sh
   tempo epic show <epicId>
   tempo task list --epic <epicId>
   ```

Save the projectId and the epicId. Use them for all later commands.

## Batch format

`--file -` reads JSON from the standard input.
Use a plain array, or an object with the `tasks` key.

Task entry:

- `ref`: sibling id, optional
- `name`: required
- `description`: optional
- `dependsOn`: list of refs or task ids

Example:

```json
{
  "tasks": [
    { "ref": "spec", "name": "Write the spec" },
    { "name": "Ship the build", "dependsOn": ["spec"] }
  ]
}
```

## Rules

- A dependency connects tasks in one epic only.
- A dependency cannot create a cycle. Tempo rejects a cycle with `CYCLIC_DEPENDENCY`.
- Keep tasks small. One task = one vertical slice. See tempo-workflow.
- Preferred method: test-driven (red-green), vertical design. See tempo-workflow.