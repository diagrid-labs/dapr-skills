# Check LLM provider availability

Every agent needs at least one LLM provider reachable at runtime. Verify at least one of the four supported options is present.

Run these probes in parallel. **Do not print the value of any API key.** Every probe below reports only `set` or `unset` — never the key itself.

1. POSIX: `[ -n "${OPENAI_API_KEY}" ] && echo "set" || echo "unset"`. Windows: `powershell -Command "if ([string]::IsNullOrEmpty($env:OPENAI_API_KEY)) { 'unset' } else { 'set' }"`. `set` → OpenAI is available.
2. POSIX: `[ -n "${ANTHROPIC_API_KEY}" ] && echo "set" || echo "unset"`. Windows: `powershell -Command "if ([string]::IsNullOrEmpty($env:ANTHROPIC_API_KEY)) { 'unset' } else { 'set' }"`. `set` → Anthropic is available.
3. POSIX: `[ -n "${GOOGLE_API_KEY}" ] && echo "set" || echo "unset"`. Windows: `powershell -Command "if ([string]::IsNullOrEmpty($env:GOOGLE_API_KEY)) { 'unset' } else { 'set' }"`. `set` → Google Gemini is available.
4. `curl -sS -o /dev/null -w "%{http_code}" http://localhost:11434/api/tags --max-time 2` (Windows: `powershell -Command "(Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:11434/api/tags).StatusCode"`). Status `200` → Ollama is running locally.

**Never use `printenv`, `echo $VAR`, or `$env:VAR` as a bare expression to inspect a key — those print the value to stdout and leak the secret into any log, trace, or tool-output sink that captures shell output.**

### Reporting

- At least one probe passes → check passes. Report which providers are available; the `create-agent-python` / `create-agent-dotnet` skill will use the first one in that list, or the one the user selects during the interview.
- No probe passes → check fails. Inform the user they must set **at least one** of:
  - `OPENAI_API_KEY` — obtain from [platform.openai.com](https://platform.openai.com/api-keys)
  - `ANTHROPIC_API_KEY` — obtain from [console.anthropic.com](https://console.anthropic.com/)
  - `GOOGLE_API_KEY` — obtain from [ai.google.dev](https://ai.google.dev/)
  - Run [Ollama](https://ollama.com/) locally with `ollama serve`

Do not echo the key values. Only report whether each variable is set / endpoint is reachable.
