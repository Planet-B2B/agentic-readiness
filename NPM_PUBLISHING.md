# npm publishing

The public package is `agentic-scorecard`. Never place an npm write token in the repository or in a
GitHub Actions secret.

## Initial publication — completed for v0.1.0

npm requires the package to exist before a trusted publisher can be configured. The first release is
therefore a one-time direct publish by an authenticated maintainer with account-level two-factor
authentication:

```bash
npm login
npm whoami
npm ci
npm run check
npm publish --access public
```

Review `npm pack --dry-run` before publishing. Every published package and benchmark version is
immutable once published; release normative changes under a new versioned benchmark directory.

## Configure trusted publishing immediately afterward

Trusted publishing requires npm CLI 11.5.1 or newer, while the `npm trust` management command requires
npm CLI 11.15.0 or newer. Use Node 22.14 or newer and configure the exact GitHub workflow identity:

```bash
npm install --global npm@11.18.0
npm trust github agentic-scorecard \
  --repo Planet-B2B/agentic-readiness \
  --file publish-npm.yml \
  --env npm \
  --allow-publish \
  --yes
```

The equivalent npmjs.com Trusted Publisher fields are:

- Organization: `Planet-B2B`
- Repository: `agentic-readiness`
- Workflow filename: `publish-npm.yml`
- Environment: `npm`
- Allowed action: `npm publish`

The package must already exist, the maintainer must have npm 2FA, and the values are case-sensitive.

## Later releases

1. Update and validate the package version and immutable benchmark directory.
2. Merge the reviewed release commit.
3. Create and push the matching signed `vX.Y.Z` tag.
4. In GitHub Actions, select **Publish npm package**, choose that tag in “Use workflow from,” and
   confirm the npm distribution tag.
5. Verify the npm page, provenance attestation, package contents, and pinned install before creating
   the GitHub release announcement.

The workflow uses a GitHub-hosted runner, `id-token: write`, the exact public repository URL, and the
`npm` deployment environment. npm exchanges the OIDC identity for a short-lived publishing token and
automatically attaches provenance.
