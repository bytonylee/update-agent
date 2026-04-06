# opencli Example: Fetching @bcherny's X Profile & Posts

## Profile

| Field | Value |
|-------|-------|
| Name | Boris Cherny |
| Handle | @bcherny |
| Bio | Claude Code @anthropicai |
| Location | San Francisco |
| Followers | 341,198 |
| Following | 130 |
| Tweets | 1,414 |
| Verified | Yes |
| Website | https://borischerny.com |
| Account Created | June 25, 2010 |

## Recent Posts (sorted by engagement)

| Date | Post | Likes | Views |
|------|------|------:|------:|
| Mar 24 | Story about Anthropic Labs team shipping MCP, Skills, Claude Desktop, Claude Code. Announces full computer use in Cowork and Dispatch. | 9,273 | 974K |
| Mar 14 | "We doubled Claude usage on weekends, and outside 5–11am PT on weekdays for the next 2 weeks." | 7,361 | 551K |
| Mar 24 | "no 👏 more 👏 permission prompts 👏" | 5,562 | 447K |
| Mar 17 | "Really great writeup" | 4,471 | 854K |
| Mar 25 | "Today was a good day" (with image) | 3,584 | 517K |
| Mar 18 | "Can't wait for this!" | 1,647 | 341K |

## Commands Used

```bash
# Fetch profile
node dist/main.js twitter profile bcherny -f json

# Search recent posts
node dist/main.js twitter search "from:bcherny" --limit 10 -f json
```

## Notes

- Requires the OpenCLI Browser Bridge Chrome extension to be installed and connected
- The extension communicates with a local daemon on port 19825 via WebSocket
- Twitter commands use browser cookie authentication (must be logged into x.com in Chrome)
