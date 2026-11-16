# Hive product direction

A short summary of the initial product plan. It is background for product decisions, not a
backlog. Nothing here is an assignment, and most of it is not built. The current app is T3 Code
under Hive branding, with every upstream feature and provider kept.

## Who it is for

Hive helps non-developers hand off everyday work, follow its progress, and review the result.
The first audiences are business and admin users, personal productivity users, and students.
The research supports business and personal admin more strongly than student needs. Typical
work: filling forms, collecting receipts, comparing options, monitoring websites, and turning
research into a spreadsheet.

Start from the result a person wants (applications prepared, invoices collected, a useful
comparison). People do not necessarily want to choose agents or build an automated process. The
[customer-needs research](https://github.com/B-a-1-a/agentic-ai-browser-agent-r-d/blob/main/Research/Product/browser-agent-market-and-customer-needs/customer-needs-synthesis.md)
challenged the early "agent orchestrator" framing on this point.

## Problems to solve

- **Getting started.** Setup is confusing and useful first tasks are unclear.
- **Access.** Logins, two-factor prompts, CAPTCHA, and site restrictions stop agents. Human
  takeover is the first answer.
- **Reliability.** Connections fail, work disappears, and tasks cannot resume.
- **Trust.** Agents report success without finishing. People need to see what happened, what
  failed, and what still needs attention: files, source links, confirmations, and clear partial
  results.
- **Control.** Work should continue unattended inside saved rules, then ask for approval before
  submissions, messages, purchases, and deletions.
- **Cost and reuse.** No surprise charges and no repeated instructions. Connect existing AI
  subscriptions where supported, show usage where available, and save instructions for repeat
  work. Not every subscription will work, and accurate cost estimates are not guaranteed.

## How work is organized

- A **workspace** (project) holds background shared by related tasks, such as a resume, role
  preferences, and general instructions. Example: "Job Applications".
- A **task** has its own conversation, progress, and results. Example: "Apply to today's open
  job postings".
- An **agent session** is one agent's working conversation and state inside a task.
- A subscription such as Codex is a **connection** that supplies agents. It is not the task.
- A **task profile** stores reusable instructions and preferences. A **browser profile** stores
  website sign-ins and account state, such as Personal or Work. They have separate controls.

## Planned experience

One main task conversation sits beside worker tiles. Each tile is an agent working inside the
selected task, not a separate project. Opening a tile shows its browser activity and allows
takeover. The person states an outcome; the agent proposes steps and workers that can be
inspected or adjusted.

Navigation: a workspace and task list, a shared **Needs you** inbox for approvals, login
requests, and other blockers, and a **results** view showing completed, blocked, skipped, and
failed items with evidence.

Journey: connect an agent, prepare website access, create a workspace, describe a task, review
the plan, let it run, handle approvals, review the result. After a useful run, save the
instructions or make the task a recurring routine.

## Open questions

- Teaching by demonstration, automatic model choice, built-in VPNs or proxies, and automatic
  CAPTCHA handling.
- The main success measure: speed, cost per task, or accuracy at a given cost.

## Technical direction

T3 Code is the starting codebase. `agent-browser` and `agent-desktop` are named as future
built-in tools for browser and computer control and are not added yet. Earlier proposals to
build around T3's browser, evaluate Stagehand, and prioritize Codex are no longer the plan. The
earlier PRD and wireframes were removed from `docs/product` and `docs/design` and remain in git
history.
