# AgentRouter for DeepSeek Harness

Find a provider tool, see its current price, and decide whether to spend from your AgentRouter wallet. The two catalog tools are free and work as soon as the plugin loads. Try the [Google organic search tool](https://www.agentrouter.to/tools/dataforseo.serp_google_organic?utm_source=dsh&utm_medium=plugin) or browse the [AgentRouter catalog](https://www.agentrouter.to/tools?utm_source=dsh&utm_medium=plugin).

## Install

Use DeepSeek Harness `0.2.2-rc.5`, Node.js 24.9 or later, and pnpm. Add the bundle to your local Web profile, then start DSH.

```sh
dsh plugin --profile web add -w github:pageonelab/agentrouter-dsh
dsh --profile web
```

For a local checkout, replace the GitHub spec with its absolute directory. The `-w` selects DSH's profile workspace. To remove the bundle, run `dsh plugin --profile web remove -w agentrouter-dsh`.

## Try a free price preview

> Use the AgentRouter competitor brief. Compare vercel.com and netlify.com for “frontend hosting” in US English. Quote one Google search and one Reddit search per brand. Stop after the quote.

DSH can call `agentrouter_find` to find a provider and `agentrouter_describe` to read the input schema, current price and billing rules. The bundled `agentrouter-competitor-brief` skill also covers source links, dates and receipts.

## Run an approved query

1. Create a key with the `read` and `invoke` scopes in your [AgentRouter account settings](https://www.agentrouter.to/settings/api?utm_source=dsh&utm_medium=plugin). Set `AGENTROUTER_API_KEY` in the DSH host's local credentials or launch environment. Keep the key out of chat, repository files and shared profiles. Use a personal DSH profile because every session sharing the key uses the same wallet.
2. Optionally specify a USD budget. For each `agentrouter_invoke`, DSH requests a one-time decision showing the provider tool, input and either the explicit ceiling or actual-usage billing. The plugin sends the approved request to the AgentRouter HTTPS API. AgentRouter enforces the per-call USD ceiling. Use an interactive approval policy with a human answerer for wallet-enabled profiles.
3. Use `agentrouter_get_run` with the returned run ID to read status, charge and result. A retry of the same logical call must retain its idempotency key and arguments. Large results can be exported with the AgentRouter CLI under the same account.

See [AgentRouter examples with receipts](https://docs.agentrouter.to/examples?utm_source=dsh&utm_medium=plugin) and the [DeepSeek Harness bundle specification](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/docs/user/develop/basic/publish.md).
