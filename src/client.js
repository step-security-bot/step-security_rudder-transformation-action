const { default: http } = require("axios");
const core = require("@actions/core");

const baseUrl = core.getInput("serverEndpoint") || "https://api.rudderstack.com";

const ROUTES = {
  transformations: `${baseUrl}/transformations`,
  libraries: `${baseUrl}/libraries`,
  test: `${baseUrl}/transformations/libraries/test`,
  publish: `${baseUrl}/transformations/libraries/publish`,
};

const AGENT = "transformationAction";

function getCredentials() {
  return {
    username: core.getInput("email"),
    password: core.getInput("accessToken"),
  };
}

function buildConfig() {
  return { auth: getCredentials(), headers: { "user-agent": AGENT } };
}

function draftPath(base, id) {
  return id ? `${base}/${id}?publish=false` : `${base}?publish=false`;
}

function request(method, url, body) {
  return body !== undefined
    ? http[method](url, body, buildConfig())
    : http[method](url, buildConfig());
}

// Fetch

async function fetchLibraries() {
  core.info("Fetching workspace libraries");
  return request("get", ROUTES.libraries);
}

async function fetchTransformations() {
  core.info("Fetching workspace transformations");
  return request("get", ROUTES.transformations);
}

// Test and publish

async function runTests(transformations, libraries) {
  core.info("Executing test suite against transformation versions");
  return request("post", ROUTES.test, { transformations, libraries });
}

async function publishVersions(transformations, libraries, commitId) {
  core.info("Publishing workspace changes");
  return request("post", ROUTES.publish, { transformations, libraries, commitId });
}

module.exports = {
  request,
  draftPath,
  ROUTES,
  fetchLibraries,
  fetchTransformations,
  runTests,
  publishVersions,
};
