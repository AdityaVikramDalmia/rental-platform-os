# Provisioning runbook

These steps are for a maintainer after the auth and seed safeguards have been deployed to an isolated
demo deployment. They intentionally contain no passwords.

## 1. Select the deployment explicitly

Use `--deployment-name <demo-deployment>` or an environment file that names the demo deployment for
every Convex command. Do not rely on the shell's default deployment, and do not enable demo seeding on
a production or mixed-data deployment.

## 2. Configure creation-only passwords

The seed only uses these variables when the corresponding WorkOS account is missing:

- `DEMO_ADMIN_PASSWORD`
- `DEMO_GUARD_PASSWORD`
- `DEMO_OPS_PASSWORD`
- `DEMO_TENANT_PASSWORD`
- `DEMO_OWNER_PASSWORD`

Use a different generated value for every persona. Pipe each value through standard input so it is
not included in shell history:

```bash
read -rs DEMO_VALUE
printf '%s' "$DEMO_VALUE" | npx convex env set DEMO_TENANT_PASSWORD --deployment-name <demo-deployment>
unset DEMO_VALUE
```

Repeat with the other variable names. This configuration does not rotate an existing account.

## 3. Enable and run the internal seed

```bash
npx convex env set DEMO_SEEDING_ENABLED true --deployment-name <demo-deployment>
npx convex run seedDemo:mega '{}' --deployment-name <demo-deployment>
npx convex env set DEMO_SEEDING_ENABLED false --deployment-name <demo-deployment>
```

If the CLI cannot invoke the internal action for the installed Convex version, use a one-off
maintainer-only deployment command rather than reintroducing a public wrapper.

## 4. Rotate existing candidates deliberately

Existing account passwords are preserved by the seed. Rotate the four approved fixture accounts and
the new limited admin account individually in WorkOS. Generate a distinct value for each persona,
record it in the maintainer's approved secret store, and never pass it as a command-line argument or
commit it.

Create the limited admin in WorkOS and Convex through the normal authenticated admin workflow. Assign
only the `Demo Viewer` permissions approved in the isolation review. Do not reuse either Super Admin
identity.

## 5. Publish links only after verification

A public demo page can link directly to:

- `/admin/login`
- `/ops/login`
- `/guard/login`
- `/tenant/login`
- `/owner/login`

Publish the corresponding credential only after every check in [03-verification.md](03-verification.md)
passes on the deployed revision.
