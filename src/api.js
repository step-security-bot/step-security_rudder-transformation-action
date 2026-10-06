const { fetchTransformations, fetchLibraries, runTests, publishVersions } = require("./client");
const { addTransformation, patchTransformation, addLibrary, patchLibrary } = require("./resources");

module.exports = {
  getAllTransformations: fetchTransformations,
  getAllLibraries: fetchLibraries,
  createTransformation: addTransformation,
  createLibrary: addLibrary,
  updateTransformation: patchTransformation,
  updateLibrary: patchLibrary,
  testTransformationAndLibrary: runTests,
  publish: publishVersions,
};
