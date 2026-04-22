# resources/llm-provider.yaml — Ollama (local)

For a local LLM via Ollama (useful for offline development), create an `llm-provider.yaml` component in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: llm-provider
spec:
  type: conversation.ollama
  version: v1
  metadata:
  - name: endpoint
    value: "http://localhost:11434"
  - name: model
    value: "llama3.2"
```

- The component name `llm-provider` is the value passed to `DaprChatClient(component_name="llm-provider")` in the agent code.
- Requires Ollama running locally (`ollama serve` after installation from [ollama.com](https://ollama.com/)).
- Pull the chosen model first: `ollama pull llama3.2`. Other tool-calling-capable models include `qwen2.5`, `llama3.1`, and `mistral-nemo`.
- No API key is required for local Ollama; no secret management needed.
