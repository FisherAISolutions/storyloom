# Final launch smoke test

Use two new ordinary-user accounts and non-sensitive test photos. A single 6-page story is sufficient; do not spend credits on a 24- or 30-page launch test.

- [ ] Visit the production homepage while signed out; open Pricing, Privacy, Terms, and Support.
- [ ] Register User A, confirm the email if enabled, and log in.
- [ ] Create one character and confirm its private portrait renders.
- [ ] Generate one 6-page story in a non-default illustration style.
- [ ] Confirm all six pages and illustrations persist, then reopen it from Library.
- [ ] Edit one page's text and reload to confirm it persists.
- [ ] Reimagine one illustration and confirm the replacement persists.
- [ ] Generate and save one custom cover; confirm Library uses it.
- [ ] Translate the story and switch between English and the translation.
- [ ] Download the PDF and open it.
- [ ] Open Billing and confirm story/image used and remaining values changed as expected.
- [ ] Complete one controlled Family purchase after live cutover.
- [ ] Confirm the app remains Free while synchronization is pending, then changes only after the signed webhook updates the subscription.
- [ ] Open Customer Portal, return to Billing, and verify plan/status/period information.
- [ ] Log out and back in; confirm the character, story, subscription, and usage remain correct.
- [ ] Request a password reset, use the production email link, set a new password, and log in with it.
- [ ] Register User B. Confirm User B cannot open User A's story URL or retrieve User A's character/story images. Run the full two-user harness against a safe non-production clone if production probing is not approved.
- [ ] Check the homepage, Auth, Create, Library, Story Editor, Pricing, Billing, and legal pages on a phone-sized viewport.
- [ ] Review browser console and Supabase/Stripe function logs for unexpected errors or exposed sensitive detail.
