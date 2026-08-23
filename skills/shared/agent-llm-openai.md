# resources/llm-provider.yaml — OpenAI

Native `dapr-agents` agents and .NET Microsoft Agent Framework agents both reach the LLM through a Dapr Conversation component. For OpenAI, create an `llm-provider.yaml` component in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: llm-provider
spec:
  type: conversation.openai
  version: v1
  metadata:
  - name: key
    value: "{{OPENAI_API_KEY}}"
  - name: model
    value: "gpt-4o-mini"
```

- The component name `llm-provider` is the value passed to `DaprChatClient(component_name="llm-provider")` in Python, and to `conversationComponentName:` in .NET.
- `{{OPENAI_API_KEY}}` is a Dapr template variable; set the `OPENAI_API_KEY` environment variable before running `dapr run`. Do not hardcode the key in this file.
- Swap `model` for any OpenAI chat model (`gpt-4o`, `gpt-4.1`, `gpt-4o-mini`). `gpt-4o-mini` is the cost-optimized default.
- `diagrid[<extra>]` framework-wrapper projects usually bypass this component and let the wrapped framework call OpenAI directly; they need `OPENAI_API_KEY` in the environment but not this yaml. They also do not emit `dapr_component_conversation_*` metrics — see [`agent-metrics-prometheus.md`](./agent-metrics-prometheus.md).
