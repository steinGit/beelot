#!/usr/bin/env node
/** Compute backtest GTS with BeeLot's unmodified production implementation. */
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import process from "node:process";
import { calculateGTS } from "../assets/js/logic.js";

const requestedPath = process.argv[2];
const inputPath = existsSync(requestedPath) || requestedPath.endsWith(".gz")
  ? requestedPath : `${requestedPath}.gz`;
const raw = readFileSync(inputPath);
const input = JSON.parse((inputPath.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
const { time: dates, temperature_2m_mean: temperatures } = input.response.daily;
const years = {};
for (let index = 0; index < dates.length; index += 1) {
  const year = dates[index].slice(0, 4);
  years[year] ??= { dates: [], temperatures: [] };
  years[year].dates.push(dates[index]);
  years[year].temperatures.push(temperatures[index]);
}
const results = Object.fromEntries(Object.entries(years).map(([year, values]) => [
  year,
  calculateGTS(values.dates, values.temperatures).map((entry) => entry.gts)
]));
process.stdout.write(JSON.stringify(results));
