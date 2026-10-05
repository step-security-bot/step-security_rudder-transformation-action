const fs = require("fs");
const api = require("../src/api");
const { syncWorkflow } = require("../src/workflow");

jest.mock("../src/api", () => ({
  getAllTransformations: jest.fn(),
  getAllLibraries: jest.fn(),
  createTransformation: jest.fn(),
  createLibrary: jest.fn(),
  updateTransformation: jest.fn(),
  updateLibrary: jest.fn(),
  testTransformationAndLibrary: jest.fn(),
}));

jest.mock("@actions/core", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  getInput: jest.fn(),
}));

// ── Constants ─────────────────────────────────────────────────────────────────

const PATHS = {
  emptyConfig: "./__tests__/testdata/empty-config.json",
  syncConfig: "./__tests__/testdata/sync-config.json",
  expectedOutput: "./__tests__/testdata/expected-output.json",
  outputDiff: "./__tests__/testdata/output-diff.json",
};

const IDS = {
  tr: { id: "tr-abc-001", versionId: "tr-ver-001" },
  lib1: { id: "lib-abc-001", versionId: "lib-ver-001" },
  lib2: { id: "lib-abc-002", versionId: "lib-ver-002" },
};

const correctOutput = [
  { amount: 0, discount: 0, total: 0, city: "Berlin", region: "Brandenburg", country: "DE" },
  { amount: 50, discount: 10, total: 40, city: "unknown", region: "unknown", country: "unknown" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJSON(path) {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

function mockEmptyWorkspace() {
  api.getAllTransformations.mockResolvedValue([]);
  api.getAllLibraries.mockResolvedValue([]);
}

function mockExistingWorkspace() {
  api.getAllTransformations.mockResolvedValue({
    data: { transformations: [{ name: "OrderEnricher", id: IDS.tr.id }] },
  });
  api.getAllLibraries.mockResolvedValue({
    data: {
      libraries: [
        { name: "location", id: IDS.lib1.id },
        { name: "pricing", id: IDS.lib2.id },
      ],
    },
  });
}

function mockCreateResponses() {
  api.createTransformation.mockResolvedValue({ data: IDS.tr });
  api.createLibrary
    .mockReturnValueOnce({ data: IDS.lib1 })
    .mockReturnValueOnce({ data: IDS.lib2 });
}

function mockUpdateResponses() {
  api.updateTransformation.mockResolvedValue({ data: IDS.tr });
  api.updateLibrary
    .mockReturnValueOnce({ data: IDS.lib1 })
    .mockReturnValueOnce({ data: IDS.lib2 });
}

function mockTestPass(transformedEvents) {
  api.testTransformationAndLibrary.mockResolvedValue({
    data: {
      result: {
        successTestResults: [
          {
            transformerVersionID: IDS.tr.versionId,
            result: { output: { transformedEvents } },
          },
        ],
        failedTestResults: [],
      },
    },
  });
}

function mockTestFail() {
  api.testTransformationAndLibrary.mockResolvedValue({
    data: {
      result: {
        successTestResults: [],
        failedTestResults: [
          { id: "tr-ext-001", name: "external-transformation", error: '{"success": false}' },
        ],
      },
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("syncWorkflow", () => {
  afterEach(() => {
    fs.rmSync("./test-outputs", { recursive: true, force: true });
    jest.clearAllMocks();
  });

  describe("with an empty workspace", () => {
    beforeEach(() => {
      mockEmptyWorkspace();
      mockCreateResponses();
    });

    it("resolves immediately when config declares no resources", async () => {
      api.testTransformationAndLibrary.mockResolvedValue({
        data: { result: { successTestResults: [], failedTestResults: [] } },
      });

      await expect(syncWorkflow(PATHS.emptyConfig)).resolves.toBeUndefined();
    });

    it("creates each resource and writes the output file on success", async () => {
      mockTestPass(readJSON(PATHS.expectedOutput));

      await expect(syncWorkflow(PATHS.syncConfig)).resolves.toBeUndefined();

      expect(api.createTransformation).toHaveBeenCalledTimes(1);
      expect(api.createLibrary).toHaveBeenCalledTimes(2);
      expect(readJSON("./test-outputs/orderEnricher_output.json")).toEqual(
        readJSON(PATHS.expectedOutput),
      );
    });

    it("throws and writes a diff file when output diverges from expected", async () => {
      mockTestPass([
        { amount: 5, discount: 5, total: 0, city: "Berlin", region: "Brandenburg", country: "DE" },
        { amount: 50, discount: 10, total: 40, city: "unknown", region: "unknown", country: "unknown" },
      ]);

      await expect(syncWorkflow(PATHS.syncConfig)).rejects.toThrow(
        "Test output do not match for transformation: OrderEnricher",
      );
      expect(readJSON(PATHS.outputDiff)).toEqual(
        readJSON("./test-outputs/orderEnricher_diff.json"),
      );
    });
  });

  describe("with resources already in the workspace", () => {
    beforeEach(() => {
      mockExistingWorkspace();
      mockUpdateResponses();
    });

    it("patches each resource and writes the output file on success", async () => {
      mockTestPass(correctOutput);

      await expect(syncWorkflow(PATHS.syncConfig)).resolves.toBeUndefined();

      expect(api.updateTransformation).toHaveBeenCalledTimes(1);
      expect(api.updateLibrary).toHaveBeenCalledTimes(2);
      expect(readJSON("./test-outputs/orderEnricher_output.json")).toEqual(
        readJSON(PATHS.expectedOutput),
      );
    });

    it("throws when any transformation test fails", async () => {
      mockTestFail();

      await expect(syncWorkflow(PATHS.syncConfig)).rejects.toThrow(
        "Failures occured while running tests against input events",
      );
    });

    it("skips output validation for transformations outside the managed set", async () => {
      api.testTransformationAndLibrary.mockResolvedValue({
        data: {
          result: {
            successTestResults: [
              {
                transformerVersionID: IDS.tr.versionId,
                result: { output: { transformedEvents: correctOutput } },
              },
              {
                transformerVersionID: "tr-ext-ver-001",
                result: { output: { transformedEvents: [{}] } },
              },
            ],
            failedTestResults: [],
          },
        },
      });

      await expect(syncWorkflow(PATHS.syncConfig)).resolves.toBeUndefined();
    });
  });
});
