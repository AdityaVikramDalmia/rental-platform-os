# Sign-out regression found during live verification

The initial `8a80742` rollout passed all five persona sign-ins. Live sign-out cleared
the app cookie but displayed the client error boundary until refresh. The new root
route redirects `/` to `/homepage`, while the existing sign-out action also targeted
`/`.

The failure was reproduced against the same image in a local production container.
An anonymous Server Action request returned:

```text
HTTP 303
Content-Type: text/x-component
X-Action-Redirect: /;push
Location: /homepage
```

Next 16's client followed the HTTP Location and received ordinary HTML, losing the
Server Action redirect metadata. Browser network evidence showed the final HTML
response and the client reported an unexpected server response. A refresh confirmed
the cookie had been cleared. This was a redirect-response problem, not failed
password authentication.

Commit `3b42a2726e8b1e748d2fdc432693d6879d7fdc9c` redirects sign-out directly to
`/homepage`, preserving cookie deletion and authorization. It adds
`scripts/check-signout-redirect.mjs`, a loopback-only production-response probe.
The probe fails against the original image; the corrected image must return the
direct `X-Action-Redirect` without an HTTP `Location` header.

After a local production build/server, run:

```bash
node scripts/check-signout-redirect.mjs --url http://127.0.0.1:3000
```

For a container build, pass its public `signOutAction` identifier with `--action-id`
instead of reading the host build's manifest. The probe sends no cookies or user
credentials and refuses non-loopback servers. Lint, TypeScript and the fourteen
focused auth regressions pass for the correction.

Hosted AuthKit SSO can retain the previous fixture identity across local app
sign-out. Browser QA isolates fixture identities by clearing cookies only for the
Rental OS and its staging AuthKit origins; this is separate from the app sign-out
response regression. No profile-wide browser reset or provider credential change
was performed.
