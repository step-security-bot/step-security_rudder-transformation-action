const core = require("@actions/core");
const { request, draftPath, ROUTES } = require("./client");

// Libraries

async function patchLibrary(id, description, code, language) {
  core.info(`Patching library: ${id}`);
  return request("post", draftPath(ROUTES.libraries, id), { description, code, language });
}

async function addLibrary(name, description, code, language) {
  core.info(`Registering new library: ${name}`);
  return request("post", draftPath(ROUTES.libraries), { name, description, code, language });
}

// Transformations

async function patchTransformation(id, name, description, code, language) {
  core.info(`Patching transformation: ${name}`);
  return request("post", draftPath(ROUTES.transformations, id), { description, code, language });
}

async function addTransformation(name, description, code, language) {
  core.info(`Registering new transformation: ${name}`);
  return request("post", draftPath(ROUTES.transformations), { name, description, code, language });
}

module.exports = { patchLibrary, addLibrary, patchTransformation, addTransformation };
