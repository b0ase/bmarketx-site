# Name claims: a bare name belongs to whoever owns that handle elsewhere

For bWalletX (paymail aliases, bChat handles, the names plan in `docs/NAMES.md`) and bMarketX (`/str/<name>` store
addresses). 27 Oct 2026. Answers the open question "reserved and brand names" in `docs/NAMES.md`.

## The problem

A hand-kept list of famous names (elon, craigwright…) doesn't scale. "elonmoist" is Josh Petty's handle; there are
millions of creators, sellers and brands like him. We can't list them, and we shouldn't let someone else take their
name first.

## The rule

When someone asks for a bare name `N` (e.g. `elonmoist@bwalletx.com`, `bmarketx.com/str/elonmoist`):

1. Normalise `N` (see "Look-alikes").
2. Check whether `N` is an existing handle on a **source** platform (start with X; see "Sources").
3. **Not found anywhere:** first come, first served, as today.
4. **Found:** `N` is **held for that handle's owner**. It can only be claimed by proving control of that account:
   sign in with it (OAuth), which bWalletX already does for X and Google. The proof binds `N` to the claimant's
   identity key, the same way `.x` names work today (`b0asex.x@bwalletx.com`), but for the bare name.
5. **System and house names** (bwalletx, bmarketx, bchatx, admin, support, help, security, and every b*X service) are
   never released.

No list to maintain. Every creator, small seller and famous person is covered by the account they already have.

## Sources

| Source | Proof | Status |
|---|---|---|
| X | OAuth (already linked in bWalletX; `.x` names) | Start here |
| Google / YouTube | OAuth (Google already linked) | Next |
| GitHub | OAuth | $401 provider |
| eBay | Code in the eBay store description (built on bMarketX: `api/import/claim.js`), later Sign in with eBay | bMarketX now |
| Domains (brands) | File at `https://<domain>/.well-known/bwalletx-name.txt` or a DNS TXT record | Brands without social accounts |

The six $401 providers are the natural list; each one added widens the protection.

## Look-alikes

Hold the same name across trivial variants so the rule can't be dodged:

- case, dots, dashes, underscores and spaces (`Elon.Musk`, `elon_musk`)
- digit and character swaps (`e1onmusk`, `cralgwright`): a confusables map
- common wrappers: `real…`, `the…`, `…official`, `…hq`, `…tv`

A held name's variants are held for the same owner.

## Decisions for the owner

1. **Which platforms count at launch.** Recommendation: X only (already wired), then Google/YouTube, then the rest.
2. **Threshold.** Hold every existing X handle, or only those with a verified badge or above N followers (e.g. 1,000)?
   - Every handle: fairest; locks many dead names; existence checks are cheap.
   - Threshold: frees dead names; needs X API reads for follower counts, which cost money.
   - Middle path: hold every handle at request time; release a held name after 12 months if its owner never claims
     and it fails the threshold.
3. **Names already issued** first-come stay put unless a dispute shows clear impersonation.

## Veriff: disputes only

KYC (Veriff, roughly $1–2 a check) is for exceptions, never the default sign-up step:

- a public figure without that handle on any source (the name is held manually after review);
- an impersonator got the X handle first;
- two people with genuinely the same name.

Outcome of a dispute: the name moves to the verified person; the old holder keeps their identity key and history
(`docs/NAMES.md`: "the name moves, the identity never does") and everyone who dealt with the name sees
"$name is now a different person".

## Never sell held names

Held names are released only to their owner, free. Holding famous names to sell back is cybersquatting (trademark
and passing-off risk) and would undercut the trust the system is built on: "your name is waiting for you, and only you
can claim it".

## Where it lives

- **Check:** one shared function (bit-sign or the paymail server): `nameStatus(N) → free | held:{source, handle} | house`,
  cached, used by the paymail alias register, bChat handles, OpNS/name tokens and bMarketX store addresses.
- **Claim:** the existing link-account flow (X/Google OAuth) gains "and claim the bare name".
- **bMarketX:** `/str/<name>` uses `nameStatus` too. Today an unclaimed eBay name shows "Unclaimed store, sign in to
  claim" and a proved eBay owner already wins the address over an unverified CSV store (`api/import/claim.js`).

## Not in scope here

Name tokens, resale fees and the cool-down after a sale stay in `docs/NAMES.md`.
