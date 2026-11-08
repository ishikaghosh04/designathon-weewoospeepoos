# Packed Like Sardines

A browser-based ocean where you can draw a fish, explore activity hotspots, and open the octopus event board. Campus profiles are an optional Supabase integration. The drawing studio and ocean run in local mode with the default configuration.

## Run the site

Install Node.js if needed. In a terminal opened at the project folder, run:

```sh
npx http-server . -p 8000 -c-1
```

Open [the local preview](http://127.0.0.1:8000). Keep the terminal open while using the site. Use the web address even when running the project on your computer.

## Enable campus accounts

1. Create or open a Supabase project. In its **SQL Editor**, run [the campus profiles migration](supabase/migrations/20261108000000_campus_profiles.sql) once. It creates the profile table, restricted functions, and private fish image bucket.
2. In the SQL Editor, add the university email domain you want to allow. Replace both example values below with your campus domain and a short campus identifier. Use the same identifier for any additional domains that belong to that university.

   ```sql
   insert into campus_private.campus_domains (domain, campus)
   values ('students.example.edu', 'example-university');
   ```

   Use exact domains, without the `@`. The database checks the confirmed email on the Supabase account. This verifies access to an approved email address.
3. In **Authentication**, enable email sign-in and leave email confirmation on. Edit the **Magic Link** email template so it shows the one-time code using `{{ .Token }}`. Use the same code in the **Confirm signup** template if your project sends it to new accounts. Configure custom SMTP before inviting campus users. Supabase's default email service is restricted to project team addresses. [Email codes](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp)
4. In [campus-config.js](campus-config.js), set the project URL and its `sb_publishable_…` key. Keep admin and service-role credentials out of the website. Reload the site and choose **Campus sign-in** in the existing drawing studio. The campus controls appear only when the two config values are filled in. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
5. Sign in with the emailed code. Add and reorder your cards in **Campus profile**, then choose **Save private draft**. Draw your fish and use the existing **Release into the ocean** button to publish the fish and the saved cards. If your profile already has an avatar, you can publish edits using **Release saved fish**. Campus members can click a shared fish to read its profile.

If you publish the site, include the configured `campus-config.js` and the other site files on the static host. The browser talks directly to Supabase. The existing café matchmaking service has its own [run and deployment guide](lobby/README.md).

## Test with two accounts

- In browser profile A, sign in with an approved address. Save a private draft and draw and release a fish.
- In browser profile B, sign in with a different approved address at the same university. Enter the ocean and click A's fish. The published cards should appear, and **Campus profile** should edit B's own profile.
- Back in A, save another private draft. Re-enter the ocean in B. A's shared fish should disappear until A releases it again.
- Repeat with a signed-out browser and a verified email from a different campus. Each should see only what its permissions allow.

## Where the data lives

Supabase stores one profile per account, with its ordered cards and the path to the current fish PNG. Only approved members of the same campus can read published profiles and their images. Private drafts and unpublished images are readable by their owner. The app downloads images through the authenticated Storage API.

The ocean refreshes on entry. Local drawings, activity check-ins, and the octopus event board still use browser storage. Those features can be connected to accounts separately.
