[![StepSecurity Maintained Action](https://raw.githubusercontent.com/step-security/maintained-actions-assets/main/assets/maintained-action-banner.png)](https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions)

# RudderStack Transformation Sync

Sync and validate RudderStack transformations and libraries directly from your repository. The action tests each transformation version against real events before publishing — so output regressions are caught in CI, not in production.

Supports `javascript` and `pythonfaas` (Python) transformations.

---

## Setup

### 1. Get your credentials

From the RudderStack dashboard go to **Settings → Access Tokens** and create a Service Access Token with **Admin** permissions. You'll also need the email address associated with the workspace.

Store both as [GitHub encrypted secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository) before adding the workflow step.

### 2. Create a meta file

The meta file declares which transformations and libraries to sync. Place it anywhere in your repo and point `metaPath` at it.

```json
{
  "libraries": [
    {
      "file": "./transformations/priceUtils.js",
      "name": "priceUtils",
      "description": "Price calculation helpers",
      "language": "javascript"
    }
  ],
  "transformations": [
    {
      "file": "./transformations/enrichOrder.js",
      "name": "EnrichOrder",
      "description": "Enriches order events with pricing data",
      "language": "javascript",
      "test-input-file": "./transformations/events.json",
      "expected-output": "./transformations/expected.json"
    }
  ]
}
```

### 3. Add the workflow step

```yaml
- name: Sync RudderStack transformations
  uses: step-security/rudder-transformation-action@v1
  with:
    email: ${{ secrets.RUDDERSTACK_EMAIL }}
    accessToken: ${{ secrets.RUDDERSTACK_ACCESS_TOKEN }}
    metaPath: ./transformations/meta.json
```

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `email` | yes | | Workspace owner email |
| `accessToken` | yes | | Service Access Token with Admin permissions |
| `metaPath` | yes | | Path to your meta JSON file |
| `serverEndpoint` | no | `https://api.rudderstack.com` | Override for self-hosted or GDPR-region instances |
| `uploadTestArtifact` | no | `false` | Upload test outputs and diffs as GitHub artifacts |

---

## What the action does

On every run:

1. Parses your meta file to find which transformations and libraries to sync.
2. Creates or updates each resource in the workspace in draft (unpublished) state.
3. Runs the configured test suite against the draft versions.
4. Compares actual output to expected output — writes a diff file for any mismatch.
5. Aborts if any test fails or any output mismatches.
6. Publishes all resources once every check passes.

---

## Meta file schema

### Transformation fields

| Field | Required | Description |
|---|---|---|
| `file` | yes | Path to the transformation source file |
| `name` | yes | Name as it appears in your RudderStack workspace |
| `language` | yes | `javascript` or `pythonfaas` |
| `description` | no | Optional description |
| `test-input-file` | no | JSON array of events to run the transformation against |
| `expected-output` | no | JSON array of expected output — action fails on mismatch |

### Library fields

| Field | Required | Description |
|---|---|---|
| `file` | yes | Path to the library source file |
| `name` | yes | Import name used in transformation code (`import { fn } from "name"`) |
| `language` | yes | `javascript` or `pythonfaas` |
| `description` | no | Optional description |

All file paths are resolved from the repository root.

---

## Artifacts

When `uploadTestArtifact: "true"` is set, the action uploads a `transformer-test-results` artifact containing:

- `<camelCaseName>_output.json` — actual transformed events (written for every transformation with a test input)
- `<camelCaseName>_diff.json` — diff between expected and actual (written only on mismatch)
