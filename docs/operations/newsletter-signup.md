# Footer newsletter signup

The footer's **Sign up** action saves the submitted address immediately in a private newsletter list. The address is unverified. The action doesn't create an account, issue a confirmation link, queue email, or grant permission for behavior-based campaigns. Old account and welcome preference links keep their original behavior. Keep existing opt-outs when qualifying any future newsletter sender.

The API accepts only the serving `www.helixskin.us` production deployment or the protected, child-backed development storefront. It reuses the existing role-bearing credential for the respective target. A returning address gets the same response as a new one. No browser can query the list or call its database function directly.

## Prepare the database for a release

Independently verify the actual project endpoint, the existing environment marker, and the original database owner. In an authenticated owner connection, run the reviewed installer in one transaction. The installer refuses a mismatched project and refuses to replace any existing objects.

```sh
psql -X -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET LOCAL helix.newsletter_project_ref = '$HELIX_NEWSLETTER_PROJECT_REF'" \
  -f supabase/operations/newsletter/install.sql
```

The protected forward release job records the adoption and verifies the installed routine and access controls. Run the installer separately on the production parent only with release authorization, before staging the build on `main`. Verify that the forward migration job passed before promoting the customer domain. The held deployment can't accept newsletter submissions.
