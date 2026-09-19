#!/usr/bin/env bun
import { defaultDbPath } from "../dbpath.ts";
import { startTui } from "./run.ts";

const dbPath = process.env.TEMPO_DB ?? process.argv[2] ?? defaultDbPath();

process.exitCode = startTui(dbPath);
