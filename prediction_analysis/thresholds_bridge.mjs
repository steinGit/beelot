#!/usr/bin/env node
/** Export active flowering-start thresholds from the unchanged BeeLot dataset. */
import process from "node:process";
import { defaultTrachtData } from "../assets/js/tracht_data.js";

process.stdout.write(JSON.stringify(defaultTrachtData
  .filter(row => row.active && !row.plant.startsWith("Empfehlung:"))
  .map(row => ({ plant: row.plant, threshold: row.TS_start }))));
