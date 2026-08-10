# Backend SonarQube Coverage Design

## Goal

Generate an LCOV coverage report from the repository's existing backend Jest test suite and make the local SonarQube scanner import that report for JavaScript/TypeScript analysis.

## Scope

- Use the existing `apps/backend` Jest setup and `test:cov` script.
- Add the SonarQube JavaScript/TypeScript LCOV report path to `sonar-project.properties`.
- Keep frontend and extension coverage out of this change because they do not currently have a compatible coverage script.
- Do not create or modify any test files.
- Do not change the Quality Gate threshold or exclude source code to make the gate pass.

## Design

Jest will execute the existing backend `*.spec.ts` suite with its already configured `--coverage` mode. A small backend script will preserve Jest's native report at `apps/backend/coverage/lcov.info`, normalize its `SF:` source paths from backend-relative paths to repository-relative paths, and write `apps/backend/coverage/sonar-lcov.info`. The existing Sonar scanner volume mounts the `apps` directory, so the scanner container can read that normalized report without a Docker Compose change.

`sonar-project.properties` will set:

```properties
sonar.javascript.lcov.reportPaths=apps/backend/coverage/sonar-lcov.info
```

The existing coverage exclusion for `**/coverage/**` remains; it excludes the generated report directory from source analysis while the LCOV property imports the report as test data.

## Verification and acceptance criteria

1. `pnpm --filter @interview-assistant/backend test:cov` completes and creates `apps/backend/coverage/lcov.info`.
2. The LCOV file is non-empty and contains `SF:` source file records.
3. `pnpm typecheck` is run; any pre-existing failures are reported without modifying unrelated code.
4. Existing backend/frontend runtime logs are checked, and the existing backend/frontend endpoints remain reachable.
5. SonarScanner completes with `EXECUTION SUCCESS`.
6. The scanner log confirms that the LCOV report was imported, or SonarQube project measures show a non-zero coverage value when the report contains covered executable lines.
7. The dashboard still evaluates all existing quality rules; this change does not artificially mark issues resolved or weaken the Quality Gate.

## Limitations

The resulting coverage measures only backend code exercised by the existing Jest tests. Frontend and extension source code remain without coverage data until those applications receive compatible test coverage tooling and test execution. Therefore, this change may not be sufficient to satisfy an 80% monorepo-wide New Code Quality Gate. Existing failing tests can also prevent the report from representing a complete test run; the wrapper preserves Jest's exit status while still normalizing any report Jest produced for diagnostic use.
