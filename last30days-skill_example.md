# last30days-skill Example: @bcherny X Posts

Research performed using [mvanhorn/last30days-skill](https://github.com/mvanhorn/last30days-skill) bird-search client on 2026-03-27.

## Summary

Boris Cherny (@bcherny) is an engineer/lead on the Claude Code team at Anthropic. He is also the author of *Programming TypeScript*. His recent X activity is heavily focused on Claude Code — engaging with users on bugs, features, and product questions.

## Highlights

### Most Viral Posts

| Post | Likes | RTs | Date |
|------|-------|-----|------|
| ["no"](https://x.com/bcherny/status/2036987720321712438) (reply to @UltraLinx) | 1,864 | 27 | Mar 26 |
| ["it me"](https://x.com/bcherny/status/2036683077670609267) (reply to @bytebrujo with a guanaco/typechecker joke) | 2,833 | 12 | Mar 25 |

### Claude Code Related

- **Code review workflow**: "Claude Code review finds 99%+ of the bugs, then an engineer sanity checks Claude didn't miss something obvious" (31 likes) — [link](https://x.com/bcherny/status/2036814131312165058)
- **100% auto mode**: Confirmed using Claude Code in full auto mode (83 likes) — [link](https://x.com/bcherny/status/2036650657881764135)
- **Bug fix release**: "This was fixed in yesterday's release. `claude update` to make sure you're on the latest" (77 likes) — [link](https://x.com/bcherny/status/2036669513924821496)
- **Team appreciation**: "best team" (51 likes) — [link](https://x.com/bcherny/status/2036665915828519254)
- **Debugging**: Working on speculative fixes for a statusline-related issue with @alexjcampbell — [link](https://x.com/bcherny/status/2037345143066648588)
- **Windows support**: "Windows coming soon. No announcement/eta yet." — [link](https://x.com/bcherny/status/2037042896395002322)
- **Cloud reliability**: "Reliability for cloud has improved significantly the last few weeks" — [link](https://x.com/bcherny/status/2037194911037235660)

## Method

Searched using the bundled Bird client (free X search):

```bash
node scripts/lib/vendor/bird-search/bird-search.mjs "from:bcherny" --count 20 --json
```

Requires `AUTH_TOKEN` and `CT0` cookies from x.com (set as environment variables or passed via CLI flags).
