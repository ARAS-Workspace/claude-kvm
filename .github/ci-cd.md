# CI/CD

## Integration Tests

| Workflow                             | Trigger | Runner                | Output                                 |
|--------------------------------------|---------|-----------------------|----------------------------------------|
| `integration-test.yml`               | manual  | macos-26 + DO droplet | `test-artifacts`                       |
| `mac-integration-test.yml`           | manual  | macos-26              | `test-artifacts-mac`                   |
| `mac-calculator-test.yml`            | manual  | macos-26              | `test-artifacts-calculator`            |
| `mac-scientific-calculator-test.yml` | manual  | macos-26              | `test-artifacts-scientific-calculator` |
| `mac-chess-test.yml`                 | manual  | macos-26              | `test-artifacts-chess`                 |
| `mac-chess-direct-test.yml`          | manual  | macos-26              | `test-artifacts-chess-direct`          |
| `mac-drag-drop-test.yml`             | manual  | macos-26              | `test-artifacts-drag-drop`             |
| `mac-safari-browsing-test.yml`       | manual  | macos-26              | `test-artifacts-safari-browsing`       |
| `mac-install-phantom-test.yml`       | manual  | macos-26              | `test-artifacts-install-phantom`       |

## Asset Generation

| Workflow                         | Trigger         | Runner        | Output                   |
|----------------------------------|-----------------|---------------|--------------------------|
| `generate-demo-assets.yml`       | manual (run_id) | ubuntu-latest | Demo GIF/MP4 → press-kit |
| `generate-demo-assets-mac.yml`   | manual (run_id) | ubuntu-latest | Demo GIF/MP4 → press-kit |
| `generate-test-assets-chess.yml` | manual          | ubuntu-latest | Test assets → press-kit  |

## Publish & Deploy

| Workflow                | Trigger                    | Runner        | Output                           |
|-------------------------|----------------------------|---------------|----------------------------------|
| `publish.yml`           | manual (patch/minor/major) | ubuntu-latest | npm publish (OIDC) + git tag     |
| `persist-artifacts.yml` | manual (run_id)            | ubuntu-latest | Zip artifacts → press-kit branch |

## Repository Management

| Workflow            | Trigger                        | Runner        | Output                 |
|---------------------|--------------------------------|---------------|------------------------|
| `auto-close-pr.yml` | `pull_request_target` (opened) | ubuntu-latest | Close unauthorized PRs |

## Notes

- **Integration tests** use Claude as executor and Qwen-VL as observer
- `integration-test.yml` creates a DigitalOcean droplet (Xvfb + XFCE + x11vnc), others run native macOS
- **persist-artifacts** downloads artifacts from a test run, zips them, and commits to `press-kit` branch under `artifacts/{run_id}/`
- **deploy-www.yml** lives on `press-kit` branch: extracts zips, re-encodes MP4 for Safari/iOS, generates directory indexes, deploys to Cloudflare Pages
- All test workflows upload screenshots + screen recording as artifacts