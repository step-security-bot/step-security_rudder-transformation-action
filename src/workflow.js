const core = require("@actions/core");
const fs = require("fs");
const { DefaultArtifactClient } = require("@actions/artifact");
const { detailedDiff } = require("deep-object-diff");
const isEqual = require("lodash/isEqual");
const _ = require("lodash");
const {
  getAllTransformations,
  getAllLibraries,
  createTransformation,
  createLibrary,
  updateTransformation,
  updateLibrary,
  testTransformationAndLibrary,
  publish,
} = require("./api");
const { logOutcome, mapByName, readMetaFile, ensureDir, writeFile } = require("./utils");

const metaFilePath = core.getInput("metaPath");
const uploadArtifacts = core.getInput("uploadTestArtifact")?.toLowerCase() === "true";
const testOnly = process.env.TEST_ONLY !== "false";
const commitId = process.env.GITHUB_SHA || "";
const artifactClient = new DefaultArtifactClient();

// ── Sync ──────────────────────────────────────────────────────────────────────

async function loadRemoteState() {
  const trResult = await getAllTransformations();
  const libResult = await getAllLibraries();

  const remoteTransformations = trResult.data
    ? JSON.parse(JSON.stringify(trResult.data.transformations))
    : [];

  const remoteLibraries = libResult.data
    ? JSON.parse(JSON.stringify(libResult.data.libraries))
    : [];

  return { remoteTransformations, remoteLibraries };
}

async function applyLibraries(libraries, knownLibraries) {
  core.info("Syncing libraries to workspace");
  const draftLibraries = {};

  for (const library of libraries) {
    const { name, description, language, file } = library;
    const code = fs.readFileSync(file, "utf-8");
    const storedId = knownLibraries[name];
    let apiResult;
    if (storedId) {
      core.info(`Updating existing library: ${name}`);
      apiResult = await updateLibrary(storedId, description, code, language);
    } else {
      core.info(`Creating new library: ${name}`);
      apiResult = await createLibrary(name, description, code, language);
    }
    draftLibraries[apiResult.data.versionId] = { ...library, id: apiResult.data.id };
  }

  return draftLibraries;
}

async function applyTransformations(transformations, knownTransformations) {
  core.info("Syncing transformations to workspace");
  const draftTransformations = {};

  for (const transformation of transformations) {
    const { name, description, language, file } = transformation;
    const code = fs.readFileSync(file, "utf-8");
    const storedId = knownTransformations[name];
    const apiResult = storedId
      ? await updateTransformation(storedId, name, description, code, language)
      : await createTransformation(name, description, code, language);
    draftTransformations[apiResult.data.versionId] = { ...transformation, id: apiResult.data.id };
  }

  return draftTransformations;
}

async function buildPayloads(draftTransformations, draftLibraries) {
  core.info("Assembling test payload");

  const trPayloads = [];
  const libPayloads = [];

  for (const [versionKey, trMeta] of Object.entries(draftTransformations)) {
    const inputPath = trMeta["test-input-file"] || "";
    const inputEvents = inputPath ? JSON.parse(fs.readFileSync(inputPath)) : "";
    if (inputEvents) {
      trPayloads.push({ versionId: versionKey, testInput: inputEvents });
    } else {
      core.info(`No test input for ${trMeta.name}, using default payload`);
      trPayloads.push({ versionId: versionKey });
    }
  }

  for (const versionKey of Object.keys(draftLibraries)) {
    libPayloads.push({ versionId: versionKey });
  }

  core.info(
    `Final transformation versions to be tested:
    ${JSON.stringify(trPayloads)}`,
  );
  core.info(`Final library versions to be tested: ${JSON.stringify(libPayloads)}`);

  return { trPayloads, libPayloads };
}

// ── Validate ──────────────────────────────────────────────────────────────────

async function executeValidation(trPayloads, libPayloads) {
  core.info("Running transformation test suite");

  const res = await testTransformationAndLibrary(trPayloads, libPayloads);
  logOutcome(res.data.result);

  if (res.data.result.failedTestResults.length > 0) {
    throw new Error("Failures occured while running tests against input events");
  }

  return res;
}

async function validateResults(successResults, draftTransformations) {
  core.info("Validating transformation outputs");

  const mismatches = [];
  const outputFiles = [];

  for (const entry of successResults) {
    const { transformerVersionID: versionKey } = entry;

    ensureDir();

    if (!Object.hasOwn(draftTransformations, versionKey)) {
      continue;
    }

    const actualOutput = entry.result.output.transformedEvents;
    const { name: trName } = draftTransformations[versionKey];
    const handle = _.camelCase(trName);

    outputFiles.push(writeFile(`${handle}_output.json`, actualOutput));

    if (!Object.hasOwn(draftTransformations[versionKey], "expected-output")) {
      continue;
    }

    const expectedFile = draftTransformations[versionKey]["expected-output"];
    const expectedOutput = expectedFile ? JSON.parse(fs.readFileSync(expectedFile)) : "";

    if (expectedOutput === "") continue;

    if (!isEqual(expectedOutput, actualOutput)) {
      core.info(`Test output do not match for transformation: ${trName}`);
      mismatches.push(`Test output do not match for transformation: ${trName}`);
      outputFiles.push(writeFile(`${handle}_diff.json`, detailedDiff(expectedOutput, actualOutput)));
    }
  }

  return { outputMismatchResults: mismatches, testOutputFiles: outputFiles };
}

// ── Deploy ────────────────────────────────────────────────────────────────────

async function uploadResults(outputFiles) {
  core.info("Storing test artifacts");
  const uploadResult = await artifactClient.uploadArtifact(
    "transformer-test-results",
    outputFiles,
    ".",
  );
  core.info(`Artifact stored with id: ${uploadResult.id}`);
}

async function deploy(trPayloads, libPayloads, commitRef) {
  core.info("Deploying transformation versions");
  await publish(trPayloads, libPayloads, commitRef);
}

// ── Entry ─────────────────────────────────────────────────────────────────────

async function pushDrafts(metaPath) {
  const { transformations, libraries } = readMetaFile(metaPath);
  const { remoteTransformations, remoteLibraries } = await loadRemoteState();

  const draftTransformations = await applyTransformations(
    transformations,
    mapByName(remoteTransformations),
  );
  const draftLibraries = await applyLibraries(libraries, mapByName(remoteLibraries));

  return { draftTransformations, draftLibraries };
}

async function validateAndDeploy(draftTransformations, draftLibraries) {
  const { trPayloads, libPayloads } = await buildPayloads(draftTransformations, draftLibraries);

  const { successTestResults } = (await executeValidation(trPayloads, libPayloads)).data.result;

  const { outputMismatchResults, testOutputFiles } = await validateResults(
    successTestResults,
    draftTransformations,
  );

  if (uploadArtifacts) await uploadResults(testOutputFiles);
  if (outputMismatchResults.length > 0) throw new Error(outputMismatchResults.join(", "));
  if (!testOnly) await deploy(trPayloads, libPayloads, commitId);
}

async function syncWorkflow(path = metaFilePath) {
  core.info("Initializing transformation sync workflow");

  const { draftTransformations, draftLibraries } = await pushDrafts(path);
  await validateAndDeploy(draftTransformations, draftLibraries);

  core.info("Transformation sync completed successfully");
}

module.exports = { syncWorkflow };
