# Contributing

Thank you for helping improve Recruiter AI Assistant.

## Development Workflow

1. Create a focused branch from `main`.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and use local or test-only credentials.
4. Make the smallest change that fully addresses the issue.
5. Run `npm run build` before opening a pull request.
6. Review the staged diff for credentials, personal data, generated files, and unrelated changes.

## Pull Requests

Pull requests should include:

- A concise description of the problem and solution
- Relevant validation steps and results
- Screenshots for visible interface changes
- Any database, environment, privacy, or deployment considerations

Keep pull requests scoped to one logical change. Do not include local databases, browser sessions, credentials, real candidate data, private community information, or proprietary recruiting content.

## Coding Standards

- Use TypeScript for application code.
- Follow the existing Next.js App Router structure and naming conventions.
- Keep API validation explicit and return actionable error responses.
- Prefer deterministic behavior when an external AI service is unavailable.
- Preserve accessibility and the Hebrew RTL interface unless a change explicitly targets localization.

## Responsible Integrations

Changes involving social networks, messaging platforms, scraping, or browser automation must respect user authorization, platform terms, rate limits, privacy obligations, and anti-spam requirements.
