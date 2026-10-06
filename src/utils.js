const core = require("@actions/core");
const fs = require("fs");

const OUTPUT_DIR = "./test-outputs";

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const paint = (message, color) => `${COLORS[color]}${message}${COLORS.reset}`;

function displaySummary(passed, failed) {
  core.info(
    paint(`\nTotal tests ${passed + failed}, ${passed} passed and ${failed} failed\n`, "yellow"),
  );
}

function displayFailures(failedTests) {
  if (failedTests.length === 0) return;
  core.info(paint("\nFailed Tests:\n", "yellow"));
  for (const test of failedTests) {
    core.info(paint(`   ID: ${test.id}`, "red"));
    core.info(paint(`   Name: ${test.name}`, "red"));
    core.info(paint(`   Error: ${JSON.stringify(test.result)}\n`, "red"));
    core.info(`\n${"=".repeat(40)}\n`);
  }
}

function logOutcome(result) {
  displaySummary(result.successTestResults.length, result.failedTestResults.length);
  displayFailures(result.failedTestResults);
}

function mapByName(entries) {
  return entries.reduce((acc, entry) => {
    acc[entry.name] = entry.id;
    return acc;
  }, {});
}

function readMetaFile(configPath) {
  core.info(`Reading meta config from: ${configPath}`);
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const transformations = config.transformations ? [...config.transformations] : [];
  const libraries = config.libraries ? [...config.libraries] : [];
  return { transformations, libraries };
}

function ensureDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
}

function writeFile(filename, content) {
  const filepath = `${OUTPUT_DIR}/${filename}`;
  fs.writeFileSync(filepath, JSON.stringify(content, null, 2));
  return filepath;
}

module.exports = { OUTPUT_DIR, paint, logOutcome, mapByName, readMetaFile, ensureDir, writeFile };
