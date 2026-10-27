import { parentPort, workerData } from 'node:worker_threads';
import { detectHardware } from './hardware.js';
parentPort.postMessage(detectHardware(workerData.resources, [], true, workerData.runtimeRoot));
