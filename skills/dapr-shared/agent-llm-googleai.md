# resources/llm-provider.yaml — Google AI (Gemini)

Native `dapr-agents` agents and .NET Microsoft Agent Framework agents both reach the LLM through a Dapr Conversation component. For Google AI (Gemini), create an `llm-provider.yaml` component in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: llm-provider
spec:
  type: conversation.googleai
  version: v1
  metadata:
  - name: key
    value: "{{GOOGLE_API_KEY}}"
  - name: model
    value: "gemini-2.0-flash"
```

- The component name `llm-provider` is the value passed to `DaprChatClient(component_name="llm-provider")` in Python, and to `conversationComponentName:` in .NET.
- `{{GOOGLE_API_KEY}}` is a Dapr template variable; set the `GOOGLE_API_KEY` environment variable before running `dapr run`. Do not hardcode the key in this file.
- `model` is optional and defaults to `gemini-1.5-flash`. Pick a tool-calling-capable Gemini model.
- `diagrid[<extra>]` framework-wrapper apps do not use this component: the wrapped framework calls Gemini directly with `GOOGLE_API_KEY` from the environment. `adk` uses Gemini natively; for other extras add the framework's Google package (for example `langchain-google-genai`, `pydantic-ai-slim[google]`), and `crewai` takes a LiteLLM model string such as `gemini/gemini-2.0-flash`.
- Optional metadata: `maxTokens` (default per-request token cap) and `responseCacheTTL` (in-memory response cache, e.g. `10m`). See the [GoogleAI conversation component reference](https://docs.dapr.io/reference/components-reference/supported-conversation/googleai/).
