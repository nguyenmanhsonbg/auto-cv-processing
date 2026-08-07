# SonarQube Local Monorepo Implementation Plan

**Goal:** Chạy SonarQube Community Build local bằng Docker và phân tích toàn bộ monorepo TypeScript/JavaScript bằng một SonarQube project.

**Architecture:** Tách SonarQube khỏi stack ứng dụng hiện tại bằng `docker-compose.sonar.yml`. Compose sẽ chạy PostgreSQL riêng, SonarQube với port host `9002`, và scanner Docker theo profile `scan`; scanner mount root repository vào `/usr/src` và kết nối tới `http://sonarqube:9000` trong network nội bộ.

**Tech Stack:** Docker Compose v2, SonarQube Community Build, PostgreSQL, SonarScanner CLI, NestJS/React/TypeScript monorepo, pnpm.

## Global Constraints

- Chỉ dùng `pnpm`, không dùng npm hoặc yarn.
- Không tạo hoặc sửa `*.spec.ts` / `*.test.ts`.
- Không chạy `pnpm build`, lint hoặc khởi động lại frontend/backend.
- Không dùng Git command.
- Không ghi Sonar token vào file cấu hình hoặc source control.
- Không áp dụng cấu hình coverage của Go; JS/TS chỉ dùng LCOV khi report thực tế tồn tại.

## Tasks

### Task 1: Add isolated SonarQube Docker stack

**Files:**
- Create: `docker-compose.sonar.yml`

Add `sonar-postgres`, `sonarqube`, and a `sonar-scanner` service under the `scan` profile. Persist SonarQube data, extensions, logs, and PostgreSQL data with named volumes. Map host port `9002` to SonarQube container port `9000`. Do not modify the application `docker-compose.yml`.

Verify with:

```powershell
docker compose -f docker-compose.sonar.yml config
```

### Task 2: Add monorepo analysis scope

**Files:**
- Create: `sonar-project.properties`

Configure project key `auto-cv-processing`, source roots `apps,packages`, UTF-8 encoding, explicit exclusions for dependencies, build output, generated artifacts, docs, storage, uploads, public assets, logs, and environment files. Configure current TypeScript projects through `sonar.typescript.tsconfigPaths`. Do not add a coverage path until a real LCOV report exists.

Verify that all configured paths exist and that the property file contains no token.

### Task 3: Start and verify SonarQube

Run:

```powershell
docker compose -f docker-compose.sonar.yml up -d sonar-postgres sonarqube
Invoke-RestMethod -Uri http://localhost:9002/api/system/status
```

Continue only when the response contains `status = UP`. Create a local SonarQube token and keep it only in the current PowerShell environment as `$env:SONAR_TOKEN`.

### Task 4: Run repository analysis

Run the scanner profile from the repository root:

```powershell
docker compose -f docker-compose.sonar.yml --profile scan run --rm sonar-scanner
```

The scanner must use `SONAR_HOST_URL=http://sonarqube:9000` inside the Compose network and receive `SONAR_TOKEN` from the environment. Verify that the scanner exits successfully and that the SonarQube project dashboard receives an analysis.

### Task 5: Verify project and quality gate

Run:

```powershell
Invoke-RestMethod -Uri "http://localhost:9002/api/qualitygates/project_status?projectKey=auto-cv-processing"
```

Record the actual Quality Gate result. A failed gate caused by pre-existing issues or missing coverage must be reported as a result, not hidden by weakening the scan configuration.

### Task 6: Repository verification and handoff

Run `pnpm typecheck` and inspect the required runtime logs if any application code or package configuration was changed. Confirm no application server was started or restarted. Report the created files, Docker container status, scanner output, dashboard URL, and Quality Gate status.
